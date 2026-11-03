import type { MarketplaceBooking } from './bookingRecords';
import type { AppointmentMode } from './freelancerRecords';

export type FreelancerAnalyticsPeriod = '7d' | '30d';

function appointmentDate(booking: MarketplaceBooking): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.date)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(booking.time)) return null;
  const date = new Date(`${booking.date}T${booking.time}:00`);
  const [year, month, day] = booking.date.split('-').map(Number);
  if (!Number.isFinite(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day) return null;
  return date;
}

/** Operational Prévision de CA, based on scheduled appointments rather than collected payments. */
export function calculateFreelancerAnalytics(
  bookings: MarketplaceBooking[],
  period: FreelancerAnalyticsPeriod,
  now: Date,
): {
  forecastMinor: number;
  confirmedCount: number;
  uniqueClientCount: number;
  cancelledCount: number;
  byService: Array<{ serviceId: string; forecastMinor: number; count: number }>;
  byMode: Array<{ mode: AppointmentMode; forecastMinor: number; count: number }>;
} {
  const end = new Date(now);
  end.setDate(end.getDate() + (period === '7d' ? 7 : 30));
  let forecastMinor = 0;
  let confirmedCount = 0;
  let cancelledCount = 0;
  const clients = new Set<string>();
  const services = new Map<string, { serviceId: string; forecastMinor: number; count: number }>();
  const modes = new Map<AppointmentMode, { mode: AppointmentMode; forecastMinor: number; count: number }>();

  for (const booking of bookings) {
    const scheduled = appointmentDate(booking);
    if (!scheduled || scheduled.getTime() < now.getTime() || scheduled.getTime() > end.getTime()) continue;
    if (booking.status === 'cancelled') {
      cancelledCount += 1;
      continue;
    }
    if (booking.status !== 'confirmed' && booking.status !== 'completed') continue;
    const amount = booking.totalPriceMinor ?? 0;
    forecastMinor += amount;
    confirmedCount += 1;
    clients.add(booking.clientId);
    const service = services.get(booking.serviceId)
      ?? { serviceId: booking.serviceId, forecastMinor: 0, count: 0 };
    service.forecastMinor += amount;
    service.count += 1;
    services.set(booking.serviceId, service);
    const mode = modes.get(booking.appointmentMode)
      ?? { mode: booking.appointmentMode, forecastMinor: 0, count: 0 };
    mode.forecastMinor += amount;
    mode.count += 1;
    modes.set(booking.appointmentMode, mode);
  }

  return {
    forecastMinor,
    confirmedCount,
    uniqueClientCount: clients.size,
    cancelledCount,
    byService: [...services.values()].sort((a, b) => a.serviceId.localeCompare(b.serviceId)),
    byMode: (['home', 'chair'] as const).flatMap(mode => modes.has(mode) ? [modes.get(mode)!] : []),
  };
}
