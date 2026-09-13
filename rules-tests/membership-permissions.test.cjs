const { readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath) {
  const filename = resolve(__dirname, '..', relativePath);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    request => request.startsWith('.')
      ? require(resolve(dirname(filename), request))
      : request === 'firebase-admin' || request === 'firebase-functions'
        ? require(resolve(__dirname, '..', 'functions', 'node_modules', request))
        : require(request),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const allPermissions = inviteWorkers => ({
  manageBookings: true,
  manageStaff: true,
  inviteWorkers,
  removeWorkers: false,
  manageServices: true,
  manageInventory: false,
  manageJobs: true,
});

function fakeFirestore({ callerRole = 'principal_admin', targetBrand = 'brand-a', targetHasUser = true } = {}) {
  const state = {
    memberships: {
      'brand-a__principal__owner-a': {
        userId: 'owner-a', brandId: 'brand-a', role: callerRole, status: 'active', permissions: allPermissions(true),
      },
      'brand-a__paris__admin-a': {
        ...(targetHasUser ? { userId: 'admin-a' } : {}), brandId: targetBrand, locationId: 'paris', role: 'salon_admin', status: 'active', permissions: allPermissions(false),
      },
    },
    salonLocations: {
      paris: { brandId: 'brand-a' },
    },
    auditEvents: {},
  };
  const firestore = {
    collection: name => ({
      doc: id => ({ collectionName: name, id: id ?? 'audit-a' }),
    }),
    runTransaction: async callback => callback({
      getAll: async (...refs) => refs.map(ref => ({
        exists: Boolean(state[ref.collectionName]?.[ref.id]),
        data: () => state[ref.collectionName]?.[ref.id],
      })),
      update: (ref, value) => {
        state[ref.collectionName][ref.id] = { ...state[ref.collectionName][ref.id], ...value };
      },
      create: (ref, value) => {
        state[ref.collectionName][ref.id] = value;
      },
    }),
  };
  return { firestore, state };
}

test('Principal Admin updates one Salon Admin permission and emits immutable audit data', async () => {
  const { updateMembershipPermissions } = loadTypeScriptModule('functions/src/memberships.ts');
  const { firestore, state } = fakeFirestore();

  await updateMembershipPermissions('owner-a', {
    membershipId: 'brand-a__paris__admin-a',
    permissions: allPermissions(true),
  }, firestore);

  expect(state.memberships['brand-a__paris__admin-a'].permissions.inviteWorkers).toBe(true);
  expect(state.auditEvents['audit-a']).toMatchObject({
    action: 'MEMBERSHIP_PERMISSIONS_UPDATED',
    actorUid: 'owner-a',
    brandId: 'brand-a',
    locationId: 'paris',
    targetMembershipId: 'brand-a__paris__admin-a',
    before: { permissions: { inviteWorkers: false } },
    after: { permissions: { inviteWorkers: true } },
  });
});

test.each([
  [{ callerRole: 'salon_admin' }, { membershipId: 'brand-a__paris__admin-a', permissions: allPermissions(true) }],
  [{ targetBrand: 'brand-b' }, { membershipId: 'brand-a__paris__admin-a', permissions: allPermissions(true) }],
  [{ targetHasUser: false }, { membershipId: 'brand-a__paris__admin-a', permissions: allPermissions(true) }],
  [{}, { membershipId: 'brand-a__paris__admin-a', role: 'principal_admin', permissions: allPermissions(true) }],
])('permission mutation rejects non-principal, cross-brand, and role escalation %#', async (setup, input) => {
  const { updateMembershipPermissions } = loadTypeScriptModule('functions/src/memberships.ts');
  const { firestore, state } = fakeFirestore(setup);

  await expect(updateMembershipPermissions('owner-a', input, firestore))
    .rejects.toMatchObject({ code: expect.stringMatching(/permission-denied|invalid-argument|failed-precondition/) });
  expect(state.memberships['brand-a__paris__admin-a'].permissions.inviteWorkers).toBe(false);
  expect(state.auditEvents).toEqual({});
});
