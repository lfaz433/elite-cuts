import { MapPin } from 'lucide-react';
import type { MarketplaceBooking, HomeAddress } from '../../../lib/marketplace/bookings';
import { displayFreelancerService } from '../../../lib/marketplace/freelancerServices.mjs';
import { bookingLocation, modeLabel, money, slotLabel, statusLabel } from './freelancerWorkspacePresentation';
import { panelClass, secondaryButton } from './WorkspaceUI';

export default function BookingCard({ booking, address, onAnswer, onComplete, busy }: {
  booking: MarketplaceBooking; address?: HomeAddress;
  onAnswer?: (id: string, decision: 'accept' | 'decline') => void; busy?: boolean;
  onComplete?: (id: string) => void;
}) {
  return <article id={`booking-${booking.id}`} tabIndex={-1} className={`${panelClass} scroll-mt-6 focus:outline focus:outline-2 focus:outline-[#D4AF37]`}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2 text-[11px] font-semibold"><span className={`rounded-full px-2.5 py-1 ${booking.appointmentMode === 'home' ? 'bg-sky-400/10 text-sky-200' : 'bg-violet-400/10 text-violet-200'}`}>{modeLabel[booking.appointmentMode]}</span><span className="rounded-full bg-white/5 px-2.5 py-1 text-white/60">{statusLabel[booking.status]}</span></div><h3 className="mt-4 text-lg font-semibold">{displayFreelancerService(booking.serviceId)}</h3><p className="mt-1 text-sm text-white/70">{booking.clientName} · {slotLabel(`${booking.date}T${booking.time}`)}</p></div>{typeof booking.totalPriceMinor === 'number' && <p className="text-lg font-semibold">{money(booking.totalPriceMinor)}</p>}</div>
    <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-white/50"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{bookingLocation(booking, address)}</p>
    {booking.appointmentMode === 'home' && booking.status === 'pending_approval' && <p className="mt-2 text-xs text-white/40">L’adresse exacte sera disponible après votre acceptation.</p>}
    {typeof booking.travelFeeMinor === 'number' && booking.appointmentMode === 'home' && <p className="mt-2 text-xs text-white/40">Service {money(booking.servicePriceMinor ?? 0)} · déplacement {money(booking.travelFeeMinor)}{typeof booking.distanceKm === 'number' ? ` · distance estimée ${booking.distanceKm} km` : ''}</p>}
    {booking.cancellationWindowHours !== undefined && <p className="mt-2 text-xs text-white/40">Annulation jusqu’à {booking.cancellationWindowHours} h avant le rendez-vous.</p>}
    {onAnswer && booking.status === 'pending_approval' && <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4"><button type="button" disabled={busy} onClick={() => onAnswer(booking.id, 'accept')} className={`${secondaryButton} !border-emerald-400/30 !text-emerald-200`}>{busy ? 'Traitement…' : 'Accepter'}</button><button type="button" disabled={busy} onClick={() => onAnswer(booking.id, 'decline')} className={`${secondaryButton} !text-red-200`}>Refuser</button></div>}
    {onComplete && booking.status === 'confirmed' && <div className="mt-5 border-t border-white/10 pt-4"><button type="button" disabled={busy} onClick={() => onComplete(booking.id)} className={secondaryButton}>{busy ? 'Traitement…' : 'Marquer comme terminé'}</button></div>}
  </article>;
}
