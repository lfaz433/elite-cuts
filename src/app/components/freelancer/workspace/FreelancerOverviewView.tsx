import { Link } from 'react-router';
import { ArrowUpRight, Plus } from 'lucide-react';
import type { FreelancerProfileInput } from '../../../lib/marketplace/freelancerRecords';
import type { MarketplaceBooking, HomeAddress } from '../../../lib/marketplace/bookings';
import { calculateFreelancerAnalytics } from '../../../lib/marketplace/freelancerAnalytics';
import BookingCard from './BookingCard';
import { money, renderForecastCopy } from './freelancerWorkspacePresentation';
import { EmptyState, Metric, ViewHeading, panelClass, primaryButton, secondaryButton } from './WorkspaceUI';

export default function FreelancerOverviewView({ profile, bookings, addresses, now }: {
  profile: FreelancerProfileInput; bookings: MarketplaceBooking[]; addresses: Record<string, HomeAddress>; now: Date;
}) {
  const metrics = calculateFreelancerAnalytics(bookings, '7d', now);
  const pending = bookings.filter(booking => booking.status === 'pending_approval');
  const next = bookings.filter(booking => booking.status === 'confirmed' && new Date(`${booking.date}T${booking.time}`) >= now).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
  return <>
    <ViewHeading eyebrow="Votre activité" title={`Bonjour${profile.displayName ? `, ${profile.displayName}` : ''}.`} description="Vos rendez-vous, vos demandes et votre activité, au même endroit." action={<Link to="/freelancer/settings#availability" className={primaryButton}><Plus className="h-4 w-4" />Ajouter un créneau</Link>} />
    <div className="mb-7 grid gap-4 sm:grid-cols-3"><div aria-label={renderForecastCopy(metrics.forecastMinor)}><Metric label="Prévision de CA" value={money(metrics.forecastMinor)} detail="Sur les 7 prochains jours" /></div><Metric label="Réservations confirmées" value={metrics.confirmedCount} detail="Confirmées ou terminées · 7 jours" /><Metric label="Clients uniques" value={metrics.uniqueClientCount} detail="Sur les 7 prochains jours" /></div>
    <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]"><section><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Prochain rendez-vous</h2><Link className="text-sm text-white/50" to="/freelancer/calendar">Calendrier →</Link></div>{next ? <BookingCard booking={next} address={addresses[next.id]} /> : <EmptyState title="Votre prochain rendez-vous vous attend">Ajoutez vos disponibilités puis partagez votre lien pour recevoir des demandes.</EmptyState>}</section><section className={panelClass}><p className="text-xs uppercase tracking-wider text-white/45">À traiter</p><p className="mt-4 text-4xl font-semibold text-[#E4C76B]">{pending.length}</p><h2 className="mt-2 font-semibold">Demande{pending.length === 1 ? '' : 's'} en attente</h2><p className="mt-2 text-sm leading-relaxed text-white/45">{pending.length ? 'Une réponse rapide aide vos clients à organiser leur visite.' : 'Vous êtes à jour. Les nouvelles demandes apparaîtront ici.'}</p><Link to="/freelancer/bookings" className={`${secondaryButton} mt-5`}>Voir les réservations<ArrowUpRight className="h-4 w-4" /></Link></section></div>
    <section className={`${panelClass} mt-6 flex flex-wrap items-center justify-between gap-4`}><div><h2 className="font-semibold">{profile.visible && profile.identity.publicSlug ? 'Votre profil est visible' : 'Préparez votre profil public'}</h2><p className="mt-2 text-sm text-white/45">{profile.serviceIds.length} service{profile.serviceIds.length === 1 ? '' : 's'} · {profile.workModes.home ? 'Domicile' : ''}{profile.workModes.home && profile.workModes.chair ? ' et ' : ''}{profile.workModes.chair ? 'Salon' : ''}</p></div><Link className={secondaryButton} to={profile.visible ? '/freelancer/marketing' : '/freelancer/settings'}>{profile.visible ? 'Partager mon activité' : 'Compléter mon profil'}</Link></section>
  </>;
}
