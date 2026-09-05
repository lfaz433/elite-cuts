const { readFileSync } = require('node:fs');
const { dirname, isAbsolute, resolve } = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath) {
  const filename = isAbsolute(relativePath)
    ? relativePath
    : resolve(__dirname, '..', relativePath);
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
      ? loadTypeScriptModule(resolve(dirname(filename), `${request}.ts`))
      : request === 'firebase-admin' || request === 'firebase-functions'
        ? require(resolve(__dirname, '..', 'functions', 'node_modules', request))
        : require(request),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const safeInfo = {
  name: 'Salon Paris',
  address: '1 rue Exemple',
  phone: '+33100000000',
  email: 'contact@example.test',
  adminEmail: 'owner@example.test',
  hours: { weekdays: '09:00 - 19:00', weekends: '10:00 - 17:00' },
  weeklyHours: {
    monday: { isOpen: true, open: '09:00', close: '19:00' },
    sunday: { isOpen: false, open: '10:00', close: '17:00' },
  },
  socials: { instagram: 'https://instagram.com/example', facebook: '' },
  instagram: 'https://instagram.com/example',
  tiktok: 'https://tiktok.com/@example',
  facebook: 'https://facebook.com/example',
  website: 'https://example.test',
  mapUrl: 'https://maps.example.test/salon',
  latitude: 48.8566,
  longitude: 2.3522,
  logo: 'data:image/png;base64,AAAA',
  heroImage: 'https://example.test/hero.jpg',
  heroTitle: 'Bienvenue',
  heroSubtitle: 'Une coupe premium',
  heroButtonText: 'Réserver',
  showStatsSection: true,
  stats: [{ id: 'rating', label: 'Note', value: '4.9', enabled: true }],
  timezone: 'Europe/Paris',
  bookingPolicy: 'manual',
};

function fakeFirestore({ membership = {}, tenantExists = true } = {}) {
  const state = {
    memberships: {
      'membership-a': {
        userId: 'manager-a',
        brandId: 'brand-a',
        locationId: 'location-a',
        role: 'salon_admin',
        status: 'active',
        permissions: { manageStaff: true },
        ...membership,
      },
    },
    tenants: tenantExists ? { 'location-a': { brandId: 'brand-a' } } : {},
    businessInfo: {
      info: {
        name: 'Legacy Salon',
        password: 'plaintext',
        branding: { credentials: { secret: 'plaintext' } },
      },
    },
  };
  const firestore = {
    collection: collectionName => ({
      doc: id => ({
        collectionName,
        id,
        collection: childName => ({
          doc: childId => ({ collectionName: childName, id: childId, parentId: id }),
        }),
      }),
    }),
    runTransaction: async callback => callback({
      getAll: async (...refs) => refs.map(ref => ({
        exists: Boolean(state[ref.collectionName]?.[ref.id]),
        data: () => state[ref.collectionName]?.[ref.id],
      })),
      set: (ref, value) => {
        state[ref.collectionName][ref.id] = value;
      },
    }),
  };
  return { firestore, state };
}

test.each(['manual', 'automatic'])('business info parser accepts the complete public schema with %s policy', bookingPolicy => {
  const { parseBusinessInfoUpdate } = loadTypeScriptModule('functions/src/businessInfo.ts');
  const info = { ...safeInfo, bookingPolicy };

  expect(parseBusinessInfoUpdate({ tenantId: 'location-a', info })).toEqual({
    tenantId: 'location-a',
    info,
  });
});

test.each([
  { ...safeInfo, publicCredentialSafe: true },
  { ...safeInfo, branding: { credentials: { password: 'plaintext' } } },
  { ...safeInfo, hours: { ...safeInfo.hours, temporaryCredential: 'plaintext' } },
  { ...safeInfo, stats: [{ ...safeInfo.stats[0], workerPassword: 'plaintext' }] },
  { ...safeInfo, bookingPolicy: 'client-forged-status' },
])('business info parser rejects server-owned, unknown, and nested credential fields %#', info => {
  const { parseBusinessInfoUpdate } = loadTypeScriptModule('functions/src/businessInfo.ts');

  expect(() => parseBusinessInfoUpdate({ tenantId: 'location-a', info }))
    .toThrow(/not allowed|invalid/i);
});

test('authorized business info update overwrites legacy unsafe public data', async () => {
  const { updateBusinessInfo } = loadTypeScriptModule('functions/src/businessInfo.ts');
  const { firestore, state } = fakeFirestore();
  const authorize = async () => ({ id: 'membership-a' });

  await updateBusinessInfo(
    'manager-a',
    { tenantId: 'location-a', info: safeInfo },
    firestore,
    authorize,
  );

  expect(state.businessInfo.info).toEqual({ ...safeInfo, publicCredentialSafe: true });
  const { publicCredentialSafe, ...publicFields } = state.businessInfo.info;
  expect(publicCredentialSafe).toBe(true);
  expect(JSON.stringify(publicFields)).not.toMatch(/password|credential/i);
});

test.each([
  { status: 'revoked' },
  { permissions: { manageStaff: false } },
  { userId: 'attacker' },
  { locationId: 'location-b' },
])('transaction recheck rejects stale or mismatched manageStaff authority %#', async membership => {
  const { updateBusinessInfo } = loadTypeScriptModule('functions/src/businessInfo.ts');
  const { firestore, state } = fakeFirestore({ membership });
  const before = structuredClone(state.businessInfo.info);
  const authorize = async () => ({ id: 'membership-a' });

  await expect(updateBusinessInfo(
    'manager-a',
    { tenantId: 'location-a', info: safeInfo },
    firestore,
    authorize,
  )).rejects.toMatchObject({ code: 'permission-denied' });
  expect(state.businessInfo.info).toEqual(before);
});

test('business context uses the callable instead of writing the public document directly', () => {
  const source = readFileSync(
    resolve(__dirname, '..', 'src/app/components/context/BusinessContext.tsx'),
    'utf8',
  );
  const updateBody = source.match(
    /const updateBusinessInfo = async[\s\S]+?\n  };\n\n  const addToGallery/,
  )?.[0] ?? '';

  expect(updateBody).toMatch(/httpsCallable[\s\S]+updateBusinessInfo/);
  expect(updateBody).not.toMatch(/setDoc\s*\(/);
});
