import { useEffect, useState } from 'react';
import type { MarketplaceBooking, HomeAddress } from '../../../lib/marketplace/bookings';
import type { AppointmentMode } from '../../../lib/marketplace/freelancerRecords';
import BookingCard from './BookingCard';
import { statusLabel } from './freelancerWorkspacePresentation';
import { EmptyState, ViewHeading, inputClass, primaryButton } from './WorkspaceUI';

export default function FreelancerBookingsView({ bookings, addresses, onAnswer, busyId }: {
  bookings: MarketplaceBooking[]; addresses: Record<string, HomeAddress>; onAnswer: (id: string, decision: 'accept' | 'decline') => void; busyId: string | null;
}) {
  const [mode, setMode] = useState<'all' | AppointmentMode>('all');
  const [status, setStatus] = useState('all');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const sorted = [...bookings].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const pending = sorted.find(booking => booking.status === 'pending_approval');
  const visible = sorted.filter(booking => (mode === 'all' || booking.appointmentMode === mode) && (status === 'all' || booking.status === status));
  useEffect(() => { if (focusedId) { document.getElementById(`booking-${focusedId}`)?.focus(); setFocusedId(null); } }, [focusedId]);
  return <><ViewHeading eyebrow="Relation client" title="Réservations" description="Suivez chaque demande et préparez vos rendez-vous à domicile ou en salon." action={<button type="button" disabled={!pending} className={primaryButton} onClick={() => { setMode('all'); setStatus('pending_approval'); setFocusedId(pending?.id ?? null); }}>Ouvrir la prochaine demande</button>} />
    <div className="mb-6 grid max-w-xl gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-white/60">Type de rendez-vous<select className={inputClass} value={mode} onChange={event => setMode(event.currentTarget.value as typeof mode)}><option value="all">Tous</option><option value="home">À domicile</option><option value="chair">En salon</option></select></label><label className="text-xs font-semibold text-white/60">Statut<select className={inputClass} value={status} onChange={event => setStatus(event.currentTarget.value)}><option value="all">Tous les statuts</option>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
    <div className="grid gap-4 xl:grid-cols-2">{visible.map(booking => <BookingCard key={booking.id} booking={booking} address={addresses[booking.id]} onAnswer={onAnswer} busy={busyId !== null} />)}</div>{!visible.length && <EmptyState title={bookings.length ? 'Aucun résultat pour ces filtres' : 'Aucune réservation pour le moment'}>{bookings.length ? 'Essayez un autre statut ou un autre type de rendez-vous.' : 'Les demandes de votre page publique apparaîtront ici.'}</EmptyState>}
  </>;
}
