// Availability stores occupied intervals alongside the legacy start-slot list.
// Ends are snapshotted from bookings, never recalculated from edited services.
export type ReservedInterval = { slot: string; startMs: number; endMs: number };

export function storedIntervals(value: unknown): ReservedInterval[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ReservedInterval => !!item && typeof item === 'object'
    && typeof item.slot === 'string' && Number.isFinite(item.startMs)
    && Number.isFinite(item.endMs) && item.endMs > item.startMs);
}

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export function slotEpochMs(slot: string): number | null {
  const wall = Date.parse(`${slot}:00Z`);
  if (!Number.isFinite(wall)) return null;
  let instant: number | null = null;
  for (let delta = -180; delta <= 180; delta += 15) {
    const candidate = wall + delta * 60_000;
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map(part => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` !== slot) continue;
    if (instant !== null) return null;
    instant = candidate;
  }
  return instant;
}
export function intervalIsFree(startMs: number, duration: number, intervals: ReservedInterval[]): boolean {
  return intervals.every(interval => startMs + duration * 60_000 <= interval.startMs || startMs >= interval.endMs);
}
export function freeSlot(slot: string, duration: number, intervals: ReservedInterval[]): boolean {
  const start = slotEpochMs(slot);
  return start !== null && intervalIsFree(start, duration, intervals);
}
export function intervalsFromBookings(bookings: Record<string, unknown>[]): ReservedInterval[] {
  return bookings.flatMap(booking => {
    if (booking.ownerType !== 'freelancer' || booking.status === 'cancelled' || booking.status === 'declined') return [];
    const slot = `${booking.date}T${booking.time}`;
    const startMs = slotEpochMs(slot);
    const duration = booking.durationMinutes ?? booking.serviceDurationMinutes ?? 30;
    if (startMs === null || typeof duration !== 'number' || !Number.isInteger(duration) || duration < 15 || duration > 360) return [];
    return [{ slot, startMs, endMs: startMs + duration * 60_000 }];
  });
}
export function minimumServiceDuration(value: unknown): number {
  const durations = value && typeof value === 'object' ? Object.values(value).filter(
    (duration): duration is number => typeof duration === 'number' && Number.isInteger(duration) && duration >= 15 && duration <= 360,
  ) : [];
  return durations.length ? Math.min(...durations) : 30;
}
