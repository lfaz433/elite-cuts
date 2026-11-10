export const AVAILABILITY_INTERVAL_MINUTES = 30;

export type AvailabilityRange = {
  id: string;
  date: string;
  start: string;
  end: string;
  slots: string[];
};

const slotPattern = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PARIS_TIME_ZONE = 'Europe/Paris';

function slotTimestamp(slot: string): number | null {
  const match = slot.match(slotPattern);
  if (!match) return null;
  const [year, month, day] = match[1].split('-').map(Number);
  const [hour, minute] = match[2].split(':').map(Number);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute);
  return Number.isNaN(timestamp) || formatSlot(timestamp) !== slot ? null : timestamp;
}

function formatSlot(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function isHalfHourTime(value: string): boolean {
  const match = value.match(timePattern);
  return Boolean(match) && Number(match![2]) % AVAILABILITY_INTERVAL_MINUTES === 0;
}

function parisWallTimeParts(epochMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochMs)).reduce((value, part) => (
    ['year', 'month', 'day', 'hour', 'minute'].includes(part.type)
      ? `${value}${part.type}:${part.value};`
      : value
  ), '');
}

function isBookableParisSlot(slot: string): boolean {
  const timestamp = slotTimestamp(slot);
  if (timestamp === null) return false;
  const [date, time] = slot.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = `year:${String(year).padStart(4, '0')};month:${String(month).padStart(2, '0')};day:${String(day).padStart(2, '0')};hour:${String(hour).padStart(2, '0')};minute:${String(minute).padStart(2, '0')};`;
  let candidates = 0;
  for (let deltaMinutes = -180; deltaMinutes <= 180; deltaMinutes += 15) {
    if (parisWallTimeParts(timestamp + deltaMinutes * 60_000) === target) candidates += 1;
  }
  return candidates === 1;
}

export function rangeSlots(date: string, start: string, end: string): string[] {
  const startTimestamp = slotTimestamp(`${date}T${start}`);
  let endTimestamp = slotTimestamp(`${date}T${end}`);
  if (startTimestamp === null || endTimestamp === null) return [];
  if (endTimestamp <= startTimestamp) {
    if (end === '00:00' && start !== '00:00') endTimestamp += 24 * 60 * 60 * 1_000;
    else return [];
  }
  const interval = AVAILABILITY_INTERVAL_MINUTES * 60_000;
  if ((endTimestamp - startTimestamp) % interval !== 0) return [];
  const slots: string[] = [];
  for (let timestamp = startTimestamp; timestamp < endTimestamp; timestamp += interval) {
    const slot = formatSlot(timestamp);
    if (isBookableParisSlot(slot)) slots.push(slot);
  }
  return slots;
}

export function hasOverlappingAvailability(candidateSlots: string[], existingSlots: string[]): boolean {
  const interval = AVAILABILITY_INTERVAL_MINUTES * 60_000;
  return candidateSlots.some(candidate => {
    const candidateStart = slotTimestamp(candidate);
    if (candidateStart === null) return false;
    return existingSlots.some(existing => {
      const existingStart = slotTimestamp(existing);
      return existingStart !== null
        && candidateStart < existingStart + interval
        && existingStart < candidateStart + interval;
    });
  });
}

export function groupAvailabilitySlots(rawSlots: string[]): AvailabilityRange[] {
  const uniqueSlots = [...new Set(rawSlots)].sort();
  const interval = AVAILABILITY_INTERVAL_MINUTES * 60_000;
  const groups: string[][] = [];
  for (const slot of uniqueSlots) {
    const previousGroup = groups.at(-1);
    const previousSlot = previousGroup?.at(-1);
    const slotTime = slotTimestamp(slot);
    const previousTime = previousSlot ? slotTimestamp(previousSlot) : null;
    if (previousGroup && previousSlot?.slice(0, 10) === slot.slice(0, 10) && slotTime !== null && previousTime !== null && slotTime - previousTime === interval) previousGroup.push(slot);
    else groups.push([slot]);
  }
  return groups.map(slots => {
    const first = slots[0];
    const match = first.match(slotPattern);
    const lastTimestamp = slotTimestamp(slots.at(-1)!) ?? 0;
    const [date, start] = match ? [match[1], match[2]] : ['', first];
    const end = lastTimestamp ? formatSlot(lastTimestamp + interval).slice(11) : start;
    return { id: first, date, start, end, slots };
  });
}
