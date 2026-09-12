// @ts-nocheck
const { readFileSync } = require('node:fs');
const { isAbsolute, resolve } = require('node:path');
const ts = require('typescript');

function loadModule(relativePath = 'referrals.ts') {
  const filename = isAbsolute(relativePath) ? relativePath : resolve(__dirname, relativePath);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', output)(request => (
    request === 'firebase-admin' || request === 'firebase-functions'
      ? require(resolve(__dirname, '..', 'node_modules', request))
      : require(request)
  ), loaded, loaded.exports);
  return loaded.exports;
}

function snapshot(value, id = '') {
  return { exists: value !== undefined, id, data: () => value };
}

function firestoreState(initial, { retryFirstTransaction = false } = {}) {
  const state = structuredClone(initial);
  let nextId = 0;
  let retryUsed = false;
  const versions = new Map();
  const keyFor = ref => `${ref.collectionName}/${ref.id}`;
  const reference = (collectionName, id) => ({
    collectionName,
    id: id ?? `${collectionName}-${++nextId}`,
    get: async () => snapshot(state[collectionName]?.[id], id),
  });
  const query = (collectionName, filters = []) => ({
    collectionName,
    isQuery: true,
    filters,
    where(field, operator, value) {
      return query(collectionName, [...filters, [field, operator, value]]);
    },
    async get() {
      const docs = Object.entries(state[collectionName] ?? {})
        .filter(([, data]) => filters.every(([field, operator, value]) => (
          operator === '==' && data[field] === value
        )))
        .map(([id, data]) => snapshot(data, id));
      return { docs, empty: docs.length === 0 };
    },
  });
  return {
    state,
    firestore: {
      collection(collectionName) {
        return {
          doc(id) { return reference(collectionName, id); },
          get() { return query(collectionName).get(); },
          where(field, operator, value) { return query(collectionName, [[field, operator, value]]); },
        };
      },
      async runTransaction(callback) {
        for (;;) {
          const reads = new Map();
          const writes = [];
          const transactionState = structuredClone(state);
          const read = async ref => {
            if (ref.isQuery) {
              const docs = Object.entries(transactionState[ref.collectionName] ?? {})
                .filter(([, data]) => ref.filters.every(([field, operator, value]) => (
                  operator === '==' && data[field] === value
                )))
                .map(([id, data]) => snapshot(data, id));
              return { docs, empty: docs.length === 0 };
            }
            reads.set(keyFor(ref), versions.get(keyFor(ref)) ?? 0);
            return snapshot(transactionState[ref.collectionName]?.[ref.id], ref.id);
          };
          const result = await callback({
            get: read,
            getAll: async (...refs) => Promise.all(refs.map(read)),
            create(ref, value) { writes.push({ operation: 'create', ref, value }); },
            set(ref, value) { writes.push({ operation: 'set', ref, value }); },
            update(ref, value) { writes.push({ operation: 'update', ref, value }); },
          });
          if ([...reads].some(([key, version]) => (versions.get(key) ?? 0) !== version)) continue;
          for (const write of writes) {
            state[write.ref.collectionName] ??= {};
            if (write.operation === 'create' && state[write.ref.collectionName][write.ref.id]) {
              throw new Error('already exists');
            }
            state[write.ref.collectionName][write.ref.id] = write.operation === 'update'
              ? { ...state[write.ref.collectionName][write.ref.id], ...write.value }
              : write.value;
            const key = keyFor(write.ref);
            versions.set(key, (versions.get(key) ?? 0) + 1);
          }
          if (retryFirstTransaction && !retryUsed) {
            retryUsed = true;
            continue;
          }
          return result;
        }
      },
    },
  };
}

const activeProgram = {
  status: 'active', countryCodes: ['FR'], currency: 'EUR', inviterCreditMinor: 500,
  invitedDiscountMinor: 300, startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-10-01T00:00:00.000Z',
};

describe('referral domain', () => {
  test('returns aggregate referral marketing data only to a super admin', async () => {
    const { getReferralMarketingOverview } = loadModule();
    const { firestore } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      referralPrograms: {
        'program-a': activeProgram,
      },
      referralCodes: {
        INVITER: { code: 'INVITER', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' },
      },
      referralAttributions: {
        'invited-a': { programId: 'program-a', code: 'INVITER', inviterId: 'inviter-a', inviterOwnerType: 'client' },
      },
      referralRewards: {
        'reward-a': {
          programId: 'program-a', bookingId: 'booking-a', inviterId: 'inviter-a', inviterOwnerType: 'client', invitedUserId: 'invited-a',
          inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR', status: 'pending', createdAt: '2026-09-12T10:00:00.000Z',
        },
      },
    });

    await expect(getReferralMarketingOverview('admin-a', {}, firestore)).resolves.toEqual({
      programs: [{
        id: 'program-a', status: 'active', countryCodes: ['FR'], currency: 'EUR', inviterCreditMinor: 500,
        invitedDiscountMinor: 300, startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-10-01T00:00:00.000Z',
      }],
      funnel: { codes: 1, attributions: 1, rewards: 1, pending: 1, approved: 0, rejected: 0 },
      topReferrers: [{ inviterId: 'inviter-a', inviterOwnerType: 'client', referrals: 1, rewards: 1, approvedCreditsMinor: 0, currency: 'EUR' }],
      pendingRewards: [{
        id: 'reward-a', programId: 'program-a', bookingId: 'booking-a', inviterId: 'inviter-a', invitedUserId: 'invited-a',
        inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR', status: 'pending', createdAt: '2026-09-12T10:00:00.000Z',
      }],
    });
  });

  test('keeps client and brand referrers with the same ID separate in the marketing overview', async () => {
    const { getReferralMarketingOverview } = loadModule();
    const { firestore } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      referralPrograms: {}, referralCodes: {},
      referralAttributions: {
        client: { inviterId: 'X', inviterOwnerType: 'client' },
        brand: { inviterId: 'X', inviterOwnerType: 'brand' },
        legacy: { inviterId: 'X' },
      },
      referralRewards: {
        client: { inviterId: 'X', inviterOwnerType: 'client', inviterCreditMinor: 500, currency: 'EUR', status: 'approved' },
        brand: { inviterId: 'X', inviterOwnerType: 'brand', inviterCreditMinor: 700, currency: 'EUR', status: 'approved' },
        legacy: { inviterId: 'X', inviterCreditMinor: 900, currency: 'EUR', status: 'approved' },
      },
    });

    await expect(getReferralMarketingOverview('admin-a', {}, firestore)).resolves.toMatchObject({
      funnel: { attributions: 3, rewards: 3, approved: 3 },
      topReferrers: [
        { inviterId: 'X', inviterOwnerType: 'brand', referrals: 1, rewards: 1, approvedCreditsMinor: 700, currency: 'EUR' },
        { inviterId: 'X', inviterOwnerType: 'client', referrals: 1, rewards: 1, approvedCreditsMinor: 500, currency: 'EUR' },
      ],
    });
  });

  test('recognizes only a transition into completed as referral eligible', () => {
    const { isReferralEligibleCompletion } = loadModule('bookingStatus.ts');

    expect(isReferralEligibleCompletion('confirmed', 'completed')).toBe(true);
    expect(isReferralEligibleCompletion('approved', 'completed')).toBe(true);
    expect(isReferralEligibleCompletion('completed', 'completed')).toBe(false);
    expect(isReferralEligibleCompletion('pending', 'completed')).toBe(false);
    expect(isReferralEligibleCompletion('confirmed', 'cancelled')).toBe(false);
    expect(isReferralEligibleCompletion('invalid', 'completed')).toBe(false);
  });

  test('serializes concurrent program activations through one active program state document', async () => {
    const { createReferralProgram } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } }, referralPrograms: {}, referralProgramState: {}, auditEvents: {},
    });
    const now = new Date('2026-09-12T12:00:00Z');

    const attempts = await Promise.allSettled(['program-a', 'program-b'].map(programId => (
      createReferralProgram('admin-a', { ...activeProgram, programId }, firestore, now)
    )));

    expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(attempt => attempt.status === 'rejected')[0].reason)
      .toMatchObject({ code: 'failed-precondition' });
    expect(Object.values(state.referralPrograms).filter(program => program.status === 'active')).toHaveLength(1);
    expect(state.referralProgramState.active.programId).toMatch(/program-[ab]/);
  });

  test('normalizes share codes into the globally comparable form', () => {
    const { normalizeReferralCode } = loadModule();

    expect(normalizeReferralCode(' Salon-Paris ')).toBe('SALON-PARIS');
  });

  test('rejects self-attribution before creating an immutable attribution', async () => {
    const { attributeReferral } = loadModule();
    const { firestore, state } = firestoreState({
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: {
        OWN: { code: 'OWN', programId: 'program-a', ownerType: 'client', ownerId: 'new-client', status: 'active' },
      },
      referralAttributions: {},
    });

    await expect(attributeReferral('new-client', { code: 'OWN' }, firestore, new Date('2026-09-12T12:00:00Z')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.referralAttributions).toEqual({});
  });

  test('permits a client to use an unrelated brand code with the same ID through reward approval', async () => {
    const { attributeReferral, processReferralBookingCompletion, reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { X: { uid: 'X' }, 'admin-a': { role: 'superadmin' } },
      freelancerProfiles: {}, memberships: {}, brands: { X: { name: 'X' } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { BRANDX: { code: 'BRANDX', programId: 'program-a', ownerType: 'brand', ownerId: 'X', status: 'active' } },
      referralAttributions: {}, bookings: {},
      referralRewards: {}, creditLedgers: {}, auditEvents: {},
    });
    const now = new Date('2026-09-12T12:00:00Z');

    await expect(attributeReferral('X', { code: 'BRANDX' }, firestore, now))
      .resolves.toEqual({ attributed: true, programId: 'program-a' });
    expect(state.referralAttributions.X).toMatchObject({ inviterId: 'X', inviterOwnerType: 'brand' });
    state.bookings['booking-x'] = { clientId: 'X', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500 };
    await expect(processReferralBookingCompletion('booking-x', firestore, now)).resolves.toEqual({ created: true });
    expect(state.referralRewards['program-a__X']).toMatchObject({ inviterOwnerId: 'X', inviterOwnerType: 'brand' });
    await expect(reviewReferralReward('admin-a', { rewardId: 'program-a__X', decision: 'approve' }, firestore))
      .resolves.toEqual({ rewardId: 'program-a__X', status: 'approved' });
    expect(state.creditLedgers['program-a__X__inviter']).toMatchObject({ ownerId: 'X', ownerType: 'brand' });
  });

  test('reserves a normalized code once and keeps the code owner server-derived', async () => {
    const { reserveReferralCode } = loadModule();
    const { firestore, state } = firestoreState({
      referralPrograms: { 'program-a': activeProgram }, referralCodes: {}, auditEvents: {},
    });

    await expect(reserveReferralCode('inviter-a', {
      programId: 'program-a', code: ' salon-paris ', ownerType: 'client', ownerId: 'someone-else',
    }, firestore, new Date('2026-09-12T12:00:00Z'))).rejects.toMatchObject({ code: 'invalid-argument' });

    await expect(reserveReferralCode('inviter-a', {
      programId: 'program-a', code: ' salon-paris ', ownerType: 'client',
    }, firestore, new Date('2026-09-12T12:00:00Z'))).resolves.toEqual({ code: 'SALON-PARIS' });
    expect(state.referralCodes['SALON-PARIS']).toMatchObject({ ownerId: 'inviter-a', status: 'active' });
  });

  test('does not attribute a code from a paused program', async () => {
    const { attributeReferral } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'new-client': { uid: 'new-client' } }, freelancerProfiles: {}, memberships: {},
      referralPrograms: { 'program-a': { ...activeProgram, status: 'paused' } },
      referralCodes: {
        FRIEND: { code: 'FRIEND', programId: 'program-a', ownerType: 'client', ownerId: 'inviter-a', status: 'active' },
      },
      referralAttributions: {}, bookings: {},
    });

    await expect(attributeReferral('new-client', { code: 'FRIEND' }, firestore, new Date('2026-09-12T12:00:00Z')))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.referralAttributions).toEqual({});
  });

  test('attributes a referral for a canonical roleless client identity', async () => {
    const { attributeReferral } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'new-client': { uid: 'new-client', email: 'client@example.test' } },
      freelancerProfiles: {}, memberships: {},
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: {
        FRIEND: { code: 'FRIEND', programId: 'program-a', ownerType: 'client', ownerId: 'inviter-a', status: 'active' },
      },
      referralAttributions: {}, bookings: {},
    });

    await expect(attributeReferral('new-client', { code: 'FRIEND' }, firestore, new Date('2026-09-12T12:00:00Z')))
      .resolves.toEqual({ attributed: true, programId: 'program-a' });
    expect(state.referralAttributions['new-client']).toMatchObject({
      inviterId: 'inviter-a', inviterOwnerType: 'client',
    });
  });

  test('fails closed when a user document is not the caller canonical identity', async () => {
    const { attributeReferral, createMyReferralCode } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'new-client': { uid: 'different-user' } }, freelancerProfiles: {}, memberships: {},
      referralPrograms: { 'program-a': activeProgram },
      referralProgramState: { active: { programId: 'program-a' } },
      referralCodes: {
        FRIEND: { code: 'FRIEND', programId: 'program-a', ownerType: 'client', ownerId: 'inviter-a', status: 'active' },
      },
      referralAttributions: {}, bookings: {},
    });
    const now = new Date('2026-09-12T12:00:00Z');

    await expect(attributeReferral('new-client', { code: 'FRIEND' }, firestore, now))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(createMyReferralCode('new-client', { scope: { type: 'client' } }, firestore, now, () => 'NOPE-A1'))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.referralAttributions).toEqual({});
  });

  test('creates one pending reward only for the first completed non-test booking', async () => {
    const { processReferralBookingCompletion } = loadModule();
    const { firestore, state } = firestoreState({
      bookings: { 'booking-1': { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500 } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: {
        FRIEND: { code: 'FRIEND', programId: 'program-a', ownerType: 'client', ownerId: 'inviter-a', status: 'active' },
      },
      referralAttributions: {
        'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' },
      },
      referralRewards: {}, auditEvents: {},
    });

    expect(await processReferralBookingCompletion('booking-1', firestore, new Date('2026-09-12T12:00:00Z')))
      .toEqual({ created: true });
    expect(state.referralRewards['program-a__new-client']).toMatchObject({
      bookingId: 'booking-1', status: 'pending', inviterId: 'inviter-a', invitedUserId: 'new-client',
      inviterOwnerId: 'inviter-a', inviterOwnerType: 'client', invitedOwnerId: 'new-client', invitedOwnerType: 'client',
      inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR',
    });

    await expect(processReferralBookingCompletion('booking-1', firestore, new Date('2026-09-12T12:00:00Z')))
      .resolves.toEqual({ created: false });
  });

  test('returns the retry result when another transaction creates the reward', async () => {
    const { processReferralBookingCompletion } = loadModule();
    const { firestore } = firestoreState({
      bookings: { 'booking-1': { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500 } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: {
        FRIEND: { code: 'FRIEND', programId: 'program-a', ownerType: 'client', ownerId: 'inviter-a', status: 'active' },
      },
      referralAttributions: {
        'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' },
      },
      referralRewards: {}, auditEvents: {},
    }, { retryFirstTransaction: true });

    await expect(processReferralBookingCompletion('booking-1', firestore, new Date('2026-09-12T12:00:00Z')))
      .resolves.toEqual({ created: false });
  });

  test('skips rewards when a different completed non-test booking already exists', async () => {
    const { processReferralBookingCompletion } = loadModule();
    const { firestore, state } = firestoreState({
      bookings: {
        'booking-1': { clientId: 'new-client', status: 'completed', isTest: false },
        'older-booking': { clientId: 'new-client', status: 'completed', isTest: false },
      },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' } },
      referralRewards: {}, auditEvents: {},
    });

    await expect(processReferralBookingCompletion('booking-1', firestore, new Date('2026-09-12T12:00:00Z')))
      .resolves.toEqual({ created: false });
    expect(state.referralRewards).toEqual({});
  });

  test('allows a super admin to approve a pending reward once and issues non-cash ledgers', async () => {
    const { reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      bookings: { 'booking-a': { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500 } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { programId: 'program-a', code: 'FRIEND', inviterId: 'inviter-a' } },
      referralRewards: {
        'program-a__new-client': {
          programId: 'program-a', bookingId: 'booking-a', code: 'FRIEND', inviterId: 'inviter-a', invitedUserId: 'new-client',
          inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR', status: 'pending',
        },
      },
      creditLedgers: {}, auditEvents: {},
    });

    await expect(reviewReferralReward('admin-a', {
      rewardId: 'program-a__new-client', decision: 'approve',
    }, firestore)).resolves.toEqual({ rewardId: 'program-a__new-client', status: 'approved' });
    expect(state.creditLedgers['program-a__new-client__inviter']).toMatchObject({
      ownerId: 'inviter-a', ownerType: 'client', amountMinor: 500, kind: 'referral_inviter_credit', currency: 'EUR',
    });
    expect(state.creditLedgers['program-a__new-client__invited']).toMatchObject({
      ownerId: 'new-client', ownerType: 'client', amountMinor: 300, kind: 'referral_invited_discount', currency: 'EUR',
    });
    expect(state.referralRewards['program-a__new-client']).toMatchObject({
      inviterOwnerId: 'inviter-a', inviterOwnerType: 'client', invitedOwnerId: 'new-client', invitedOwnerType: 'client',
    });
    await expect(reviewReferralReward('admin-a', {
      rewardId: 'program-a__new-client', decision: 'approve',
    }, firestore)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('does not approve a pending reward whose booking was not the invited client’s first completion', async () => {
    const { reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      bookings: {
        'booking-a': { clientId: 'new-client', status: 'completed', isTest: false },
        'older-booking': { clientId: 'new-client', status: 'completed', isTest: false },
      },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { programId: 'program-a', code: 'FRIEND', inviterId: 'inviter-a' } },
      referralRewards: {
        pending: {
          programId: 'program-a', bookingId: 'booking-a', code: 'FRIEND', inviterId: 'inviter-a', invitedUserId: 'new-client',
          inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR', status: 'pending',
        },
      },
      creditLedgers: {}, auditEvents: {},
    });

    await expect(reviewReferralReward('admin-a', { rewardId: 'pending', decision: 'approve' }, firestore))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.referralRewards.pending.status).toBe('pending');
    expect(state.creditLedgers).toEqual({});
  });

  test('refuses to issue a ledger from a malformed pending reward', async () => {
    const { reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      referralRewards: {
        broken: {
          inviterId: 'inviter-a', invitedUserId: 'new-client', inviterCreditMinor: -1,
          invitedDiscountMinor: 300, currency: 'EUR', status: 'pending',
        },
      },
      creditLedgers: {}, auditEvents: {},
    });

    await expect(reviewReferralReward('admin-a', { rewardId: 'broken', decision: 'approve' }, firestore))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.creditLedgers).toEqual({});
  });

  test('rejects a legacy pending reward missing approval linkage without issuing credits', async () => {
    const { reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      referralRewards: { legacy: { status: 'pending' } },
      creditLedgers: {}, auditEvents: {},
    });

    await expect(reviewReferralReward('admin-a', {
      rewardId: 'legacy', decision: 'reject', reason: 'Legacy record has no verifiable referral linkage',
    }, firestore)).resolves.toEqual({ rewardId: 'legacy', status: 'rejected' });
    expect(state.referralRewards.legacy).toMatchObject({ status: 'rejected', reviewReason: 'Legacy record has no verifiable referral linkage' });
    expect(state.creditLedgers).toEqual({});
  });

  test('requires a reason when rejecting a pending reward', async () => {
    const { reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      referralRewards: {
        pending: {
          programId: 'program-a', bookingId: 'booking-a', code: 'FRIEND', inviterId: 'inviter-a', invitedUserId: 'new-client', inviterCreditMinor: 500,
          invitedDiscountMinor: 300, currency: 'EUR', status: 'pending',
        },
      },
      creditLedgers: {}, auditEvents: {},
    });

    await expect(reviewReferralReward('admin-a', {
      rewardId: 'pending', decision: 'reject', reason: 'Duplicate identity signal',
    }, firestore)).resolves.toEqual({ rewardId: 'pending', status: 'rejected' });
    expect(state.referralRewards.pending).toMatchObject({ status: 'rejected', reviewReason: 'Duplicate identity signal' });
    expect(state.creditLedgers).toEqual({});
  });

  test('returns only the caller-safe referral workspace', async () => {
    const { getMyReferralWorkspace } = loadModule();
    const { firestore } = firestoreState({
      referralCodes: { FRIEND: { code: 'FRIEND', ownerId: 'inviter-a', ownerType: 'client', programId: 'program-a', status: 'active' } },
      referralAttributions: { 'inviter-a': { code: 'OTHER', programId: 'program-b', inviterId: 'secret-user', expiresAt: '2026-09-20T00:00:00.000Z' } },
      referralRewards: {
        own: { inviterId: 'inviter-a', inviterOwnerId: 'inviter-a', inviterOwnerType: 'client', invitedUserId: 'new-client', invitedOwnerId: 'new-client', invitedOwnerType: 'client', inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR', status: 'approved' },
        foreign: { inviterId: 'someone-else', inviterOwnerId: 'someone-else', inviterOwnerType: 'client', invitedUserId: 'other-client', invitedOwnerId: 'other-client', invitedOwnerType: 'client', inviterCreditMinor: 1, invitedDiscountMinor: 1, currency: 'EUR', status: 'approved' },
      },
    });

    await expect(getMyReferralWorkspace('inviter-a', {}, firestore)).resolves.toEqual({
      client: {
        ownerType: 'client',
        codes: [{ code: 'FRIEND', ownerType: 'client', programId: 'program-a', status: 'active' }],
        attribution: { code: 'OTHER', programId: 'program-b', expiresAt: '2026-09-20T00:00:00.000Z' },
        inviterRewards: [{ id: 'own', ownerType: 'client', role: 'inviter', amountMinor: 500, currency: 'EUR', status: 'approved' }],
        inviteeRewards: [],
      },
      freelancer: { ownerType: 'freelancer', codes: [], inviterRewards: [] },
    });
  });

  test('does not create a reward for a completed booking settled at zero', async () => {
    const { processReferralBookingCompletion } = loadModule();
    const { firestore, state } = firestoreState({
      bookings: { free: { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 0 } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', status: 'active' } },
      referralAttributions: { 'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' } },
      referralRewards: {}, auditEvents: {},
    });

    await expect(processReferralBookingCompletion('free', firestore, new Date('2026-09-12T12:00:00Z')))
      .resolves.toEqual({ created: false });
    expect(state.referralRewards).toEqual({});
  });

  test('does not approve a reward tied to a free booking', async () => {
    const { reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      bookings: { free: { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 0 } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', status: 'active' } },
      referralAttributions: { 'new-client': { programId: 'program-a', code: 'FRIEND', inviterId: 'inviter-a' } },
      referralRewards: { pending: { programId: 'program-a', bookingId: 'free', code: 'FRIEND', inviterId: 'inviter-a', invitedUserId: 'new-client', inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR', status: 'pending' } },
      creditLedgers: {}, auditEvents: {},
    });

    await expect(reviewReferralReward('admin-a', { rewardId: 'pending', decision: 'approve' }, firestore))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.creditLedgers).toEqual({});
  });

  test('projects only a principal\'s authorized brand referral data and totals', async () => {
    const { getMyReferralWorkspace } = loadModule();
    const { firestore } = firestoreState({
      memberships: {
        'brand-a__principal__principal-a': { userId: 'principal-a', brandId: 'brand-a', role: 'principal_admin', status: 'active', permissions: {} },
        'brand-b__principal__other-a': { userId: 'other-a', brandId: 'brand-b', role: 'principal_admin', status: 'active', permissions: {} },
      },
      brands: { 'brand-a': { name: 'A' }, 'brand-b': { name: 'B' } },
      referralCodes: {
        BRANDA: { code: 'BRANDA', ownerId: 'brand-a', ownerType: 'brand', programId: 'program-a', status: 'active' },
        BRANDB: { code: 'BRANDB', ownerId: 'brand-b', ownerType: 'brand', programId: 'program-a', status: 'active' },
      },
      referralAttributions: {},
      referralRewards: {
        a: { inviterId: 'brand-a', inviterOwnerId: 'brand-a', inviterOwnerType: 'brand', invitedUserId: 'client-a', invitedOwnerId: 'client-a', invitedOwnerType: 'client', inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR', status: 'approved' },
        b: { inviterId: 'brand-b', inviterOwnerId: 'brand-b', inviterOwnerType: 'brand', invitedUserId: 'client-b', invitedOwnerId: 'client-b', invitedOwnerType: 'client', inviterCreditMinor: 700, invitedDiscountMinor: 300, currency: 'EUR', status: 'approved' },
      },
      creditLedgers: { a: { ownerId: 'brand-a', ownerType: 'brand', amountMinor: 500, currency: 'EUR', status: 'approved' } },
    });

    await expect(getMyReferralWorkspace('principal-a', {}, firestore)).resolves.toEqual({
      client: { ownerType: 'client', codes: [], inviterRewards: [], inviteeRewards: [] },
      freelancer: { ownerType: 'freelancer', codes: [], inviterRewards: [] },
      brandWorkspaces: [{
        ownerType: 'brand',
        brandId: 'brand-a',
        codes: [{ code: 'BRANDA', ownerType: 'brand', programId: 'program-a', status: 'active' }],
        rewards: [{ id: 'a', ownerType: 'brand', role: 'inviter', amountMinor: 500, currency: 'EUR', status: 'approved' }],
        creditTotals: [{ currency: 'EUR', approvedMinor: 500, pendingMinor: 0 }],
      }],
    });
  });

  test.each([
    ['missing', {}, 'UNKNOWN'],
    ['paused code', { referralCodes: { FRIEND: { code: 'FRIEND', ownerId: 'inviter-a', ownerType: 'client', programId: 'program-a', status: 'paused' } }, referralPrograms: { 'program-a': activeProgram } }, 'FRIEND'],
    ['archived program', { referralCodes: { FRIEND: { code: 'FRIEND', ownerId: 'inviter-a', ownerType: 'client', programId: 'program-a', status: 'active' } }, referralPrograms: { 'program-a': { ...activeProgram, status: 'archived' } } }, 'FRIEND'],
    ['not yet active program', { referralCodes: { FRIEND: { code: 'FRIEND', ownerId: 'inviter-a', ownerType: 'client', programId: 'program-a', status: 'active' } }, referralPrograms: { 'program-a': { ...activeProgram, startsAt: '2026-10-01T00:00:00.000Z' } } }, 'FRIEND'],
    ['expired program', { referralCodes: { FRIEND: { code: 'FRIEND', ownerId: 'inviter-a', ownerType: 'client', programId: 'program-a', status: 'active' } }, referralPrograms: { 'program-a': { ...activeProgram, endsAt: '2026-09-11T23:59:59.000Z' } } }, 'FRIEND'],
  ])('does not publicly verify a %s referral code', async (_label, data, code) => {
    const { getPublicReferralCode } = loadModule();
    const { firestore } = firestoreState(data);

    await expect(getPublicReferralCode({ code }, firestore, new Date('2026-09-12T12:00:00Z')))
      .rejects.toMatchObject({ code: 'not-found' });
  });

  test('publicly verifies only the active code presentation state', async () => {
    const { getPublicReferralCode } = loadModule();
    const { firestore } = firestoreState({
      referralCodes: { FRIEND: { code: 'FRIEND', ownerId: 'inviter-a', ownerType: 'client', programId: 'program-a', status: 'active' } },
      referralPrograms: { 'program-a': activeProgram },
    });

    await expect(getPublicReferralCode({ code: 'friend' }, firestore, new Date('2026-09-12T12:00:00Z')))
      .resolves.toEqual({ code: 'FRIEND', status: 'active' });
  });

  test('creates and then reuses an authenticated client\'s generated active code', async () => {
    const { createMyReferralCode } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'client-a': { uid: 'client-a' } },
      referralProgramState: { active: { programId: 'program-a' } }, referralPrograms: { 'program-a': activeProgram },
      referralCodes: {}, memberships: {}, freelancerProfiles: {},
    });
    const now = new Date('2026-09-12T12:00:00Z');

    await expect(createMyReferralCode('client-a', { scope: { type: 'client' } }, firestore, now, () => 'CLIENT-A1')).resolves.toEqual({
      code: 'CLIENT-A1', ownerType: 'client', programId: 'program-a', reused: false,
    });
    await expect(createMyReferralCode('client-a', { scope: { type: 'client' } }, firestore, now, () => 'UNUSED-1')).resolves.toEqual({
      code: 'CLIENT-A1', ownerType: 'client', programId: 'program-a', reused: true,
    });
    expect(state.referralCodes['CLIENT-A1'].ownerId).toBe('client-a');
    await expect(createMyReferralCode('client-a', { code: 'FORGED-A1' }, firestore, now, () => 'UNUSED-2'))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('retries a generated referral code collision without accepting browser-selected code data', async () => {
    const { createMyReferralCode } = loadModule();
    const { firestore } = firestoreState({
      users: { 'client-a': { uid: 'client-a' } },
      referralProgramState: { active: { programId: 'program-a' } }, referralPrograms: { 'program-a': activeProgram },
      referralCodes: { COLLIDE: { code: 'COLLIDE', ownerId: 'other-a', ownerType: 'client', programId: 'program-a', status: 'active' } },
      memberships: {}, freelancerProfiles: {},
    });
    const generated = ['COLLIDE', 'CLIENT-A2'];

    await expect(createMyReferralCode('client-a', { scope: { type: 'client' } }, firestore, new Date('2026-09-12T12:00:00Z'), () => generated.shift()))
      .resolves.toEqual({ code: 'CLIENT-A2', ownerType: 'client', programId: 'program-a', reused: false });
  });

  test('requires an explicit, authorized referral-code scope', async () => {
    const { createMyReferralCode } = loadModule();
    const { firestore } = firestoreState({
      users: {
        'client-a': { uid: 'client-a' },
        'freelancer-a': { uid: 'freelancer-a' },
        'freelancer-staff': { uid: 'freelancer-staff' },
      },
      freelancerProfiles: { 'freelancer-a': { uid: 'freelancer-a' }, 'freelancer-staff': { uid: 'freelancer-staff' } },
      memberships: { worker: { userId: 'freelancer-staff', brandId: 'brand-a', role: 'worker', status: 'active', permissions: {} } }, referralCodes: {},
      referralProgramState: { active: { programId: 'program-a' } }, referralPrograms: { 'program-a': activeProgram },
    });
    const now = new Date('2026-09-12T12:00:00Z');

    await expect(createMyReferralCode('client-a', {}, firestore, now, () => 'IMPLICIT-A1'))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(createMyReferralCode('client-a', { scope: { type: 'freelancer' } }, firestore, now, () => 'WRONG-A1'))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(createMyReferralCode('freelancer-a', { scope: { type: 'client' } }, firestore, now, () => 'WRONG-A2'))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(createMyReferralCode('freelancer-a', { scope: { type: 'freelancer' } }, firestore, now, () => 'FREELANCE-A1'))
      .resolves.toEqual({ code: 'FREELANCE-A1', ownerType: 'freelancer', programId: 'program-a', reused: false });
    await expect(createMyReferralCode('freelancer-staff', { scope: { type: 'freelancer' } }, firestore, now, () => 'STAFF-A1'))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('creates and reuses only the exact authorized brand scope selected by a multi-brand admin', async () => {
    const { createMyReferralCode } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'manager-a': { uid: 'manager-a' } }, freelancerProfiles: {},
      memberships: {
        'brand-a__principal__manager-a': { userId: 'manager-a', brandId: 'brand-a', role: 'principal_admin', status: 'active', permissions: {} },
        'brand-b__principal__manager-a': { userId: 'manager-a', brandId: 'brand-b', role: 'principal_admin', status: 'active', permissions: {} },
      },
      brands: { 'brand-a': { name: 'A' }, 'brand-b': { name: 'B' } },
      referralCodes: { BRANDB: { code: 'BRANDB', ownerId: 'brand-b', ownerType: 'brand', programId: 'program-a', status: 'active' } },
      referralProgramState: { active: { programId: 'program-a' } }, referralPrograms: { 'program-a': activeProgram },
    });
    const now = new Date('2026-09-12T12:00:00Z');

    await expect(createMyReferralCode('manager-a', { scope: { type: 'brand', brandId: 'brand-b' } }, firestore, now, () => 'UNUSED-A1'))
      .resolves.toEqual({ code: 'BRANDB', ownerType: 'brand', programId: 'program-a', reused: true });
    await expect(createMyReferralCode('manager-a', { scope: { type: 'brand', brandId: 'brand-a' } }, firestore, now, () => 'BRANDA'))
      .resolves.toEqual({ code: 'BRANDA', ownerType: 'brand', programId: 'program-a', reused: false });
    expect(state.referralCodes.BRANDA).toMatchObject({ ownerId: 'brand-a', ownerType: 'brand' });
    await expect(createMyReferralCode('manager-a', { scope: { type: 'brand', brandId: 'brand-c' } }, firestore, now, () => 'FORGED-A1'))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('creates a brand code only for an active authorized brand admin', async () => {
    const { createMyReferralCode } = loadModule();
    const { firestore } = firestoreState({
      users: { 'manager-a': { uid: 'manager-a' } },
      memberships: { 'brand-a__location-a__manager-a': { userId: 'manager-a', brandId: 'brand-a', locationId: 'location-a', role: 'salon_admin', status: 'active', permissions: {} } },
      brands: { 'brand-a': { name: 'A' } }, freelancerProfiles: {},
      referralProgramState: { active: { programId: 'program-a' } }, referralPrograms: { 'program-a': activeProgram }, referralCodes: {},
    });

    await expect(createMyReferralCode('manager-a', { scope: { type: 'brand', brandId: 'brand-a' } }, firestore, new Date('2026-09-12T12:00:00Z'), () => 'BRAND-A1'))
      .resolves.toEqual({ code: 'BRAND-A1', ownerType: 'brand', programId: 'program-a', reused: false });
  });

  test('allows a legacy admin role to create a code for an authorized brand membership', async () => {
    const { createMyReferralCode } = loadModule();
    const { firestore } = firestoreState({
      users: { 'admin-a': { uid: 'admin-a', role: 'admin' } },
      memberships: { 'brand-a__principal__admin-a': { userId: 'admin-a', brandId: 'brand-a', role: 'principal_admin', status: 'active', permissions: {} } },
      brands: { 'brand-a': { name: 'A' } }, freelancerProfiles: {}, referralCodes: {},
      referralProgramState: { active: { programId: 'program-a' } }, referralPrograms: { 'program-a': activeProgram },
    });

    await expect(createMyReferralCode('admin-a', { scope: { type: 'brand', brandId: 'brand-a' } }, firestore, new Date('2026-09-12T12:00:00Z'), () => 'ADMIN-A1'))
      .resolves.toEqual({ code: 'ADMIN-A1', ownerType: 'brand', programId: 'program-a', reused: false });
  });

  test('rejects referral-code generation for an active staff member', async () => {
    const { createMyReferralCode } = loadModule();
    const { firestore } = firestoreState({
      users: { 'worker-a': { uid: 'worker-a' } },
      memberships: { 'brand-a__location-a__worker-a': { userId: 'worker-a', brandId: 'brand-a', locationId: 'location-a', role: 'worker', status: 'active', permissions: {} } },
      freelancerProfiles: {}, referralProgramState: { active: { programId: 'program-a' } }, referralPrograms: { 'program-a': activeProgram }, referralCodes: {},
    });

    await expect(createMyReferralCode('worker-a', { scope: { type: 'client' } }, firestore, new Date('2026-09-12T12:00:00Z'), () => 'NOPE-A1'))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  test.each([
    ['freelancer', { freelancerProfiles: { 'new-client': { uid: 'new-client' } } }],
    ['worker', { memberships: { membership: { userId: 'new-client', brandId: 'brand-a', role: 'worker', status: 'active', permissions: {} } } }],
    ['salon admin', { memberships: { membership: { userId: 'new-client', brandId: 'brand-a', role: 'salon_admin', status: 'active', permissions: {} } } }],
    ['brand principal', { memberships: { membership: { userId: 'new-client', brandId: 'brand-a', role: 'principal_admin', status: 'active', permissions: {} } } }],
    ['super admin', { users: { 'new-client': { uid: 'new-client', role: 'superadmin' } } }],
    ['unknown explicit non-client role', { users: { 'new-client': { uid: 'new-client', role: 'owner' } } }],
  ])('rejects referral attribution for a %s account', async (_label, identity) => {
    const { attributeReferral } = loadModule();
    const { firestore } = firestoreState({
      users: { 'new-client': { uid: 'new-client' }, ...(identity.users ?? {}) },
      freelancerProfiles: {}, memberships: {}, ...identity,
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerType: 'client', ownerId: 'inviter-a', status: 'active' } },
      referralAttributions: {}, bookings: {},
    });

    await expect(attributeReferral('new-client', { code: 'FRIEND' }, firestore, new Date('2026-09-12T12:00:00Z')))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('rejects referral-code generation for a legacy admin role without a membership', async () => {
    const { createMyReferralCode } = loadModule();
    const { firestore } = firestoreState({
      users: { 'admin-a': { uid: 'admin-a', role: 'admin' } }, memberships: {}, freelancerProfiles: {}, referralCodes: {},
      referralProgramState: { active: { programId: 'program-a' } }, referralPrograms: { 'program-a': activeProgram },
    });

    await expect(createMyReferralCode('admin-a', { scope: { type: 'brand', brandId: 'brand-a' } }, firestore, new Date('2026-09-12T12:00:00Z'), () => 'ADMIN-A1'))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('projects a local salon admin\'s authorized brand workspace', async () => {
    const { getMyReferralWorkspace } = loadModule();
    const { firestore } = firestoreState({
      memberships: { 'brand-a__location-a__manager-a': { userId: 'manager-a', brandId: 'brand-a', locationId: 'location-a', role: 'salon_admin', status: 'active', permissions: {} } },
      brands: { 'brand-a': { name: 'A' } },
      referralCodes: { BRANDA: { code: 'BRANDA', ownerId: 'brand-a', ownerType: 'brand', programId: 'program-a', status: 'active' } },
      referralRewards: {}, referralAttributions: {},
    });

    await expect(getMyReferralWorkspace('manager-a', {}, firestore)).resolves.toMatchObject({
      brandWorkspaces: [{ brandId: 'brand-a', codes: [{ code: 'BRANDA' }], rewards: [], creditTotals: [] }],
    });
  });

  test('separates client invitee, client inviter, freelancer inviter, and brand workspace data', async () => {
    const { getMyReferralWorkspace } = loadModule();
    const { firestore } = firestoreState({
      memberships: { 'brand-a__principal__multi-a': { userId: 'multi-a', brandId: 'brand-a', role: 'principal_admin', status: 'active', permissions: {} } },
      brands: { 'brand-a': { name: 'A' } },
      referralCodes: {
        CLIENTA: { code: 'CLIENTA', ownerId: 'multi-a', ownerType: 'client', programId: 'program-a', status: 'active' },
        FREELANCEA: { code: 'FREELANCEA', ownerId: 'multi-a', ownerType: 'freelancer', programId: 'program-a', status: 'active' },
        BRANDA: { code: 'BRANDA', ownerId: 'brand-a', ownerType: 'brand', programId: 'program-a', status: 'active' },
      },
      referralAttributions: { 'multi-a': { code: 'OTHER', programId: 'program-a', inviterId: 'other-a', inviterOwnerType: 'client', expiresAt: '2026-09-20T00:00:00.000Z' } },
      referralRewards: {
        clientInviter: { inviterOwnerId: 'multi-a', inviterOwnerType: 'client', invitedOwnerId: 'client-b', invitedOwnerType: 'client', inviterCreditMinor: 100, invitedDiscountMinor: 50, currency: 'EUR', status: 'approved' },
        clientInvitee: { inviterOwnerId: 'other-a', inviterOwnerType: 'client', invitedOwnerId: 'multi-a', invitedOwnerType: 'client', inviterCreditMinor: 100, invitedDiscountMinor: 50, currency: 'EUR', status: 'approved' },
        freelancerInviter: { inviterOwnerId: 'multi-a', inviterOwnerType: 'freelancer', invitedOwnerId: 'client-c', invitedOwnerType: 'client', inviterCreditMinor: 200, invitedDiscountMinor: 50, currency: 'EUR', status: 'approved' },
        brandInviter: { inviterOwnerId: 'brand-a', inviterOwnerType: 'brand', invitedOwnerId: 'client-d', invitedOwnerType: 'client', inviterCreditMinor: 300, invitedDiscountMinor: 50, currency: 'EUR', status: 'approved' },
      },
      creditLedgers: { brand: { ownerId: 'brand-a', ownerType: 'brand', amountMinor: 300, currency: 'EUR', status: 'approved' } },
    });

    await expect(getMyReferralWorkspace('multi-a', {}, firestore)).resolves.toEqual({
      client: {
        ownerType: 'client',
        codes: [{ code: 'CLIENTA', ownerType: 'client', programId: 'program-a', status: 'active' }],
        attribution: { code: 'OTHER', programId: 'program-a', inviterOwnerType: 'client', expiresAt: '2026-09-20T00:00:00.000Z' },
        inviterRewards: [{ id: 'clientInviter', ownerType: 'client', role: 'inviter', amountMinor: 100, currency: 'EUR', status: 'approved' }],
        inviteeRewards: [{ id: 'clientInvitee', ownerType: 'client', role: 'invited', amountMinor: 50, currency: 'EUR', status: 'approved' }],
      },
      freelancer: {
        ownerType: 'freelancer',
        codes: [{ code: 'FREELANCEA', ownerType: 'freelancer', programId: 'program-a', status: 'active' }],
        inviterRewards: [{ id: 'freelancerInviter', ownerType: 'freelancer', role: 'inviter', amountMinor: 200, currency: 'EUR', status: 'approved' }],
      },
      brandWorkspaces: [{
        ownerType: 'brand',
        brandId: 'brand-a',
        codes: [{ code: 'BRANDA', ownerType: 'brand', programId: 'program-a', status: 'active' }],
        rewards: [{ id: 'brandInviter', ownerType: 'brand', role: 'inviter', amountMinor: 300, currency: 'EUR', status: 'approved' }],
        creditTotals: [{ currency: 'EUR', approvedMinor: 300, pendingMinor: 0 }],
      }],
    });
  });

  test('separates client and brand referral workspaces when their IDs collide', async () => {
    const { getMyReferralWorkspace } = loadModule();
    const { firestore } = firestoreState({
      memberships: { 'X__principal__brand-admin': { userId: 'brand-admin', brandId: 'X', role: 'principal_admin', status: 'active', permissions: {} } },
      brands: { X: { name: 'X' } },
      referralCodes: {
        CLIENTX: { code: 'CLIENTX', ownerId: 'X', ownerType: 'client', programId: 'program-a', status: 'active' },
        BRANDX: { code: 'BRANDX', ownerId: 'X', ownerType: 'brand', programId: 'program-a', status: 'active' },
      },
      referralRewards: {
        clientInviter: { inviterId: 'X', inviterOwnerId: 'X', inviterOwnerType: 'client', invitedUserId: 'client-y', invitedOwnerId: 'client-y', invitedOwnerType: 'client', inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR', status: 'approved' },
        brandInviter: { inviterId: 'X', inviterOwnerId: 'X', inviterOwnerType: 'brand', invitedUserId: 'client-z', invitedOwnerId: 'client-z', invitedOwnerType: 'client', inviterCreditMinor: 700, invitedDiscountMinor: 300, currency: 'EUR', status: 'approved' },
        forgedBrandInvitee: { inviterId: 'other', inviterOwnerId: 'other', inviterOwnerType: 'client', invitedUserId: 'X', invitedOwnerId: 'X', invitedOwnerType: 'brand', inviterCreditMinor: 1, invitedDiscountMinor: 200, currency: 'EUR', status: 'approved' },
      },
      referralAttributions: {},
      creditLedgers: {
        clientInviter: { ownerId: 'X', ownerType: 'client', amountMinor: 500, currency: 'EUR', status: 'approved' },
        brandInviter: { ownerId: 'X', ownerType: 'brand', amountMinor: 700, currency: 'EUR', status: 'approved' },
      },
    });

    await expect(getMyReferralWorkspace('X', {}, firestore)).resolves.toEqual({
      client: {
        ownerType: 'client',
        codes: [{ code: 'CLIENTX', ownerType: 'client', programId: 'program-a', status: 'active' }],
        inviterRewards: [{ id: 'clientInviter', ownerType: 'client', role: 'inviter', amountMinor: 500, currency: 'EUR', status: 'approved' }],
        inviteeRewards: [],
      },
      freelancer: { ownerType: 'freelancer', codes: [], inviterRewards: [] },
    });
    await expect(getMyReferralWorkspace('brand-admin', {}, firestore)).resolves.toEqual({
      client: { ownerType: 'client', codes: [], inviterRewards: [], inviteeRewards: [] },
      freelancer: { ownerType: 'freelancer', codes: [], inviterRewards: [] },
      brandWorkspaces: [{
        ownerType: 'brand',
        brandId: 'X',
        codes: [{ code: 'BRANDX', ownerType: 'brand', programId: 'program-a', status: 'active' }],
        rewards: [{ id: 'brandInviter', ownerType: 'brand', role: 'inviter', amountMinor: 700, currency: 'EUR', status: 'approved' }],
        creditTotals: [{ currency: 'EUR', approvedMinor: 700, pendingMinor: 0 }],
      }],
    });
  });
});
