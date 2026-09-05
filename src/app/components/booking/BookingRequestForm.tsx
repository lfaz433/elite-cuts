import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { requestBooking, type BookingRequestInput } from '../../lib/marketplace/bookings';
import type { PublicProfile } from '../../lib/marketplace/discovery';
import { useAuth } from '../context/AuthContext';

export function BookingRequestForm({ profile, onRequested }: { profile: PublicProfile; onRequested?: () => void }) {
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<BookingRequestInput>>({ clientName: user?.name ?? '', serviceId: profile.serviceIds[0] ?? '' });
  const supportsHomeVisit = profile.kind === 'freelancer' && profile.homeVisit;
  const update = (key: keyof BookingRequestInput, value: string) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true); setError(null);
    try {
      const homeAddress = supportsHomeVisit ? { line1: form.homeAddress?.line1 ?? '', city: form.homeAddress?.city ?? '', postalCode: form.homeAddress?.postalCode } : undefined;
      const result = await requestBooking({
        profileId: profile.id, serviceId: form.serviceId ?? '', date: form.date ?? '', time: form.time ?? '',
        clientName: form.clientName ?? '', clientEmail: form.clientEmail, clientPhone: form.clientPhone,
        approximateArea: form.approximateArea, ...(homeAddress ? { homeAddress } : {}),
      });
      toast.success(result.status === 'confirmed' ? 'Réservation confirmée.' : 'Demande envoyée, en attente de confirmation.');
      onRequested?.();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'La réservation a échoué. Réessayez avec un autre créneau.';
      setError(message); toast.error(message);
    } finally { setPending(false); }
  };
  const updateAddress = (key: 'line1' | 'city' | 'postalCode', value: string) => setForm(current => ({ ...current, homeAddress: { ...current.homeAddress, [key]: value } as NonNullable<BookingRequestInput['homeAddress']> }));
  if (profile.kind === 'freelancer' && !profile.homeVisit) return <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">Ce professionnel n’accepte pas actuellement les rendez-vous à domicile.</div>;
  return <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-[#D4AF37]/20 bg-[#141414] p-5">
    <h2 className="text-xl font-black">Demander un rendez-vous</h2>
    <select aria-label="Service" required value={form.serviceId ?? ''} onChange={event => update('serviceId', event.target.value)} className="w-full rounded-lg bg-black p-3 text-white">{profile.serviceIds.map(id => <option key={id} value={id}>{id}</option>)}</select>
    <div className="grid gap-3 sm:grid-cols-2"><input aria-label="Date" type="date" required value={form.date ?? ''} onChange={event => update('date', event.target.value)} className="rounded-lg bg-black p-3 text-white" /><input aria-label="Heure" type="time" required value={form.time ?? ''} onChange={event => update('time', event.target.value)} className="rounded-lg bg-black p-3 text-white" /></div>
    <input aria-label="Nom" required value={form.clientName ?? ''} onChange={event => update('clientName', event.target.value)} placeholder="Votre nom" className="w-full rounded-lg bg-black p-3 text-white" />
    <input aria-label="Téléphone" value={form.clientPhone ?? ''} onChange={event => update('clientPhone', event.target.value)} placeholder="Téléphone" className="w-full rounded-lg bg-black p-3 text-white" />
    {supportsHomeVisit && <><input aria-label="Quartier" value={form.approximateArea ?? ''} onChange={event => update('approximateArea', event.target.value)} placeholder="Quartier approximatif" className="w-full rounded-lg bg-black p-3 text-white" /><input aria-label="Adresse" required value={form.homeAddress?.line1 ?? ''} onChange={event => updateAddress('line1', event.target.value)} placeholder="Adresse exacte" className="w-full rounded-lg bg-black p-3 text-white" /><input aria-label="Ville" required value={form.homeAddress?.city ?? ''} onChange={event => updateAddress('city', event.target.value)} placeholder="Ville" className="w-full rounded-lg bg-black p-3 text-white" /><p className="text-xs text-white/45">L’adresse exacte reste privée jusqu’à l’acceptation par le professionnel.</p></>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <button disabled={pending || !user} className="rounded-xl bg-[#D4AF37] px-5 py-3 font-bold text-black disabled:opacity-50">{pending ? 'Envoi…' : 'Envoyer la demande'}</button>
  </form>;
}
