import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { FreelancerProfileInput, AppointmentMode } from '../../../lib/marketplace/freelancerRecords';
import type { MarketplaceBooking, HomeAddress } from '../../../lib/marketplace/bookings';
import BookingCard from './BookingCard';
import { calendarEntries, modeLabel, slotLabel } from './freelancerWorkspacePresentation';
import { EmptyState, ViewHeading, panelClass, primaryButton, secondaryButton } from './WorkspaceUI';

export default function FreelancerCalendarView({ profile, bookings, addresses, now }: {
  profile: FreelancerProfileInput; bookings: MarketplaceBooking[]; addresses: Record<string, HomeAddress>; now: Date;
}) {
  const [mode, setMode] = useState<'all' | AppointmentMode>('all');
  const [weekOffset, setWeekOffset] = useState(0);
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (start.getDay() + 6) % 7 + weekOffset * 7);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const entries = calendarEntries(profile, bookings, mode).filter(entry => new Date(entry.slot) >= start && new Date(entry.slot) < end);
  const lastDay = new Date(end); lastDay.setDate(lastDay.getDate() - 1);
  return <><ViewHeading eyebrow="Votre planning" title="Calendrier" description="Une semaine lisible, avec vos créneaux ouverts et vos rendez-vous par lieu." action={<Link className={primaryButton} to="/freelancer/settings#availability"><Plus className="h-4 w-4" />Ajouter une disponibilité</Link>} />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div className="flex flex-wrap items-center gap-2"><button type="button" aria-label="Semaine précédente" className={secondaryButton} onClick={() => setWeekOffset(value => value - 1)}><ChevronLeft className="h-4 w-4" /></button><p className="px-1 text-sm font-semibold">{start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – {lastDay.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</p><button type="button" aria-label="Semaine suivante" className={secondaryButton} onClick={() => setWeekOffset(value => value + 1)}><ChevronRight className="h-4 w-4" /></button><button type="button" className="px-2 py-2 text-xs text-white/60" onClick={() => setWeekOffset(0)}>Aujourd’hui</button></div><div role="group" aria-label="Filtrer par type" className="flex rounded-xl border border-white/10 p-1">{(['all', 'home', 'chair'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${mode === value ? 'bg-white/10 text-white' : 'text-white/45'}`}>{value === 'all' ? 'Tous' : modeLabel[value]}</button>)}</div></div>
    <div className="space-y-4">{entries.map(entry => entry.kind === 'booking' ? <BookingCard key={`booking-${entry.booking.id}`} booking={entry.booking} address={addresses[entry.booking.id]} /> : <article key={`${entry.mode}-${entry.slot}`} className={`${panelClass} flex flex-wrap items-center justify-between gap-3`}><div><p className="text-sm font-semibold">{slotLabel(entry.slot)}</p><p className="mt-2 text-xs text-white/45">{modeLabel[entry.mode]}{entry.mode === 'chair' && profile.workplace ? ` · ${profile.workplace.name}` : ''}</p></div><span className="rounded-full border border-emerald-400/20 px-3 py-1 text-xs text-emerald-200">Disponible</span></article>)}</div>
    {!entries.length && <EmptyState title="Une semaine encore libre">Ajoutez une disponibilité ou consultez une autre semaine pour préparer votre planning.</EmptyState>}
  </>;
}
