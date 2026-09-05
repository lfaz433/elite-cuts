export type BookingStatus =
  | 'draft'
  | 'pending_approval'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'completed'
  | 'payment_failed';

export type LegacyBookingStatus = 'pending' | 'approved' | 'rejected' | 'completed';
export type StoredBookingStatus = BookingStatus | LegacyBookingStatus;

const transitions: Record<BookingStatus, readonly BookingStatus[]> = {
  draft: ['pending_approval', 'confirmed', 'cancelled'],
  pending_approval: ['confirmed', 'declined', 'cancelled'],
  confirmed: ['cancelled', 'completed', 'payment_failed'],
  declined: [],
  cancelled: [],
  completed: [],
  payment_failed: ['confirmed', 'cancelled'],
};

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === 'string' && value in transitions;
}

export function isStoredBookingStatus(value: unknown): value is StoredBookingStatus {
  return isBookingStatus(value)
    || value === 'pending'
    || value === 'approved'
    || value === 'rejected';
}

export function normalizeBookingStatus(status: StoredBookingStatus): BookingStatus {
  switch (status) {
    case 'pending': return 'pending_approval';
    case 'approved': return 'confirmed';
    case 'rejected': return 'declined';
    default: return status;
  }
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!transitions[from]?.includes(to)) {
    throw new Error(`Invalid booking transition: ${from} -> ${to}`);
  }
}

export function assertStandaloneTransition(to: StoredBookingStatus): void {
  if (normalizeBookingStatus(to) === 'completed') {
    throw new Error('Completion requires the atomic payment command');
  }
}
