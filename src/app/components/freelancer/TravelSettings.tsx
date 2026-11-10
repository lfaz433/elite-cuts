import { useState } from 'react';
import { CalendarDays, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { FreelancerProfileInput, AppointmentMode, FreelancerWorkplace } from '../../lib/marketplace/freelancer';
import { inputClass, panelClass } from './workspace/WorkspaceUI';
import { modeLabel, normalizeAvailabilitySlots } from './workspace/freelancerWorkspacePresentation';
import { groupAvailabilitySlots, hasOverlappingAvailability, isHalfHourTime, rangeSlots, type AvailabilityRange } from './workspace/availabilityRanges';

interface Props { value: FreelancerProfileInput; onChange: (value: FreelancerProfileInput) => void; }
const integer = (value: string, minimum = 0, maximum = 1000000) => Math.min(maximum, Math.max(minimum, Math.round(Number(value) || 0)));
type RangeDraft = { date: string; start: string; end: string };
const emptyRangeDraft = (): RangeDraft => ({ date: '', start: '', end: '' });
const rangeDateLabel = (date: string) => {
  const value = new Date(`${date}T12:00`);
  return Number.isNaN(value.getTime()) ? date : new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' }).format(value);
};

export default function TravelSettings({ value, onChange }: Props) {
  const modes = value.workModes ?? { home: true, chair: false };
  const rawSlots = value.availabilityByMode ?? { home: value.availability, chair: [] };
  const slots = {
    home: normalizeAvailabilitySlots(rawSlots.home.join('\n')).sort(),
    chair: normalizeAvailabilitySlots(rawSlots.chair.join('\n')).sort(),
  };
  const ranges = { home: groupAvailabilitySlots(slots.home), chair: groupAvailabilitySlots(slots.chair) };
  const [rangeDrafts, setRangeDrafts] = useState<Record<AppointmentMode, RangeDraft>>({ home: emptyRangeDraft(), chair: emptyRangeDraft() });
  const [editingRangeIds, setEditingRangeIds] = useState<Record<AppointmentMode, string | null>>({ home: null, chair: null });
  const [slotErrors, setSlotErrors] = useState<Partial<Record<AppointmentMode, string>>>({});
  const update = <K extends keyof FreelancerProfileInput>(key: K, next: FreelancerProfileInput[K]) => onChange({ ...value, [key]: next });
  const updateSlots = (mode: AppointmentMode, nextSlots: string[]) => {
    const availabilityByMode = { ...slots, [mode]: [...new Set(nextSlots)].sort() };
    onChange({ ...value, availabilityByMode, availability: availabilityByMode.home });
  };
  const updateRangeDraft = (mode: AppointmentMode, patch: Partial<RangeDraft>) => {
    setRangeDrafts({ ...rangeDrafts, [mode]: { ...rangeDrafts[mode], ...patch } });
    setSlotErrors({ ...slotErrors, [mode]: undefined });
  };
  const addRange = (mode: AppointmentMode) => {
    const draft = rangeDrafts[mode];
    if (!draft.date || !draft.start || !draft.end) {
      setSlotErrors({ ...slotErrors, [mode]: 'Choisissez une date, une heure de début et une heure de fin.' });
      return;
    }
    const editedRange = ranges[mode].find(range => range.id === editingRangeIds[mode]);
    const editingLegacyRange = Boolean(editedRange && !isHalfHourTime(editedRange.start));
    if (!editingLegacyRange && (!isHalfHourTime(draft.start) || !isHalfHourTime(draft.end))) {
      setSlotErrors({ ...slotErrors, [mode]: 'Choisissez des heures à :00 ou :30 pour créer des créneaux de 30 minutes.' });
      return;
    }
    const nextRangeSlots = rangeSlots(draft.date, draft.start, draft.end);
    if (!nextRangeSlots.length) {
      setSlotErrors({ ...slotErrors, [mode]: 'Cette plage ne contient aucun créneau réservable. Vérifiez les heures choisies.' });
      return;
    }
    const otherMode = mode === 'home' ? 'chair' : 'home';
    if (hasOverlappingAvailability(nextRangeSlots, slots[otherMode])) {
      setSlotErrors({ ...slotErrors, [mode]: `Cette plage recouvre déjà un créneau ${modeLabel[otherMode].toLowerCase()}.` });
      return;
    }
    const retainedSlots = editedRange ? slots[mode].filter(slot => !editedRange.slots.includes(slot)) : slots[mode];
    if (hasOverlappingAvailability(nextRangeSlots, retainedSlots)) {
      setSlotErrors({ ...slotErrors, [mode]: 'Cette plage chevauche une disponibilité existante.' });
      return;
    }
    updateSlots(mode, [...retainedSlots, ...nextRangeSlots]);
    setRangeDrafts({ ...rangeDrafts, [mode]: emptyRangeDraft() });
    setEditingRangeIds({ ...editingRangeIds, [mode]: null });
    setSlotErrors({ ...slotErrors, [mode]: undefined });
  };
  const editRange = (mode: AppointmentMode, range: AvailabilityRange) => {
    setRangeDrafts({ ...rangeDrafts, [mode]: { date: range.date, start: range.start, end: range.end } });
    setEditingRangeIds({ ...editingRangeIds, [mode]: range.id });
    setSlotErrors({ ...slotErrors, [mode]: undefined });
  };
  const cancelEdit = (mode: AppointmentMode) => {
    setRangeDrafts({ ...rangeDrafts, [mode]: emptyRangeDraft() });
    setEditingRangeIds({ ...editingRangeIds, [mode]: null });
    setSlotErrors({ ...slotErrors, [mode]: undefined });
  };
  const removeRange = (mode: AppointmentMode, range: AvailabilityRange) => {
    updateSlots(mode, slots[mode].filter(slot => !range.slots.includes(slot)));
    if (editingRangeIds[mode] === range.id) cancelEdit(mode);
  };
  const duplicate = slots.home.some(slot => slots.chair.includes(slot));
  const workplace = value.workplace ?? { name: '', line1: '', postalCode: '', city: '' };
  return <div className="space-y-6">
    <section className={panelClass}><h2 className="text-xl font-semibold">Modes de rendez-vous</h2><p className="mt-2 text-sm text-white/50">Activez les lieux où vous souhaitez recevoir des demandes.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{(['home', 'chair'] as const).map(mode => <label key={mode} className="flex items-center gap-3 rounded-xl border border-white/15 p-4"><input type="checkbox" checked={modes[mode]} disabled={modes[mode] && !modes[mode === 'home' ? 'chair' : 'home']} onChange={event => update('workModes', { ...modes, [mode]: event.currentTarget.checked })} /><span className="text-sm font-semibold">{modeLabel[mode]}</span></label>)}</div><p className="mt-3 text-xs text-white/40">Gardez au moins un mode actif.</p></section>
    <section id="availability" tabIndex={-1} className={panelClass + ' scroll-mt-6'}><h2 className="text-xl font-semibold">Disponibilités par mode</h2><p className="mt-2 text-sm leading-relaxed text-white/50">Ajoutez des plages de disponibilité. Les clients verront des créneaux de 30 minutes entre l’heure de début et de fin.</p><div className="mt-5 grid gap-5 xl:grid-cols-2">{(['home', 'chair'] as const).filter(mode => modes[mode]).map(mode => { const editingRange = ranges[mode].find(range => range.id === editingRangeIds[mode]); const editingLegacyRange = Boolean(editingRange && !isHalfHourTime(editingRange.start)); return <section key={mode} aria-label={`Créneaux ${modeLabel[mode]}`} className="rounded-2xl border border-white/10 bg-black/15 p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{modeLabel[mode]}</h3><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/50">30 min</span></div><div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]"><label className="text-xs font-semibold text-white/60" htmlFor={'availability-date-' + mode}>Date<input id={'availability-date-' + mode} type="date" className={inputClass} value={rangeDrafts[mode].date} onChange={event => updateRangeDraft(mode, { date: event.currentTarget.value })} /></label><label className="text-xs font-semibold text-white/60" htmlFor={'availability-start-' + mode}>De<input id={'availability-start-' + mode} type="time" step={editingLegacyRange ? '60' : '1800'} className={inputClass} value={rangeDrafts[mode].start} onChange={event => updateRangeDraft(mode, { start: event.currentTarget.value })} /></label><label className="text-xs font-semibold text-white/60" htmlFor={'availability-end-' + mode}>À<input id={'availability-end-' + mode} type="time" step={editingLegacyRange ? '60' : '1800'} className={inputClass} value={rangeDrafts[mode].end} aria-invalid={Boolean(slotErrors[mode]) || duplicate} aria-describedby={slotErrors[mode] ? 'availability-error-' + mode : duplicate ? 'availability-error' : undefined} onChange={event => updateRangeDraft(mode, { end: event.currentTarget.value })} /></label></div>{editingLegacyRange && <p className="mt-3 text-xs leading-relaxed text-amber-100/65">Créneau historique : vous pouvez le corriger ou le supprimer. Les nouvelles plages utilisent des heures à :00 ou :30.</p>}<div className="mt-4 flex flex-wrap gap-3"><button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/35 px-4 py-3 text-sm font-semibold text-[#E4C76B] transition hover:bg-[#D4AF37]/10" aria-label={`${editingRangeIds[mode] ? 'Mettre à jour' : 'Ajouter'} la plage ${modeLabel[mode].toLowerCase()}`} onClick={() => addRange(mode)}><Plus className="h-4 w-4" />{editingRangeIds[mode] ? 'Mettre à jour la plage' : 'Ajouter la plage'}</button>{editingRangeIds[mode] && <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white/65 transition hover:bg-white/5" onClick={() => cancelEdit(mode)}><X className="h-4 w-4" />Annuler</button>}</div>{slotErrors[mode] && <p id={'availability-error-' + mode} role="alert" className="mt-3 text-sm text-red-300">{slotErrors[mode]}</p>}<ul className="mt-5 space-y-2" aria-label={`Plages sélectionnées ${modeLabel[mode].toLowerCase()}`}>{ranges[mode].length ? ranges[mode].map(range => <li key={range.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[.035] p-3"><div className="flex min-w-0 items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#D4AF37]/10 text-[#E4C76B]"><CalendarDays className="h-4 w-4" /></div><div><p className="text-sm font-semibold capitalize text-white/85">{rangeDateLabel(range.date)}</p><p className="mt-0.5 text-xs text-white/45">{range.start} — {range.end} · {range.slots.length} créneau{range.slots.length > 1 ? 'x' : ''}</p></div></div><div className="flex items-center gap-1"><button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-white/60 transition hover:bg-white/5 hover:text-white" aria-label={`Modifier la plage ${range.id}`} onClick={() => editRange(mode, range)}><Pencil className="h-3.5 w-3.5" />Modifier</button><button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-white/45 transition hover:bg-red-400/10 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37]" aria-label={`Supprimer la plage ${range.id}`} onClick={() => removeRange(mode, range)}><Trash2 className="h-4 w-4" /></button></div></li>) : <li className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm text-white/40">Aucune plage ajoutée.</li>}</ul></section>; })}</div>{duplicate && <p id="availability-error" role="alert" className="mt-3 text-sm text-red-300">Un créneau apparaît dans les deux modes. Supprimez-le d’un des deux modes.</p>}</section>
    {modes.chair && <section className={panelClass}><h2 className="text-xl font-semibold">Lieu professionnel</h2><p className="mt-2 text-sm text-white/50">Cette adresse commerciale sera affichée aux clients qui réservent en salon.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{([['name', 'Nom du salon'], ['line1', 'Adresse commerciale'], ['postalCode', 'Code postal'], ['city', 'Ville']] as const).map(([key, label]) => <label key={key} className="text-xs font-semibold text-white/60">{label}<input required className={inputClass} value={workplace[key]} maxLength={key === 'line1' ? 240 : key === 'postalCode' ? 20 : 120} onChange={event => update('workplace', { ...workplace, [key]: event.currentTarget.value } as FreelancerWorkplace)} /></label>)}</div></section>}
    <section className={panelClass}><h2 className="text-xl font-semibold">{modes.home ? 'Déplacements et annulation' : 'Politique d’annulation'}</h2><div className="mt-5 grid gap-4 sm:grid-cols-3">{modes.home && <><label className="text-xs font-semibold text-white/60">Rayon de déplacement (km)<input type="number" min={1} max={100} className={inputClass} value={value.radiusKm} onChange={event => update('radiusKm', integer(event.currentTarget.value, 1, 100))} /></label><label className="text-xs font-semibold text-white/60">Frais fixes (€)<input type="number" min={0} max={10000} step="0.01" className={inputClass} value={(value.travelFeeMinor / 100).toFixed(2)} onChange={event => update('travelFeeMinor', integer(String(Number(event.currentTarget.value) * 100)))} /></label></>}<label className="text-xs font-semibold text-white/60">Annulation avant le RDV (heures)<input type="number" min={0} max={720} className={inputClass} value={value.cancellationWindowHours} onChange={event => update('cancellationWindowHours', integer(event.currentTarget.value, 0, 720))} /></label></div></section>
  </div>;
}
