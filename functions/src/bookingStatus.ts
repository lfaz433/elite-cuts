export type BookingStatus =
  | 'draft'
  | 'pending_approval'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'completed'
  | 'payment_failed';

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

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!transitions[from]?.includes(to)) {
    throw new Error(`Invalid booking transition: ${from} -> ${to}`);
  }
}
