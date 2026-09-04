export interface TransactionBookingState {
  tenantId?: unknown;
  locationId?: unknown;
}

export interface TransactionMembershipState {
  userId?: unknown;
  locationId?: unknown;
  status?: unknown;
  permissions?: Record<string, unknown>;
}

export function assertTransitionTransactionState(
  uid: string,
  expectedTenantId: string,
  expectedLocationId: string,
  booking: TransactionBookingState | undefined,
  membership: TransactionMembershipState | undefined,
): void {
  const tenantId = booking?.tenantId;
  const locationId = booking?.locationId ?? tenantId;
  if (tenantId !== expectedTenantId || locationId !== expectedLocationId) {
    throw new Error('Booking scope changed during transition');
  }

  if (
    membership?.userId !== uid
    || membership.locationId !== expectedLocationId
    || membership.status !== 'active'
    || membership.permissions?.manageBookings !== true
  ) {
    throw new Error('Booking authorization changed during transition');
  }
}
