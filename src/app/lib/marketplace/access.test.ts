import assert from 'node:assert/strict';
import test from 'node:test';
import type { MembershipSummary } from '../session';
import {
  brandDashboardHomePath,
  hasBrandDashboardAccess,
  managerLocationIds,
  managerLocationForRoute,
  resolveMarketplaceManager,
} from './access';

function membership(overrides: Partial<MembershipSummary>): MembershipSummary {
  return {
    id: 'membership',
    userId: 'user-a',
    brandId: 'brand-a',
    locationId: 'location-a',
    role: 'worker',
    status: 'active',
    permissions: {},
    ...overrides,
  };
}

test('keeps a legacy tenant principal on the legacy admin route', async () => {
  const legacyPrincipal = membership({
    brandId: 'legacy-tenant',
    locationId: 'legacy-tenant',
    role: 'principal_admin',
    permissions: { manageStaff: true },
  });
  const manager = await resolveMarketplaceManager([legacyPrincipal], async candidate => (
    candidate.brandId !== 'legacy-tenant'
  ));
  const user = {
    role: 'admin',
    memberships: [legacyPrincipal],
    brandId: manager?.brandId,
  };

  assert.equal(manager, undefined);
  assert.equal(brandDashboardHomePath(user), '/admin');
  assert.equal(hasBrandDashboardAccess(user), false);
});

test('excludes worker-only locations from a manager dashboard and deep-link scope', async () => {
  const salonAdmin = membership({
    id: 'paris-admin',
    locationId: 'paris',
    role: 'salon_admin',
    permissions: { manageStaff: true },
  });
  const worker = membership({
    id: 'grenoble-worker',
    locationId: 'grenoble',
    role: 'worker',
    permissions: { manageBookings: true },
  });
  const delegatedManager = membership({
    id: 'mulhouse-manager',
    locationId: 'mulhouse',
    role: 'worker',
    permissions: { inviteWorkers: true },
  });
  const memberships = [salonAdmin, worker, delegatedManager];
  const manager = await resolveMarketplaceManager(memberships, async () => true);
  const user = { role: 'barber', brandId: manager?.brandId, memberships };

  assert.equal(brandDashboardHomePath(user), '/brand');
  assert.equal(hasBrandDashboardAccess(user), true);
  assert.deepEqual(managerLocationIds(memberships, 'brand-a'), ['paris', 'mulhouse']);
  assert.equal(managerLocationIds(memberships, 'brand-a').includes('grenoble'), false);
  assert.equal(
    managerLocationForRoute('grenoble', managerLocationIds(memberships, 'brand-a'), null),
    'paris',
  );
});
