// @ts-nocheck
const { readFileSync } = require('node:fs');
const { dirname, isAbsolute, resolve } = require('node:path');
const ts = require('typescript');

function loadModule(relativePath = 'campaigns.ts') {
  const filename = isAbsolute(relativePath) ? relativePath : resolve(__dirname, relativePath);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', output)(request => request.startsWith('.')
    ? loadModule(resolve(dirname(filename), `${request}.ts`))
    : require(request), loaded, loaded.exports);
  return loaded.exports;
}

describe('client campaign projection', () => {
  test.each([
    [{ completedVisits: 6, lastCompletedDate: '2026-09-01', accountCreatedAtMs: 0 }, 'vip'],
    [{ completedVisits: 1, lastCompletedDate: '2026-07-01', accountCreatedAtMs: 0 }, 'inactive'],
    [{ completedVisits: 0, accountCreatedAtMs: Date.parse('2026-09-01T00:00:00Z') }, 'new'],
    [{ completedVisits: 1, lastCompletedDate: '2026-09-01', accountCreatedAtMs: 0 }, 'active'],
  ])('derives a conservative client segment from completed visits %#', (facts, expected) => {
    const { clientCampaignSegment } = loadModule();
    expect(clientCampaignSegment(facts, new Date('2026-09-05T12:00:00Z'))).toBe(expected);
  });

  test('returns only active explicitly targeted or exact-tenant segment campaigns', async () => {
    const { listClientCampaigns } = loadModule();
    const state = {
      users: {
        'client-a': { uid: 'client-a', createdAt: '2025-01-01T00:00:00.000Z' },
      },
      bookings: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [
        `visit-${index}`,
        {
          clientId: 'client-a', tenantId: 'location-a', status: 'completed',
          date: `2026-08-${String(20 + index).padStart(2, '0')}`,
        },
      ]).concat([[
        'other-client',
        { clientId: 'client-b', tenantId: 'location-b', status: 'completed', date: '2026-09-01' },
      ]])),
      bookingRequests: {
        'marketplace-a': {
          clientId: 'client-a', ownerType: 'salon', ownerId: 'location-a',
          locationId: 'location-a', status: 'confirmed', date: '2026-09-04',
        },
        'other-client-request': {
          clientId: 'client-b', ownerType: 'salon', ownerId: 'location-b',
          locationId: 'location-b', status: 'confirmed', date: '2026-09-04',
        },
      },
      campaigns: {
        'all-a': {
          tenantId: 'location-a', title: 'Pour tous', description: 'Bienvenue',
          segment: 'all', status: 'active', couponCode: 'ALL10', discountAmount: 10,
        },
        'vip-a': {
          tenantId: 'location-a', title: 'VIP', description: 'Merci',
          segment: 'vip', status: 'active', couponCode: 'VIP20', discountAmount: 20,
        },
        'inactive-a': {
          tenantId: 'location-a', title: 'Retour', description: 'Revenez',
          segment: 'inactive', status: 'active', couponCode: 'BACK', discountAmount: 15,
        },
        'inactive-targeted': {
          tenantId: 'location-b', title: 'Offre personnelle', description: 'Pour Ada',
          segment: 'inactive', status: 'active', targetUserIds: ['client-a'],
        },
        'other-tenant': {
          tenantId: 'location-b', title: 'Autre salon', description: 'Privé',
          segment: 'all', status: 'active',
        },
        'inactive-status': {
          tenantId: 'location-a', title: 'Ancienne', description: 'Terminée',
          segment: 'all', status: 'inactive',
        },
      },
    };
    const firestore = queryFirestore(state);

    await expect(listClientCampaigns(
      'client-a', {}, firestore, new Date('2026-09-05T12:00:00Z'),
    )).resolves.toEqual([
      expect.objectContaining({ id: 'all-a', tenantId: 'location-a', segment: 'all' }),
      expect.objectContaining({ id: 'inactive-targeted', tenantId: 'location-b' }),
      expect.objectContaining({ id: 'vip-a', tenantId: 'location-a', segment: 'vip' }),
    ]);
    expect(firestore.queryLog).toEqual(expect.arrayContaining([
      ['bookings', 'clientId', '==', 'client-a'],
      ['bookingRequests', 'clientId', '==', 'client-a'],
      ['campaigns', 'targetUserIds', 'array-contains', 'client-a'],
      ['campaigns', 'tenantId', '==', 'location-a'],
    ]));
  });

  test('requires authentication and rejects caller-selected campaign scope', async () => {
    const { listClientCampaigns } = loadModule();
    const firestore = queryFirestore({ users: {}, bookings: {}, bookingRequests: {}, campaigns: {} });

    await expect(listClientCampaigns(null, {}, firestore)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(listClientCampaigns('client-a', { tenantId: 'location-b' }, firestore))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

function queryFirestore(state) {
  const queryLog = [];
  const collection = name => {
    const filters = [];
    const reference = {
      doc(id) {
        return {
          get: async () => ({
            exists: Boolean(state[name]?.[id]),
            id,
            data: () => state[name]?.[id],
          }),
        };
      },
      where(field, operator, value) {
        queryLog.push([name, field, operator, value]);
        filters.push([field, operator, value]);
        return reference;
      },
      async get() {
        return {
          docs: Object.entries(state[name] ?? {}).filter(([, value]) => filters.every(([
            field, operator, expected,
          ]) => operator === 'array-contains'
            ? Array.isArray(value[field]) && value[field].includes(expected)
            : value[field] === expected)).map(([id, value]) => ({ id, data: () => value })),
        };
      },
    };
    return reference;
  };
  return { collection, queryLog };
}
