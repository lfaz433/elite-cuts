import { useId, useRef, useState, type FormEvent } from 'react';
import { bookingFieldsFor, type PublicFreelancerPage } from '../../lib/marketplace/publicFreelancer';
import { ensureGuestBookingSession } from '../../lib/marketplace/guestBookingSession';
import {
  requestPublicFreelancerBooking,
  type HomeAddress,
  type PublicFreelancerBookingInput,
  type PublicFreelancerBookingResult,
} from '../../lib/marketplace/bookings';
import type { AppointmentMode } from '../../lib/marketplace/freelancerRecords';

type Contact = { serviceId: string; slot: string; clientName: string; clientEmail: string; clientPhone: string };
type Draft = Contact & (
  | { appointmentMode: 'chair' }
  | { appointmentMode: 'home'; approximateArea: string; homeAddress: HomeAddress }
);
const modeLabels = { home: 'À domicile', chair: 'Au fauteuil' };
const controlClass = 'mt-2 min-h-12 w-full rounded-xl border border-white/20 bg-[#151515] px-3 py-3 text-base text-white focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 disabled:opacity-50';
const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const slotDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function initialDraft(page: PublicFreelancerPage): Draft {
  const contact = { serviceId: page.services[0]?.id ?? '', slot: '', clientName: '', clientEmail: '', clientPhone: '' };
  return page.workModes.chair ? { ...contact, appointmentMode: 'chair' }
    : { ...contact, appointmentMode: 'home', approximateArea: '', homeAddress: { line1: '', city: '', postalCode: '' } };
}

function bookingFailure(error: unknown): { kind: 'security' | 'slot' | 'profile' | 'retry'; message: string } {
  const record = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message : '';
  if (code.startsWith('appCheck/') || code === 'functions/unauthenticated' || /app[ -]?check/i.test(message)) {
    return { kind: 'security', message: 'La vérification de sécurité a échoué. Actualisez la page puis réessayez.' };
  }
  if (code === 'functions/not-found' || (code === 'functions/failed-precondition' && /professional booking details|commercial workplace/i.test(message))) {
    return { kind: 'profile', message: 'Ce profil n’est plus disponible pour une réservation. Revenez plus tard.' };
  }
  if (code === 'functions/failed-precondition' && /time is no longer available|appointment time has passed/i.test(message)) {
    return { kind: 'slot', message: 'Ce créneau n’est plus disponible. Choisissez un autre créneau.' };
  }
  return { kind: 'retry', message: 'Impossible d’envoyer votre demande pour le moment. Vous pouvez réessayer.' };
}

function resultMessage(status: PublicFreelancerBookingResult['status']): string {
  switch (status) {
    case 'pending_approval': return 'Votre demande attend la confirmation du professionnel.';
    case 'confirmed': return 'Votre rendez-vous est confirmé.';
    case 'completed': return 'Ce rendez-vous est terminé.';
    case 'declined': return 'Cette demande a été refusée.';
    case 'cancelled': return 'Cette demande a été annulée.';
    default: return 'Cette demande n’est plus active.';
  }
}

export default function GuestFreelancerBookingForm({ page }: { page: PublicFreelancerPage }) {
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(page));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [unavailableSlots, setUnavailableSlots] = useState<string[]>([]);
  const [profileUnavailable, setProfileUnavailable] = useState(false);
  const [result, setResult] = useState<PublicFreelancerBookingResult | null>(null);
  const submitting = useRef(false);
  // Keep an unchanged retry idempotent if the server committed before a network
  // interruption. No contact or address data is stored in this reference.
  const requestId = useRef<string | null>(null);
  const fields = bookingFieldsFor(draft.appointmentMode);
  const slots = page.slots.filter(slot => slot.appointmentMode === draft.appointmentMode && !unavailableSlots.includes(slot.value));

  function edit(next: Draft) {
    if (submitting.current) return;
    requestId.current = null;
    setError('');
    setDraft(next);
  }

  function changeMode(mode: AppointmentMode) {
    if (!page.workModes[mode]) return;
    const contact: Contact = {
      serviceId: draft.serviceId, slot: '', clientName: draft.clientName,
      clientEmail: draft.clientEmail, clientPhone: draft.clientPhone,
    };
    // Construct a fresh discriminated value: switching to chair removes all
    // home data from both the rendered fields and the in-memory draft.
    edit(mode === 'chair' ? { ...contact, appointmentMode: 'chair' }
      : { ...contact, appointmentMode: 'home', approximateArea: '', homeAddress: { line1: '', city: '', postalCode: '' } });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || result || profileUnavailable) return;
    const slot = slots.find(slot => slot.value === draft.slot);
    if (!page.workModes[draft.appointmentMode] || !page.services.some(service => service.id === draft.serviceId) || !slot) {
      setError('Choisissez un service et un créneau disponible.'); return;
    }
    if (!draft.clientName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.clientEmail.trim()) || !draft.clientPhone.trim()
      || (draft.appointmentMode === 'home' && (!draft.approximateArea.trim() || !draft.homeAddress.line1.trim() || !draft.homeAddress.city.trim()))) {
      setError('Complétez vos coordonnées et les champs obligatoires avant d’envoyer la demande.'); return;
    }
    const [date, time] = slot.value.split('T');
    submitting.current = true;
    setPending(true); setError('');
    try {
      await ensureGuestBookingSession();
      requestId.current ??= crypto.randomUUID();
      const input: PublicFreelancerBookingInput = {
        publicSlug: page.publicSlug, serviceId: draft.serviceId, appointmentMode: draft.appointmentMode,
        date, time, clientName: draft.clientName.trim(), clientEmail: draft.clientEmail.trim(), clientPhone: draft.clientPhone.trim(),
        ...(draft.appointmentMode === 'home' ? {
          approximateArea: draft.approximateArea.trim(),
          homeAddress: {
            line1: draft.homeAddress.line1.trim(), city: draft.homeAddress.city.trim(),
            ...(draft.homeAddress.postalCode?.trim() ? { postalCode: draft.homeAddress.postalCode.trim() } : {}),
          },
        } : {}),
        clientRequestId: requestId.current,
      };
      const saved = await requestPublicFreelancerBooking(input);
      setResult(saved);
      setDraft(initialDraft(page));
      requestId.current = null;
    } catch (error) {
      const failure = bookingFailure(error);
      setError(failure.message);
      if (failure.kind === 'slot') {
        setUnavailableSlots(previous => [...previous, slot.value]);
        setDraft(previous => ({ ...previous, slot: '' }));
        requestId.current = null;
      }
      if (failure.kind === 'profile') setProfileUnavailable(true);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  if (result) return <div role="status" className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-6">
    <h3 className="text-xl font-semibold">{result.status === 'pending_approval' ? 'Demande envoyée' : 'Votre réservation'}</h3>
    <p className="mt-2 text-white/80">{resultMessage(result.status)}</p>
    <p className="mt-3 break-all text-sm text-white/60">Référence à conserver : {result.bookingId}</p>
  </div>;

  return <form onSubmit={submit} aria-busy={pending} aria-describedby={error ? `${id}-error` : undefined}>
    <fieldset disabled={pending || profileUnavailable} className="space-y-5">
      <legend className="sr-only">Votre demande de rendez-vous</legend>
      <label className="block text-sm font-medium" htmlFor={`${id}-service`}>Prestation
        <select id={`${id}-service`} name="serviceId" required className={controlClass} value={draft.serviceId} onChange={event => edit({ ...draft, serviceId: event.target.value })}>
          {page.services.map(service => <option key={service.id} value={service.id}>{service.label} · {money.format(service.priceMinor / 100)} · {service.durationMinutes} min</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium" htmlFor={`${id}-mode`}>Lieu du rendez-vous
        <select id={`${id}-mode`} name="appointmentMode" required className={controlClass} value={draft.appointmentMode} onChange={event => changeMode(event.target.value as AppointmentMode)}>
          {(['chair', 'home'] as const).filter(mode => page.workModes[mode]).map(mode => <option key={mode} value={mode}>{modeLabels[mode]}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium" htmlFor={`${id}-slot`}>Créneau disponible
        <select id={`${id}-slot`} name="slot" required className={controlClass} value={draft.slot} onChange={event => edit({ ...draft, slot: event.target.value })} aria-describedby={`${id}-timezone`}>
          <option value="">{slots.length ? 'Choisissez votre créneau' : 'Aucun créneau disponible pour ce mode'}</option>
          {slots.map(slot => <option key={slot.value} value={slot.value}>{slotDate.format(new Date(`${slot.value}:00Z`))} à {slot.value.slice(11)}</option>)}
        </select>
      </label>
      <p id={`${id}-timezone`} className="text-xs text-white/60">Horaires indiqués à l’heure de Paris.</p>
      <div className="border-t border-white/10 pt-5">
        <p className="mb-4 font-semibold">Vos coordonnées</p>
        <div className="space-y-4">
          <label className="block text-sm font-medium" htmlFor={`${id}-name`}>Nom complet
            <input id={`${id}-name`} name="clientName" required maxLength={120} autoComplete="name" className={controlClass} value={draft.clientName} onChange={event => edit({ ...draft, clientName: event.target.value })} />
          </label>
          <label className="block text-sm font-medium" htmlFor={`${id}-email`}>E-mail
            <input id={`${id}-email`} name="clientEmail" type="email" required maxLength={254} autoComplete="email" className={controlClass} value={draft.clientEmail} onChange={event => edit({ ...draft, clientEmail: event.target.value })} />
          </label>
          <label className="block text-sm font-medium" htmlFor={`${id}-phone`}>Téléphone
            <input id={`${id}-phone`} name="clientPhone" type="tel" required maxLength={40} autoComplete="tel" className={controlClass} value={draft.clientPhone} onChange={event => edit({ ...draft, clientPhone: event.target.value })} />
          </label>
        </div>
      </div>
      {fields.includes('homeAddress') && draft.appointmentMode === 'home' && <div className="space-y-4 border-t border-white/10 pt-5">
        <label className="block text-sm font-medium" htmlFor={`${id}-area`}>Quartier ou zone approximative
          <input id={`${id}-area`} name="approximateArea" required maxLength={120} placeholder="Par exemple : Paris 11e" className={controlClass} value={draft.approximateArea} onChange={event => edit({ ...draft, approximateArea: event.target.value })} />
        </label>
        <label className="block text-sm font-medium" htmlFor={`${id}-address`}>Adresse exacte
          <input id={`${id}-address`} name="homeAddress.line1" required maxLength={240} autoComplete="street-address" aria-describedby={`${id}-privacy`} className={controlClass} value={draft.homeAddress.line1} onChange={event => edit({ ...draft, homeAddress: { ...draft.homeAddress, line1: event.target.value } })} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium" htmlFor={`${id}-postal`}>Code postal (facultatif)
            <input id={`${id}-postal`} name="homeAddress.postalCode" maxLength={32} autoComplete="postal-code" className={controlClass} value={draft.homeAddress.postalCode ?? ''} onChange={event => edit({ ...draft, homeAddress: { ...draft.homeAddress, postalCode: event.target.value } })} />
          </label>
          <label className="block text-sm font-medium" htmlFor={`${id}-city`}>Ville
            <input id={`${id}-city`} name="homeAddress.city" required maxLength={120} autoComplete="address-level2" className={controlClass} value={draft.homeAddress.city} onChange={event => edit({ ...draft, homeAddress: { ...draft.homeAddress, city: event.target.value } })} />
          </label>
        </div>
        <p id={`${id}-privacy`} className="text-sm leading-relaxed text-white/60">Seule votre zone approximative est visible avant acceptation. Votre adresse exacte est communiquée au professionnel après sa confirmation.</p>
      </div>}
    </fieldset>
    {error && <p id={`${id}-error`} role="alert" className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">{error}</p>}
    <button type="submit" disabled={pending || profileUnavailable || !slots.length || !draft.slot} className="mt-6 min-h-12 w-full rounded-xl bg-[#D4AF37] px-5 py-3 font-bold text-black transition hover:bg-[#e3c35b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-50">
      {pending ? 'Envoi en cours…' : 'Envoyer ma demande'}
    </button>
    <p className="mt-3 text-center text-xs leading-relaxed text-white/60">Le rendez-vous sera validé après confirmation du professionnel.</p>
  </form>;
}
