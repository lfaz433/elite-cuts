import assert from 'node:assert/strict';
import test from 'node:test';
import type { MembershipSummary } from './session';
import { legacyRoleForLocation, membershipForLocation } from './sessionAccess';

const otherLocationAdmin: MembershipSummary = {
  id: 'membership-a',
  userId: 'user-a',
  brandId: 'brand-a',
  locationId: 'location-a',
  role: 'salon_admin',
  status: 'active',
  permissions: { manageStaff: true },
};

test('does not select an elevated membership from another location', () => {
  assert.equal(
    membershipForLocation([otherLocationAdmin], 'location-b'),
    undefined,
  );
});

test('selects a membership for the exact active location', () => {
  assert.equal(
    membershipForLocation([otherLocationAdmin], 'location-a'),
    otherLocationAdmin,
  );
});

test('does not accept a legacy admin claim from another tenant', () => {
  assert.equal(
    legacyRoleForLocation('admin', 'location-a', 'location-b'),
    'client',
  );
});

test('accepts a legacy admin claim for the exact active tenant', () => {
  assert.equal(
    legacyRoleForLocation('admin', 'location-a', 'location-a'),
    'admin',
  );
});
