export const BOOKING_DRAFT_STORAGE_KEY = 'barberboard.bookingDraft.v1';

interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BookingDraft {
  selectedServiceId: string;
  selectedBarberId: string;
  selectedDate: string;
  selectedTime: string;
  clientInfo: { name: string; email: string; phone: string };
}

interface StoredBookingDraft extends BookingDraft {
  tenantId: string;
}

const ROOT_KEYS = new Set([
  'tenantId', 'selectedServiceId', 'selectedBarberId', 'selectedDate', 'selectedTime', 'clientInfo',
]);
const CLIENT_KEYS = new Set(['name', 'email', 'phone']);
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function exactKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).length === allowed.size
    && Object.keys(value).every(key => allowed.has(key));
}

function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= maxLength;
}

function parseStoredDraft(value: unknown): StoredBookingDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!exactKeys(input, ROOT_KEYS)) return null;
  if (!input.clientInfo || typeof input.clientInfo !== 'object' || Array.isArray(input.clientInfo)) return null;
  const client = input.clientInfo as Record<string, unknown>;
  if (!exactKeys(client, CLIENT_KEYS)) return null;
  if (
    typeof input.tenantId !== 'string' || !SAFE_ID.test(input.tenantId)
    || typeof input.selectedServiceId !== 'string' || !SAFE_ID.test(input.selectedServiceId)
    || typeof input.selectedBarberId !== 'string' || !(input.selectedBarberId === 'any' || SAFE_ID.test(input.selectedBarberId))
    || typeof input.selectedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.selectedDate)
    || typeof input.selectedTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.selectedTime)
    || !boundedText(client.name, 120)
    || !boundedText(client.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)
    || !boundedText(client.phone, 40)
  ) return null;
  return {
    tenantId: input.tenantId,
    selectedServiceId: input.selectedServiceId,
    selectedBarberId: input.selectedBarberId,
    selectedDate: input.selectedDate,
    selectedTime: input.selectedTime,
    clientInfo: {
      name: client.name.trim(),
      email: client.email.trim().toLowerCase(),
      phone: client.phone.trim(),
    },
  };
}

export function saveBookingDraft(
  storage: DraftStorage,
  tenantId: string,
  draft: BookingDraft,
): void {
  const stored = parseStoredDraft({ tenantId, ...draft });
  if (!stored) throw new Error('Booking draft is invalid');
  storage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(stored));
}

export function loadBookingDraft(storage: DraftStorage, tenantId: string): BookingDraft | null {
  const raw = storage.getItem(BOOKING_DRAFT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored = parseStoredDraft(JSON.parse(raw));
    if (!stored) {
      storage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
      return null;
    }
    if (stored.tenantId !== tenantId) return null;
    const { tenantId: _tenantId, ...draft } = stored;
    return draft;
  } catch {
    storage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
    return null;
  }
}

export function clearBookingDraft(storage: DraftStorage): void {
  storage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
}
