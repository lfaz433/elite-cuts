export type BookingListenerScope =
  | { kind: 'none' }
  | { kind: 'tenant' }
  | { kind: 'client'; field: 'clientId'; value: string }
  | { kind: 'barber'; field: 'barberId'; value: string };

export type AssignedBarberRecordListenerScope =
  | { kind: 'none' }
  | { kind: 'tenant' }
  | { kind: 'barber'; field: 'barberId'; value: string };

interface BookingSessionIdentity {
  role: string;
  uid: string;
  barberId?: string;
}

export function bookingListenerScope(
  user: BookingSessionIdentity | null | undefined,
): BookingListenerScope {
  if (!user) return { kind: 'none' };
  if (user.role === 'client') {
    return { kind: 'client', field: 'clientId', value: user.uid };
  }
  if (user.role === 'barber') {
    return typeof user.barberId === 'string' && user.barberId
      ? { kind: 'barber', field: 'barberId', value: user.barberId }
      : { kind: 'none' };
  }
  if (user.role === 'admin' || user.role === 'superadmin') {
    return { kind: 'tenant' };
  }
  return { kind: 'none' };
}

export function assignedBarberRecordListenerScope(
  user: BookingSessionIdentity | null | undefined,
): AssignedBarberRecordListenerScope {
  if (!user) return { kind: 'none' };
  if (user.role === 'barber') {
    return typeof user.barberId === 'string' && user.barberId
      ? { kind: 'barber', field: 'barberId', value: user.barberId }
      : { kind: 'none' };
  }
  if (user.role === 'admin' || user.role === 'superadmin') {
    return { kind: 'tenant' };
  }
  return { kind: 'none' };
}
