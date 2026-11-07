import type { MarketplaceBooking, BookingStatus } from '../../../lib/marketplace/bookingRecords';
import type { HomeAddress } from '../../../lib/marketplace/bookings';
import type { FreelancerProfileInput, AppointmentMode } from '../../../lib/marketplace/freelancerRecords';
import { normalizePublicSlug, sanitizeSocialLinks, type SocialPlatform } from '../../../lib/marketplace/identity';

export const SERVICE_DURATIONS = [15, 30, 45, 60, 75, 90, 120] as const;
export const modeLabel: Record<AppointmentMode, string> = { home: 'À domicile', chair: 'En salon' };
export const statusLabel: Record<BookingStatus, string> = {
  pending_approval: 'En attente', confirmed: 'Confirmée', declined: 'Refusée', cancelled: 'Annulée', completed: 'Terminée', payment_failed: 'Échec de paiement',
};
export const money = (minor: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(minor / 100);
export const renderForecastCopy = (minor: number) => `Prévision de CA · ${money(minor)}`;
export const slotLabel = (slot: string) => {
  const date = new Date(slot);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : slot;
};

export function publicFreelancerUrl(origin: string, profile: Pick<FreelancerProfileInput, 'visible' | 'identity'>): string | null {
  return profile.visible && profile.identity.publicSlug ? `${origin}/b/${profile.identity.publicSlug}` : null;
}

export function bookingLocation(booking: Pick<MarketplaceBooking, 'appointmentMode' | 'status' | 'workplaceSnapshot' | 'approximateArea'>, address?: HomeAddress): string {
  if (booking.appointmentMode === 'chair') {
    const place = booking.workplaceSnapshot;
    return place ? `${place.name} · ${place.line1}, ${place.postalCode} ${place.city}` : 'Lieu professionnel indisponible';
  }
  if (booking.status === 'confirmed' && address) return `Adresse confirmée : ${address.line1}, ${address.postalCode ? `${address.postalCode} ` : ''}${address.city}`;
  return `Zone approximative : ${booking.approximateArea || 'non précisée'}`;
}

export type IdentityErrors = Partial<Record<'publicSlug' | 'profileImageUrl' | SocialPlatform, string>>;
type CalendarEntry = { slot: string; mode: AppointmentMode } & ({ kind: 'available' } | { kind: 'booking'; booking: MarketplaceBooking });
export function calendarEntries(profile: FreelancerProfileInput, bookings: MarketplaceBooking[], mode: 'all' | AppointmentMode): CalendarEntry[] {
  const scheduled = bookings.filter(booking => booking.status === 'confirmed' || booking.status === 'pending_approval' || booking.status === 'completed');
  const occupied = new Set(scheduled.map(booking => `${booking.date}T${booking.time}`));
  const entries: CalendarEntry[] = scheduled.map(booking => ({ kind: 'booking', slot: `${booking.date}T${booking.time}`, mode: booking.appointmentMode, booking }));
  for (const appointmentMode of ['home', 'chair'] as const) {
    if (profile.workModes[appointmentMode]) {
      for (const slot of profile.availabilityByMode[appointmentMode]) {
        if (!occupied.has(slot)) entries.push({ kind: 'available', slot, mode: appointmentMode });
      }
    }
  }
  return entries.filter(entry => mode === 'all' || entry.mode === mode).sort((a, b) => a.slot.localeCompare(b.slot));
}
export const slugError = 'Choisissez un identifiant public de 3 à 64 caractères (lettres, chiffres et tirets).';
export function validateProfileIdentity(profile: Pick<FreelancerProfileInput, 'visible' | 'identity'>): IdentityErrors {
  const errors: IdentityErrors = {};
  const { identity } = profile;
  if (profile.visible || identity.publicSlug.trim()) {
    try { normalizePublicSlug(identity.publicSlug); } catch { errors.publicSlug = slugError; }
  }
  if (identity.profileImageUrl) {
    try { if (new URL(identity.profileImageUrl).protocol !== 'https:') throw new Error(); }
    catch { errors.profileImageUrl = 'Saisissez une adresse d’image HTTPS valide.'; }
  }
  for (const [platform, value] of Object.entries(identity.socialLinks)) {
    try { sanitizeSocialLinks({ [platform]: value }); }
    catch { errors[platform as SocialPlatform] = platform === 'whatsapp' ? 'Utilisez le format international, par exemple +33612345678.' : 'Saisissez un lien HTTPS valide pour ce réseau.'; }
  }
  return errors;
}

export interface FreelancerInboxReview {
  reviewId: string;
  bookingId: string;
  rating: number;
  text?: string;
  authorName: string;
  createdAtMs: number;
  status: 'approved' | 'hidden' | 'pending' | 'rejected';
}
