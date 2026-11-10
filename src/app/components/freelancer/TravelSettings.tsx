import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FreelancerProfileInput, AppointmentMode, FreelancerWorkplace } from '../../lib/marketplace/freelancer';
import { inputClass, panelClass } from './workspace/WorkspaceUI';
import { modeLabel, normalizeAvailabilitySlots, slotLabel } from './workspace/freelancerWorkspacePresentation';

interface Props { value: FreelancerProfileInput; onChange: (value: FreelancerProfileInput) => void; }
const integer = (value: string, minimum = 0, maximum = 1000000) => Math.min(maximum, Math.max(minimum, Math.round(Number(value) || 0)));

export default function TravelSettings({ value, onChange }: Props) {
  const modes = value.workModes ?? { home: true, chair: false };
  const rawSlots = value.availabilityByMode ?? { home: value.availability, chair: [] };
  const slots = {
    home: normalizeAvailabilitySlots(rawSlots.home.join('\n')).sort(),
    chair: normalizeAvailabilitySlots(rawSlots.chair.join('\n')).sort(),
  };
  const [pendingSlots, setPendingSlots] = useState<Record<AppointmentMode, string>>({ home: '', chair: '' });
  const [slotErrors, setSlotErrors] = useState<Partial<Record<AppointmentMode, string>>>({});
  const update = <K extends keyof FreelancerProfileInput>(key: K, next: FreelancerProfileInput[K]) => onChange({ ...value, [key]: next });
  const updateSlots = (mode: AppointmentMode, nextSlots: string[]) => {
    const availabilityByMode = { ...slots, [mode]: [...new Set(nextSlots)].sort() };
    onChange({ ...value, availabilityByMode, availability: availabilityByMode.home });
  };
  const addSlot = (mode: AppointmentMode) => {
    const slot = pendingSlots[mode];
    if (!slot) return;
    const otherMode = mode === 'home' ? 'chair' : 'home';
    if (slots[mode].includes(slot)) {
      setSlotErrors({ ...slotErrors, [mode]: 'Ce créneau est déjà ajouté.' });
      return;
    }
    if (slots[otherMode].includes(slot)) {
      setSlotErrors({ ...slotErrors, [mode]: `Ce créneau est déjà proposé ${modeLabel[otherMode].toLowerCase()}.` });
      return;
    }
    updateSlots(mode, [...slots[mode], slot]);
    setPendingSlots({ ...pendingSlots, [mode]: '' });
    setSlotErrors({ ...slotErrors, [mode]: undefined });
  };
  const removeSlot = (mode: AppointmentMode, slot: string) => updateSlots(mode, slots[mode].filter(value => value !== slot));
  const duplicate = slots.home.some(slot => slots.chair.includes(slot));
  const workplace = value.workplace ?? { name: '', line1: '', postalCode: '', city: '' };
  return <div className="space-y-6">
    <section className={panelClass}><h2 className="text-xl font-semibold">Modes de rendez-vous</h2><p className="mt-2 text-sm text-white/50">Activez les lieux où vous souhaitez recevoir des demandes.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{(['home', 'chair'] as const).map(mode => <label key={mode} className="flex items-center gap-3 rounded-xl border border-white/15 p-4"><input type="checkbox" checked={modes[mode]} disabled={modes[mode] && !modes[mode === 'home' ? 'chair' : 'home']} onChange={event => update('workModes', { ...modes, [mode]: event.currentTarget.checked })} /><span className="text-sm font-semibold">{modeLabel[mode]}</span></label>)}</div><p className="mt-3 text-xs text-white/40">Gardez au moins un mode actif.</p></section>
    <section id="availability" tabIndex={-1} className={panelClass + ' scroll-mt-6'}><h2 className="text-xl font-semibold">Disponibilités par mode</h2><p className="mt-2 text-sm leading-relaxed text-white/50">Choisissez une date et une heure, puis ajoutez le créneau. Un même horaire ne peut appartenir qu’à un seul mode.</p><div className="mt-5 grid gap-5 sm:grid-cols-2">{(['home', 'chair'] as const).filter(mode => modes[mode]).map(mode => <section key={mode} aria-label={`Créneaux ${modeLabel[mode]}`} className="rounded-2xl border border-white/10 bg-black/15 p-4"><h3 className="font-semibold">{modeLabel[mode]}</h3><div className="mt-4 flex flex-col gap-3 sm:flex-row"><label className="min-w-0 flex-1 text-xs font-semibold text-white/60" htmlFor={'availability-picker-' + mode}>Date et heure<input id={'availability-picker-' + mode} type="datetime-local" className={inputClass} value={pendingSlots[mode]} aria-invalid={Boolean(slotErrors[mode]) || duplicate} aria-describedby={slotErrors[mode] ? 'availability-error-' + mode : duplicate ? 'availability-error' : undefined} onChange={event => { setPendingSlots({ ...pendingSlots, [mode]: event.currentTarget.value }); setSlotErrors({ ...slotErrors, [mode]: undefined }); }} /></label><button type="button" className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/35 px-4 py-3 text-sm font-semibold text-[#E4C76B] transition hover:bg-[#D4AF37]/10 disabled:cursor-not-allowed disabled:opacity-40" disabled={!pendingSlots[mode]} aria-label={`Ajouter un créneau ${modeLabel[mode].toLowerCase()}`} onClick={() => addSlot(mode)}><Plus className="h-4 w-4" />Ajouter</button></div>{slotErrors[mode] && <p id={'availability-error-' + mode} role="alert" className="mt-3 text-sm text-red-300">{slotErrors[mode]}</p>}<ul className="mt-4 space-y-2" aria-label={`Créneaux sélectionnés ${modeLabel[mode].toLowerCase()}`}>{slots[mode].length ? slots[mode].map(slot => <li key={slot} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm"><time dateTime={slot} className="min-w-0 font-medium text-white/80">{slotLabel(slot)}</time><button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/45 transition hover:bg-red-400/10 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37]" aria-label={`Supprimer le créneau ${slot}`} onClick={() => removeSlot(mode, slot)}><Trash2 className="h-4 w-4" /></button></li>) : <li className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm text-white/40">Aucun créneau ajouté.</li>}</ul></section>)}</div>{duplicate && <p id="availability-error" role="alert" className="mt-3 text-sm text-red-300">Cet horaire apparaît dans les deux modes. Supprimez-le d’un des deux modes.</p>}</section>
    {modes.chair && <section className={panelClass}><h2 className="text-xl font-semibold">Lieu professionnel</h2><p className="mt-2 text-sm text-white/50">Cette adresse commerciale sera affichée aux clients qui réservent en salon.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{([['name', 'Nom du salon'], ['line1', 'Adresse commerciale'], ['postalCode', 'Code postal'], ['city', 'Ville']] as const).map(([key, label]) => <label key={key} className="text-xs font-semibold text-white/60">{label}<input required className={inputClass} value={workplace[key]} maxLength={key === 'line1' ? 240 : key === 'postalCode' ? 20 : 120} onChange={event => update('workplace', { ...workplace, [key]: event.currentTarget.value } as FreelancerWorkplace)} /></label>)}</div></section>}
    <section className={panelClass}><h2 className="text-xl font-semibold">{modes.home ? 'Déplacements et annulation' : 'Politique d’annulation'}</h2><div className="mt-5 grid gap-4 sm:grid-cols-3">{modes.home && <><label className="text-xs font-semibold text-white/60">Rayon de déplacement (km)<input type="number" min={1} max={100} className={inputClass} value={value.radiusKm} onChange={event => update('radiusKm', integer(event.currentTarget.value, 1, 100))} /></label><label className="text-xs font-semibold text-white/60">Frais fixes (€)<input type="number" min={0} max={10000} step="0.01" className={inputClass} value={(value.travelFeeMinor / 100).toFixed(2)} onChange={event => update('travelFeeMinor', integer(String(Number(event.currentTarget.value) * 100)))} /></label></>}<label className="text-xs font-semibold text-white/60">Annulation avant le RDV (heures)<input type="number" min={0} max={720} className={inputClass} value={value.cancellationWindowHours} onChange={event => update('cancellationWindowHours', integer(event.currentTarget.value, 0, 720))} /></label></div></section>
  </div>;
}
