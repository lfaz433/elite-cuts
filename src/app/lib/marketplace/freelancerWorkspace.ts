import type { CityId } from './discovery';

export type FreelancerScopeConstraint = readonly [
  field: 'ownerId' | 'ownerType',
  operator: '==',
  value: string,
];

export function freelancerOwnerScope(uid: string): FreelancerScopeConstraint[] {
  return [
    ['ownerId', '==', uid],
    ['ownerType', '==', 'freelancer'],
  ];
}

export function confirmedAddressBookingIds(
  bookings: Array<{ id: string; ownerType: string; status: string }>,
  cachedBookingIds: ReadonlySet<string>,
): string[] {
  return bookings
    .filter(booking => (
      booking.ownerType === 'freelancer'
      && booking.status === 'confirmed'
      && !cachedBookingIds.has(booking.id)
    ))
    .map(booking => booking.id);
}

export function jobBoardLoadKey(cityId: CityId, profileRevision: number): string {
  return `${cityId}:${profileRevision}`;
}
