// @ts-nocheck
const { readFileSync } = require('node:fs');
const { isAbsolute, resolve } = require('node:path');
const ts = require('typescript');

function loadModule(relativePath) {
  const filename = isAbsolute(relativePath) ? relativePath : resolve(__dirname, relativePath);
  const source = readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    request => request === 'firebase-admin' || request === 'firebase-functions'
      ? require(resolve(__dirname, '..', 'node_modules', request))
      : require(request),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

function snapshot(value, id = '') {
  return { exists: value !== undefined, id, data: () => value };
}

function firestoreState(initial) {
  const state = structuredClone(initial);
  let nextId = 0;
  const reference = (collectionName, id) => ({
    collectionName,
    id: id ?? `${collectionName}-${++nextId}`,
    get: async () => snapshot(state[collectionName]?.[id], id),
  });
  return {
    state,
    firestore: {
      collection(collectionName) {
        return {
          doc(id) { return reference(collectionName, id); },
          where(field, operator, value) {
            const filters = [[field, operator, value]];
            const query = {
              where(nextField, nextOperator, nextValue) {
                filters.push([nextField, nextOperator, nextValue]);
                return query;
              },
              async get() {
                const docs = Object.entries(state[collectionName] ?? {})
                  .filter(([, data]) => filters.every(([key, operation, expected]) => (
                    operation === '==' && data[key] === expected
                  )))
                  .map(([id, data]) => snapshot(data, id));
                return { docs, empty: docs.length === 0 };
              },
            };
            return query;
          },
        };
      },
      async runTransaction(callback) {
        return callback({
          get: async ref => snapshot(state[ref.collectionName]?.[ref.id], ref.id),
          getAll: async (...refs) => refs.map(ref => snapshot(state[ref.collectionName]?.[ref.id], ref.id)),
          create(ref, value) {
            state[ref.collectionName] ??= {};
            if (state[ref.collectionName][ref.id]) throw new Error('already exists');
            state[ref.collectionName][ref.id] = value;
          },
          set(ref, value) {
            state[ref.collectionName] ??= {};
            state[ref.collectionName][ref.id] = value;
          },
          update(ref, value) {
            state[ref.collectionName] ??= {};
            state[ref.collectionName][ref.id] = { ...state[ref.collectionName][ref.id], ...value };
          },
          delete(ref) {
            delete state[ref.collectionName]?.[ref.id];
          },
        });
      },
    },
  };
}

const profileA = {
  uid: 'freelancer-a',
  displayName: 'Ada Barber',
  cityId: 'fr-paris',
  visible: true,
};

const parisEmployeeJob = {
  brandId: 'brand-a',
  locationId: 'location-paris',
  cityId: 'fr-paris',
  relationshipType: 'employee',
  title: 'Barbier salarié',
  description: 'Poste à temps plein',
  serviceIds: ['cut'],
  schedule: 'Mardi au samedi',
  terms: 'Selon expérience',
  status: 'published',
};

describe('freelancer jobs and settings', () => {
  test('publishes a location-scoped job using the salon city name', async () => {
    const { createJobPost } = loadModule('jobs.ts');
    const { firestore, state } = firestoreState({
      salonLocations: { 'location-paris': { brandId: 'brand-a', city: 'Paris', countryCode: 'FR' } },
      memberships: { 'brand-a__location-paris__manager-a': { userId: 'manager-a', brandId: 'brand-a', locationId: 'location-paris', role: 'salon_admin', status: 'active', permissions: { manageJobs: true } } },
      jobPosts: {}, auditEvents: {},
    });

    const result = await createJobPost('manager-a', {
      locationId: 'location-paris', relationshipType: 'employee', title: 'Barbier salarié',
      description: 'Poste à temps plein', serviceIds: ['cut'], schedule: 'Mardi au samedi',
      terms: 'Selon expérience',
    }, firestore);

    expect(state.jobPosts[result.jobId]).toMatchObject({
      locationId: 'location-paris', cityId: 'fr-paris', status: 'published',
    });
  });

  test('rejects an application containing another freelancer portfolio item', async () => {
    const { applyToJob } = loadModule('jobs.ts');
    const baseState = {
      freelancerProfiles: { 'freelancer-a': profileA },
      jobPosts: { 'job-paris': parisEmployeeJob },
      portfolioItems: {
        'owned-item': { ownerId: 'freelancer-a', ownerType: 'freelancer', imageUrl: 'https://example.test/owned.jpg' },
        'foreign-item': { ownerId: 'freelancer-b', ownerType: 'freelancer', imageUrl: 'https://example.test/foreign.jpg' },
      },
      jobApplications: {},
      auditEvents: {},
    };
    const own = firestoreState(baseState);
    await expect(applyToJob({ uid: 'freelancer-a', email: 'ada@example.test', emailVerified: true }, {
      jobId: 'job-paris', portfolioItemIds: ['owned-item'], message: 'Mon portfolio.',
    }, own.firestore)).resolves.toEqual({ applicationId: 'job-paris__freelancer-a' });

    const foreign = firestoreState(baseState);

    await expect(applyToJob({ uid: 'freelancer-a', email: 'ada@example.test', emailVerified: true }, {
      jobId: 'job-paris',
      portfolioItemIds: ['owned-item', 'foreign-item'],
      message: 'Je souhaite rejoindre votre équipe.',
    }, foreign.firestore)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('rejects an application outside the freelancer city', async () => {
    const { applyToJob } = loadModule('jobs.ts');
    const { firestore } = firestoreState({
      freelancerProfiles: { 'freelancer-a': profileA },
      jobPosts: { 'job-grenoble': { ...parisEmployeeJob, cityId: 'fr-grenoble', locationId: 'location-grenoble' } },
      portfolioItems: {}, jobApplications: {}, auditEvents: {},
    });

    await expect(applyToJob({ uid: 'freelancer-a', email: 'ada@example.test', emailVerified: true }, {
      jobId: 'job-grenoble', portfolioItemIds: [], message: 'Bonjour.',
    }, firestore)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test.each([
    ['employee', 'worker'],
    ['chair_rental', 'chair_renter'],
  ])('converts a selected %s application to the matching invitation role', async (relationshipType, expectedRole) => {
    const { reviewJobApplication } = loadModule('jobs.ts');
    const { firestore, state } = firestoreState({
      jobPosts: { 'job-paris': { ...parisEmployeeJob, relationshipType } },
      jobApplications: {
        'application-a': {
          jobId: 'job-paris', applicantId: 'freelancer-a', applicantEmail: 'ada@example.test',
          applicantName: 'Ada Barber', brandId: 'brand-a', locationId: 'location-paris',
          cityId: 'fr-paris', relationshipType, status: 'submitted',
        },
      },
      memberships: {
        'brand-a__location-paris__manager-a': {
          userId: 'manager-a', brandId: 'brand-a', locationId: 'location-paris',
          role: 'salon_admin', status: 'active', permissions: { manageJobs: true },
        },
      },
      invitations: {}, auditEvents: {},
    });

    const result = await reviewJobApplication('manager-a', {
      applicationId: 'application-a', decision: 'invite',
    }, firestore);

    expect(result.status).toBe('invited');
    expect(state.invitations[result.invitationId]).toMatchObject({
      applicationId: 'application-a', relationshipType, role: expectedRole,
      email: 'ada@example.test', locationId: 'location-paris', status: 'pending',
    });
  });

  test('preserves server moderation while saving owned visibility and availability', async () => {
    const { saveFreelancerProfile } = loadModule('freelancers.ts');
    const { firestore, state } = firestoreState({
      freelancerProfiles: {
        'freelancer-a': { ...profileA, publicProfile: { approvalStatus: 'approved', visible: false } },
      },
      availability: {}, auditEvents: {},
    });

    await saveFreelancerProfile('freelancer-a', {
      displayName: 'Ada Barber', bio: 'Barbière indépendante à Paris.', cityId: 'fr-paris',
      languages: ['fr', 'en'], serviceSummary: 'Coupe et barbe', serviceIds: ['cut', 'beard'],
      visible: true, radiusKm: 12, travelFeeMinor: 800,
      deposit: { mode: 'fixed', value: 1000 }, cancellationWindowHours: 24,
      availability: ['2099-09-07T10:00', '2099-09-07T11:00'],
    }, firestore);

    expect(state.freelancerProfiles['freelancer-a']).toMatchObject({
      uid: 'freelancer-a', visible: true, radiusKm: 12, travelFeeMinor: 800,
      publicProfile: { approvalStatus: 'approved', visible: true, cityId: 'fr-paris' },
    });
    expect(state.availability['freelancer-a']).toMatchObject({
      ownerId: 'freelancer-a', availableSlots: ['2099-09-07T10:00', '2099-09-07T11:00'],
    });
  });

  test('refreshes approved portfolio URLs immediately and caps them to the public projection limit', async () => {
    const {
      MAX_APPROVED_PORTFOLIO_ITEMS,
      refreshFreelancerPortfolioProjection,
    } = loadModule('freelancers.ts');
    const { MAX_PUBLIC_PORTFOLIO_URLS, projectFreelancerPublicProfile } = loadModule('publicProfiles.ts');
    const portfolioItems = Object.fromEntries(Array.from({ length: 13 }, (_, index) => [
      `item-${index + 1}`,
      {
        ownerId: 'freelancer-a', ownerType: 'freelancer', visible: true,
        moderationStatus: 'approved', imageUrl: `https://example.test/${index + 1}.jpg`,
      },
    ]));
    const { firestore, state } = firestoreState({
      freelancerProfiles: {
        'freelancer-a': {
          ...profileA,
          serviceSummary: 'Coupe',
          publicProfile: {
            approvalStatus: 'approved', visible: true, cityId: 'fr-paris',
            latitude: 48.85, longitude: 2.35, serviceSummary: 'Coupe', serviceIds: ['cut'],
            homeVisit: true, portfolioUrls: ['https://example.test/stale.jpg'],
          },
        },
      },
      portfolioItems,
    });

    await refreshFreelancerPortfolioProjection('freelancer-a', firestore);

    expect(MAX_APPROVED_PORTFOLIO_ITEMS).toBe(MAX_PUBLIC_PORTFOLIO_URLS);
    expect(state.freelancerProfiles['freelancer-a'].publicProfile.portfolioUrls).toHaveLength(12);
    expect(state.freelancerProfiles['freelancer-a'].publicProfile.portfolioUrls)
      .not.toContain('https://example.test/stale.jpg');
    expect(projectFreelancerPublicProfile('freelancer-a', state.freelancerProfiles['freelancer-a']))
      .not.toBeNull();
  });

  test('removes deleted approved portfolio URLs without waiting for a profile save', async () => {
    const { refreshFreelancerPortfolioProjection } = loadModule('freelancers.ts');
    const { firestore, state } = firestoreState({
      freelancerProfiles: {
        'freelancer-a': {
          ...profileA,
          publicProfile: { portfolioUrls: ['https://example.test/deleted.jpg'] },
        },
      },
      portfolioItems: {},
    });

    await refreshFreelancerPortfolioProjection('freelancer-a', firestore);

    expect(state.freelancerProfiles['freelancer-a'].publicProfile.portfolioUrls).toEqual([]);
  });
});

describe('deposits remain fail closed', () => {
  test('rejects a deposit for a pending booking', async () => {
    const { createConfirmedDeposit } = loadModule('deposits.ts');
    const { firestore } = firestoreState({
      bookingRequests: { 'booking-a': { clientId: 'client-a', status: 'pending_approval', countryCode: 'FR' } },
    });

    await expect(createConfirmedDeposit('client-a', { bookingId: 'booking-a' }, firestore))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('rejects confirmed bookings because online deposit collection is disabled', async () => {
    const { createConfirmedDeposit } = loadModule('deposits.ts');
    const { firestore, state } = firestoreState({
      bookingRequests: { 'booking-a': { clientId: 'client-a', status: 'confirmed', countryCode: 'FR' } },
      paymentCapabilities: { FR: { onlineDeposits: false } },
      marketplaceDeposits: {},
    });

    await expect(createConfirmedDeposit('client-a', { bookingId: 'booking-a' }, firestore))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.marketplaceDeposits).toEqual({});
  });
});
