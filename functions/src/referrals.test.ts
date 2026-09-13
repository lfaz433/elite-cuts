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
  const readLog = [];
  const keyFor = ref => `${ref.collectionName}/${ref.id}`;
  const reference = (collectionName, id) => {
    const resolvedId = id ?? `${collectionName}-${++nextId}`;
    return {
      collectionName,
      id: resolvedId,
      get: async () => snapshot(state[collectionName]?.[resolvedId], resolvedId),
      async create(value) {
        state[collectionName] ??= {};
        if (state[collectionName][resolvedId]) throw new Error('already exists');
        state[collectionName][resolvedId] = value;
      },
    };
  };
  const query = (collectionName, filters = [], order = undefined, maximum = undefined, afterId = undefined) => ({
    collectionName,
    isQuery: true,
    filters,
    order,
    maximum,
    where(field, operator, value) {
      return query(collectionName, [...filters, [field, operator, value]], order, maximum);
    },
    orderBy(field, direction = 'asc') {
      return query(collectionName, filters, [field, direction], maximum);
    },
    limit(value) {
      return query(collectionName, filters, order, value, afterId);
    },
    startAfter(cursor) {
      return query(collectionName, filters, order, maximum, cursor.id);
    },
    async get() {
      const entries = Object.entries(state[collectionName] ?? {})
        .filter(([, data]) => filters.every(([field, operator, value]) => (
          operator === '==' && data[field] === value
        )));
      if (order) {
        const [field, direction] = order;
        entries.sort(([, left], [, right]) => {
          const comparison = String(left[field] ?? '').localeCompare(String(right[field] ?? ''));
          return direction === 'desc' ? -comparison : comparison;
        });
      }
      const startIndex = afterId === undefined ? 0 : entries.findIndex(([id]) => id === afterId) + 1;
      const docs = entries
        .slice(startIndex, maximum === undefined ? undefined : startIndex + maximum)
        .map(([id, data]) => snapshot(data, id));
      return { docs, empty: docs.length === 0 };
    },
  });
  return {
    state,
    readLog,
    firestore: {
      collection(collectionName) {
        return {
          doc(id) { return reference(collectionName, id); },
          get() { return query(collectionName).get(); },
          where(field, operator, value) { return query(collectionName, [[field, operator, value]]); },
          orderBy(field, direction) { return query(collectionName, [], [field, direction]); },
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
              .sort(([, left], [, right]) => {
                if (!ref.order) return 0;
                const [field, direction] = ref.order;
                const comparison = String(left[field] ?? '').localeCompare(String(right[field] ?? ''));
                return direction === 'desc' ? -comparison : comparison;
              })
              .slice(0, ref.maximum)
              .map(([id, data]) => snapshot(data, id));
              return { docs, empty: docs.length === 0 };
            }
            readLog.push(keyFor(ref));
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
  eligibilityEvidenceVersion: 1,
  eligibilityEvidenceNotBeforeAt: '2026-09-01T00:00:00.000Z',
};

function trustedReferralCompletion(eventId = 'event-1', at = '2026-09-12T12:00:00.000Z') {
  return { version: 1, eventId, updateTimeMs: Date.parse(at) };
}

function canonicalOverviewReward(id, values = {}) {
  const [defaultProgramId, defaultInvitedUserId] = id.split('__');
  const programId = values.programId ?? defaultProgramId;
  const invitedUserId = values.invitedUserId ?? defaultInvitedUserId;
  const inviterId = values.inviterId ?? 'inviter-a';
  return {
    rewardId: id,
    programId,
    bookingId: values.bookingId ?? 'booking-a',
    code: values.code ?? 'FRIEND',
    inviterId,
    inviterOwnerId: values.inviterOwnerId ?? inviterId,
    inviterOwnerType: values.inviterOwnerType ?? 'client',
    invitedUserId,
    invitedOwnerId: values.invitedOwnerId ?? invitedUserId,
    invitedOwnerType: values.invitedOwnerType ?? 'client',
    currency: values.currency ?? 'EUR',
    inviterCreditMinor: values.inviterCreditMinor ?? 500,
    invitedDiscountMinor: values.invitedDiscountMinor ?? 300,
    eligibleCompletedAtMs: values.eligibleCompletedAtMs ?? Date.parse('2026-09-12T10:00:00.000Z'),
    eligibilityEvidenceVersion: 1,
    eligibilityEvidenceEventId: values.eligibilityEvidenceEventId ?? 'event-overview',
    eligibilityEvidenceUpdateTimeMs: values.eligibilityEvidenceUpdateTimeMs ?? Date.parse('2026-09-12T12:00:00.000Z'),
    eligibilityProgramNotBeforeAtMs: values.eligibilityProgramNotBeforeAtMs ?? Date.parse('2026-09-01T00:00:00.000Z'),
    status: values.status ?? 'approved',
    ...values,
  };
}

describe('referral domain', () => {
  test('returns aggregate referral marketing data only to a super admin', async () => {
    const { getReferralMarketingOverview } = loadModule();
    const { firestore } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' }, 'client-a': { uid: 'client-a' }, 'brand-admin': { uid: 'brand-admin' } },
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
        'program-a__invited-a': canonicalOverviewReward('program-a__invited-a', {
          inviterId: 'inviter-a', status: 'pending', createdAt: '2026-09-12T10:00:00.000Z',
        }),
      },
    });

    await expect(getReferralMarketingOverview('admin-a', {}, firestore)).resolves.toMatchObject({
      programs: [{
        id: 'program-a', status: 'active', countryCodes: ['FR'], currency: 'EUR', inviterCreditMinor: 500,
        invitedDiscountMinor: 300, startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-10-01T00:00:00.000Z',
      }],
      funnel: { codes: 1, attributions: 1, rewards: 1, pending: 1, approved: 0, rejected: 0 },
      topReferrers: [{ inviterId: 'inviter-a', inviterOwnerType: 'client', referrals: 1, rewards: 1, approvedCreditTotals: [] }],
      pendingRewards: [{
        id: 'program-a__invited-a', programId: 'program-a', bookingId: 'booking-a', inviterId: 'inviter-a', invitedUserId: 'invited-a',
        inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR', status: 'pending', createdAt: '2026-09-12T10:00:00.000Z',
      }],
    });
  });

  test('keeps client and brand referrers with the same ID separate in the marketing overview', async () => {
    const { getReferralMarketingOverview } = loadModule();
    const { firestore } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' }, 'client-a': { uid: 'client-a' }, 'brand-admin': { uid: 'brand-admin' } },
      referralPrograms: {}, referralCodes: {},
      referralAttributions: {
        client: { inviterId: 'X', inviterOwnerType: 'client' },
        brand: { inviterId: 'X', inviterOwnerType: 'brand' },
        legacy: { inviterId: 'X' },
      },
      referralRewards: {
        'program-client__client-a': canonicalOverviewReward('program-client__client-a', { inviterId: 'X', inviterOwnerType: 'client', inviterCreditMinor: 500 }),
        'program-brand__client-b': canonicalOverviewReward('program-brand__client-b', { inviterId: 'X', inviterOwnerType: 'brand', inviterCreditMinor: 700 }),
        legacy: { inviterId: 'X', inviterCreditMinor: 900, currency: 'EUR', status: 'approved' },
      },
      creditLedgers: {
        'program-client__client-a__inviter': { rewardId: 'program-client__client-a', ownerId: 'X', ownerType: 'client', amountMinor: 500, currency: 'EUR', kind: 'referral_inviter_credit', status: 'approved' },
        'program-brand__client-b__inviter': { rewardId: 'program-brand__client-b', ownerId: 'X', ownerType: 'brand', amountMinor: 700, currency: 'EUR', kind: 'referral_inviter_credit', status: 'approved' },
      },
    });

    await expect(getReferralMarketingOverview('admin-a', {}, firestore)).resolves.toMatchObject({
      funnel: { attributions: 3, rewards: 2, approved: 2 },
      topReferrers: [
        { inviterId: 'X', inviterOwnerType: 'brand', referrals: 1, rewards: 1, approvedCreditTotals: [{ currency: 'EUR', amountMinor: 700 }] },
        { inviterId: 'X', inviterOwnerType: 'client', referrals: 1, rewards: 1, approvedCreditTotals: [{ currency: 'EUR', amountMinor: 500 }] },
      ],
    });
  });

  test('keeps a typed referrer’s approved credits separated by currency', async () => {
    const { getReferralMarketingOverview } = loadModule();
    const { firestore } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      referralPrograms: {
        'program-eur': { ...activeProgram, currency: 'EUR' },
        'program-usd': { ...activeProgram, currency: 'USD' },
      },
      referralCodes: {},
      referralAttributions: {
        eur: { inviterId: 'X', inviterOwnerType: 'client', programId: 'program-eur' },
        usd: { inviterId: 'X', inviterOwnerType: 'client', programId: 'program-usd' },
      },
      referralRewards: {
        'program-eur__client-eur': canonicalOverviewReward('program-eur__client-eur', { inviterId: 'X', inviterCreditMinor: 500, currency: 'EUR' }),
        'program-usd__client-usd': canonicalOverviewReward('program-usd__client-usd', { inviterId: 'X', inviterCreditMinor: 700, currency: 'USD' }),
      },
      creditLedgers: {
        'program-eur__client-eur__inviter': { rewardId: 'program-eur__client-eur', ownerId: 'X', ownerType: 'client', amountMinor: 500, currency: 'EUR', kind: 'referral_inviter_credit', status: 'approved' },
        'program-usd__client-usd__inviter': { rewardId: 'program-usd__client-usd', ownerId: 'X', ownerType: 'client', amountMinor: 700, currency: 'USD', kind: 'referral_inviter_credit', status: 'approved' },
      },
    });

    await expect(getReferralMarketingOverview('admin-a', {}, firestore)).resolves.toMatchObject({
      topReferrers: [{
        inviterId: 'X', inviterOwnerType: 'client', referrals: 2, rewards: 2,
        approvedCreditTotals: [
          { currency: 'EUR', amountMinor: 500 },
          { currency: 'USD', amountMinor: 700 },
        ],
      }],
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
    const {
      eligibilityEvidenceVersion: _eligibilityEvidenceVersion,
      eligibilityEvidenceNotBeforeAt: _eligibilityEvidenceNotBeforeAt,
      ...programInput
    } = activeProgram;

    const attempts = await Promise.allSettled(['program-a', 'program-b'].map(programId => (
      createReferralProgram('admin-a', { ...programInput, programId }, firestore, now)
    )));

    expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(attempt => attempt.status === 'rejected')[0].reason)
      .toMatchObject({ code: 'failed-precondition' });
    expect(Object.values(state.referralPrograms).filter(program => program.status === 'active')).toHaveLength(1);
    expect(state.referralProgramState.active.programId).toMatch(/program-[ab]/);
    expect(Object.values(state.referralPrograms)[0]).toMatchObject({
      eligibilityEvidenceVersion: 1,
      eligibilityEvidenceNotBeforeAt: now.toISOString(),
    });
  });

  test('normalizes share codes into the globally comparable form', () => {
    const { normalizeReferralCode } = loadModule();

    expect(normalizeReferralCode(' Salon-Paris ')).toBe('SALON-PARIS');
  });

  test('rejects self-attribution before creating an immutable attribution', async () => {
    const { attributeReferral } = loadModule();
    const { firestore, state } = firestoreState({
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
    state.bookings['booking-x'] = { clientId: 'X', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500, completedAt: '2026-09-12T10:00:00.000Z' };
    await expect(processReferralBookingCompletion('booking-x', firestore, now, trustedReferralCompletion('event-booking-x'))).resolves.toEqual({ created: true });
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
      bookings: { 'booking-1': { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500, completedAt: '2026-09-12T10:00:00.000Z' } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: {
        FRIEND: { code: 'FRIEND', programId: 'program-a', ownerType: 'client', ownerId: 'inviter-a', status: 'active' },
      },
      referralAttributions: {
        'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' },
      },
      referralRewards: {}, auditEvents: {},
    });

    expect(await processReferralBookingCompletion('booking-1', firestore, new Date('2026-09-12T12:00:00Z'), trustedReferralCompletion('event-booking-1')))
      .toEqual({ created: true });
    expect(state.referralRewards['program-a__new-client']).toMatchObject({
      bookingId: 'booking-1', status: 'pending', inviterId: 'inviter-a', invitedUserId: 'new-client',
      inviterOwnerId: 'inviter-a', inviterOwnerType: 'client', invitedOwnerId: 'new-client', invitedOwnerType: 'client',
      inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR',
    });

    await expect(processReferralBookingCompletion('booking-1', firestore, new Date('2026-09-12T12:00:00Z'), trustedReferralCompletion('event-booking-1')))
      .resolves.toEqual({ created: false });
  });

  test('uses the trusted completion event time when program expiry precedes trigger handling', async () => {
    const { processReferralBookingCompletion, reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      bookings: {
        paid: {
          clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500,
          completedAt: '2026-09-12T10:00:00.000Z',
        },
      },
      referralPrograms: {
        'program-a': {
          ...activeProgram,
          startsAt: '2026-09-01T00:00:00.000Z',
          endsAt: '2026-09-12T11:00:00.000Z',
        },
      },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-12T11:00:00.000Z' } },
      referralRewards: {}, creditLedgers: {}, auditEvents: {},
    });

    await expect(processReferralBookingCompletion(
      'paid', firestore, new Date('2026-09-12T12:00:00.000Z'), trustedReferralCompletion('event-paid', '2026-09-12T10:30:00.000Z'),
    )).resolves.toEqual({ created: true });
    expect(state.referralRewards['program-a__new-client']).toMatchObject({ bookingId: 'paid', status: 'pending' });
    await expect(reviewReferralReward('admin-a', {
      rewardId: 'program-a__new-client', decision: 'approve',
    }, firestore)).resolves.toEqual({ rewardId: 'program-a__new-client', status: 'approved' });
  });

  test('does not create a reward when attribution expired before the trusted completion event', async () => {
    const { processReferralBookingCompletion } = loadModule();
    const { firestore, state } = firestoreState({
      bookings: {
        paid: {
          clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500,
          completedAt: '2026-09-12T10:00:00.000Z',
        },
      },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-12T10:15:00.000Z' } },
      referralRewards: {},
    });

    await expect(processReferralBookingCompletion(
      'paid', firestore, new Date('2026-09-12T12:00:00.000Z'), trustedReferralCompletion('event-paid', '2026-09-12T10:30:00.000Z'),
    )).resolves.toEqual({ created: false });
    expect(state.referralRewards).toEqual({});
  });

  test('refuses approval when attribution expiry is tampered to precede the trusted completion event', async () => {
    const { processReferralBookingCompletion, reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      bookings: { paid: { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500, completedAt: '2026-09-12T10:00:00.000Z' } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-12T11:00:00.000Z' } },
      referralRewards: {}, creditLedgers: {}, auditEvents: {},
    });
    await expect(processReferralBookingCompletion(
      'paid', firestore, new Date('2026-09-12T12:00:00.000Z'), trustedReferralCompletion('event-paid', '2026-09-12T10:30:00.000Z'),
    )).resolves.toEqual({ created: true });
    state.referralAttributions['new-client'].expiresAt = '2026-09-12T10:15:00.000Z';

    await expect(reviewReferralReward('admin-a', {
      rewardId: 'program-a__new-client', decision: 'approve',
    }, firestore)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.creditLedgers).toEqual({});
  });

  test('does not create a pending reward without trusted trigger completion evidence', async () => {
    const { processReferralBookingCompletion } = loadModule();
    const { firestore, state } = firestoreState({
      bookings: { paid: { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500, completedAt: '2026-09-12T10:00:00.000Z' } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' } },
      referralRewards: {},
    });

    await expect(processReferralBookingCompletion('paid', firestore, new Date('2026-09-12T12:00:00Z')))
      .resolves.toEqual({ created: false });
    expect(state.referralRewards).toEqual({});
  });

  test('does not create a pending reward from booking evidence predating program rollout', async () => {
    const { processReferralBookingCompletion } = loadModule();
    const { firestore, state } = firestoreState({
      bookings: { paid: { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500, completedAt: '2026-08-31T10:00:00.000Z' } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' } },
      referralRewards: {},
    });

    await expect(processReferralBookingCompletion(
      'paid', firestore, new Date('2026-09-12T12:00:00Z'), trustedReferralCompletion('event-paid'),
    )).resolves.toEqual({ created: false });
    expect(state.referralRewards).toEqual({});
  });

  test('approves the earliest positive paid completion despite free and later paid bookings', async () => {
    const { processReferralBookingCompletion, reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      bookings: {
        free: { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 0, completedAt: '2026-09-10T10:00:00.000Z' },
        paid: { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500, completedAt: '2026-09-11T10:00:00.000Z' },
        later: { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 1200, completedAt: '2026-09-12T10:00:00.000Z' },
      },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' } },
      referralRewards: {}, creditLedgers: {}, auditEvents: {},
    });
    const now = new Date('2026-09-12T12:00:00Z');

    await expect(processReferralBookingCompletion('paid', firestore, now, trustedReferralCompletion('event-paid'))).resolves.toEqual({ created: true });
    await expect(reviewReferralReward('admin-a', { rewardId: 'program-a__new-client', decision: 'approve' }, firestore))
      .resolves.toEqual({ rewardId: 'program-a__new-client', status: 'approved' });
    await expect(processReferralBookingCompletion('later', firestore, now, trustedReferralCompletion('event-later'))).resolves.toEqual({ created: false });
    expect(state.creditLedgers['program-a__new-client__inviter']).toMatchObject({ amountMinor: 500, status: 'approved' });
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

    await expect(processReferralBookingCompletion('booking-1', firestore, new Date('2026-09-12T12:00:00Z'), trustedReferralCompletion('event-booking-1')))
      .resolves.toEqual({ created: false });
  });

  test('creates at most one reward when two eligible completions are processed concurrently', async () => {
    const { processReferralBookingCompletion } = loadModule();
    const { firestore, state } = firestoreState({
      bookings: {
        first: { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500, completedAt: '2026-09-11T10:00:00.000Z' },
        second: { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500, completedAt: '2026-09-12T10:00:00.000Z' },
      },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' } },
      referralRewards: {},
    });

    await expect(Promise.all([
      processReferralBookingCompletion('first', firestore, new Date('2026-09-12T12:00:00Z'), trustedReferralCompletion('event-first')),
      processReferralBookingCompletion('second', firestore, new Date('2026-09-12T12:00:00Z'), trustedReferralCompletion('event-second')),
    ])).resolves.toEqual([{ created: true }, { created: false }]);
    expect(Object.keys(state.referralRewards)).toEqual(['program-a__new-client']);
    expect(state.referralRewards['program-a__new-client']).toMatchObject({ bookingId: 'first' });
  });

  test('skips rewards when a different completed non-test booking already exists', async () => {
    const { processReferralBookingCompletion } = loadModule();
    const { firestore, state } = firestoreState({
      bookings: {
        'booking-1': { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500 },
        'older-booking': { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 1200 },
      },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
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
      bookings: { 'booking-a': { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500, completedAt: '2026-09-12T10:00:00.000Z' } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { programId: 'program-a', code: 'FRIEND', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' } },
      referralBookingEvidence: {
        'booking-a': {
          rewardId: 'program-a__new-client', programId: 'program-a', bookingId: 'booking-a', code: 'FRIEND',
          inviterId: 'inviter-a', inviterOwnerId: 'inviter-a', inviterOwnerType: 'client',
          invitedUserId: 'new-client', invitedOwnerId: 'new-client', invitedOwnerType: 'client',
          currency: 'EUR', inviterCreditMinor: 500, invitedDiscountMinor: 300,
          eligibleCompletedAtMs: Date.parse('2026-09-12T10:00:00.000Z'),
          eligibilityEvidenceVersion: 1, eligibilityEvidenceEventId: 'event-booking-a',
          eligibilityEvidenceUpdateTimeMs: Date.parse('2026-09-12T12:00:00.000Z'),
          eligibilityProgramNotBeforeAtMs: Date.parse('2026-09-01T00:00:00.000Z'),
        },
      },
      referralRewards: {
        'program-a__new-client': {
          rewardId: 'program-a__new-client', programId: 'program-a', bookingId: 'booking-a', code: 'FRIEND',
          inviterId: 'inviter-a', inviterOwnerId: 'inviter-a', inviterOwnerType: 'client',
          invitedUserId: 'new-client', invitedOwnerId: 'new-client', invitedOwnerType: 'client',
          eligibleCompletedAtMs: Date.parse('2026-09-12T10:00:00.000Z'),
          eligibilityEvidenceVersion: 1, eligibilityEvidenceEventId: 'event-booking-a',
          eligibilityEvidenceUpdateTimeMs: Date.parse('2026-09-12T12:00:00.000Z'),
          eligibilityProgramNotBeforeAtMs: Date.parse('2026-09-01T00:00:00.000Z'),
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

  test('refuses cloned or mutated pending rewards without writing any ledger', async () => {
    const { processReferralBookingCompletion, reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      bookings: {
        paid: {
          clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500,
          completedAt: '2026-09-12T10:00:00.000Z',
        },
      },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' } },
      referralRewards: {}, creditLedgers: {}, auditEvents: {},
    });
    const now = new Date('2026-09-12T12:00:00.000Z');
    await expect(processReferralBookingCompletion('paid', firestore, now, trustedReferralCompletion('event-paid')))
      .resolves.toEqual({ created: true });
    state.referralRewards.cloned = { ...state.referralRewards['program-a__new-client'] };

    await expect(reviewReferralReward('admin-a', { rewardId: 'cloned', decision: 'approve' }, firestore))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.referralRewards.cloned.status).toBe('pending');
    expect(state.creditLedgers).toEqual({});
    await expect(reviewReferralReward('admin-a', {
      rewardId: 'cloned', decision: 'reject', reason: 'Malformed duplicate reward record',
    }, firestore)).resolves.toEqual({ rewardId: 'cloned', status: 'rejected' });
    expect(state.creditLedgers).toEqual({});

    state.referralRewards['program-a__new-client'].currency = 'USD';
    state.referralRewards['program-a__new-client'].inviterCreditMinor = 999999;
    state.referralRewards['program-a__new-client'].inviterOwnerType = 'brand';
    await expect(reviewReferralReward('admin-a', { rewardId: 'program-a__new-client', decision: 'approve' }, firestore))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.referralRewards['program-a__new-client'].status).toBe('pending');
    expect(state.creditLedgers).toEqual({});
  });

  test('counts top-referrer issued credits only from matching canonical ledger legs', async () => {
    const { getReferralMarketingOverview } = loadModule();
    const { firestore } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } }, referralPrograms: {}, referralCodes: {}, referralTelemetry: {},
      referralAttributions: {
        valid: { inviterId: 'inviter-a', inviterOwnerType: 'client' },
        corrupt: { inviterId: 'wrong-owner', inviterOwnerType: 'brand' },
      },
      referralRewards: {
        'program-a__client-a': canonicalOverviewReward('program-a__client-a', { inviterId: 'inviter-a' }),
        'program-b__client-b': canonicalOverviewReward('program-b__client-b', { inviterId: 'wrong-owner', inviterOwnerType: 'brand', inviterCreditMinor: 900 }),
        orphan: canonicalOverviewReward('orphan', { programId: 'program-c', invitedUserId: 'client-c', inviterId: 'orphan-owner', inviterCreditMinor: 1200 }),
      },
      creditLedgers: {
        'program-a__client-a__inviter': {
          rewardId: 'program-a__client-a', ownerId: 'inviter-a', ownerType: 'client', amountMinor: 500,
          currency: 'EUR', kind: 'referral_inviter_credit', status: 'approved',
        },
        'program-b__client-b__inviter': {
          rewardId: 'program-b__client-b', ownerId: 'forged-owner', ownerType: 'brand', amountMinor: 900,
          currency: 'EUR', kind: 'referral_inviter_credit', status: 'approved',
        },
        'orphan__inviter': {
          rewardId: 'orphan', ownerId: 'orphan-owner', ownerType: 'client', amountMinor: 1200,
          currency: 'EUR', kind: 'referral_inviter_credit', status: 'approved',
        },
      },
      referralAudit: {},
    });

    const overview = await getReferralMarketingOverview('admin-a', {}, firestore);
    expect(overview).toMatchObject({
      approvedCreditTotals: [{ currency: 'EUR', amountMinor: 500 }],
      topReferrers: [
        { inviterId: 'wrong-owner', inviterOwnerType: 'brand', approvedCreditTotals: [] },
        { inviterId: 'inviter-a', inviterOwnerType: 'client', approvedCreditTotals: [{ currency: 'EUR', amountMinor: 500 }] },
      ],
    });
  });

  test('excludes a reward with mismatched duplicated principal identities from all overview counts and credits', async () => {
    const { getReferralMarketingOverview } = loadModule();
    const { firestore } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } }, referralPrograms: {}, referralCodes: {}, referralTelemetry: {}, referralAttributions: {},
      referralRewards: {
        'program-a__client-a': canonicalOverviewReward('program-a__client-a', {
          inviterId: 'displayed-inviter', inviterOwnerId: 'ledger-owner',
        }),
      },
      creditLedgers: {
        'program-a__client-a__inviter': {
          rewardId: 'program-a__client-a', ownerId: 'ledger-owner', ownerType: 'client', amountMinor: 500,
          currency: 'EUR', kind: 'referral_inviter_credit', status: 'approved',
        },
      },
      referralAudit: {},
    });

    await expect(getReferralMarketingOverview('admin-a', {}, firestore)).resolves.toMatchObject({
      funnel: { rewards: 0, eligibleFirstBookings: 0, approved: 0, approvedRewards: 0 },
      approvedCreditTotals: [],
      topReferrers: [],
    });
  });

  test('refuses a legacy pending reward without a trusted booking evidence record', async () => {
    const { reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      bookings: { paid: { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500, completedAt: '2026-09-12T10:00:00.000Z' } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { programId: 'program-a', code: 'FRIEND', inviterId: 'inviter-a' } },
      referralBookingEvidence: {},
      referralRewards: {
        pending: {
          programId: 'program-a', bookingId: 'paid', code: 'FRIEND', inviterId: 'inviter-a', invitedUserId: 'new-client',
          eligibleCompletedAtMs: Date.parse('2026-09-12T10:00:00.000Z'), inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR', status: 'pending',
        },
      },
      creditLedgers: {},
    });

    await expect(reviewReferralReward('admin-a', { rewardId: 'pending', decision: 'approve' }, firestore))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.referralRewards.pending.status).toBe('pending');
    expect(state.creditLedgers).toEqual({});
  });

  test('does not approve a pending reward whose booking was not the invited client’s first completion', async () => {
    const { reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      bookings: {
        'booking-a': { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500 },
        'older-booking': { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 1200 },
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

  test('returns an explicit client workspace v3 from its trusted owner summary', async () => {
    const { getMyReferralWorkspace } = loadModule();
    const { firestore } = firestoreState({
      users: { 'inviter-a': { uid: 'inviter-a' } },
      memberships: {}, freelancerProfiles: {},
      referralCodes: { FRIEND: { code: 'FRIEND', ownerId: 'inviter-a', ownerType: 'client', programId: 'program-a', status: 'active' } },
      referralOwnerSummaries: {
        'client__inviter-a': {
          schemaVersion: 1, summaryEpoch: 'referral-v3', ownerId: 'inviter-a', ownerType: 'client', codeCount: 1, attributionCount: 0,
          currentCode: { code: 'FRIEND', programId: 'program-a', status: 'active' },
          inviter: { pendingCount: 1, approvedCount: 2, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotalsByCurrency: { EUR: { approvedMinor: 1000, pendingMinor: 500 } } },
          invitee: { pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotalsByCurrency: {} },
        },
      },
      referralRewards: {}, creditLedgers: {}, referralAttributions: {},
    });

    await expect(getMyReferralWorkspace('inviter-a', { scope: { type: 'client' }, limit: 10 }, firestore)).resolves.toEqual({
      contractVersion: 3,
      scope: { type: 'client' },
      summary: {
        ownerType: 'client', currentCode: { code: 'FRIEND', programId: 'program-a', status: 'active' },
        codeCount: 1, attributionCount: 0, state: 'verified',
        inviter: { pendingCount: 1, approvedCount: 2, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotals: [{ currency: 'EUR', approvedMinor: 1000, pendingMinor: 500 }] },
        invitee: { pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotals: [] },
      },
      history: { role: 'inviter', items: [], truncated: false },
    });
  });

  test('paginates a single owner history with an opaque continuation token', async () => {
    const { getMyReferralWorkspace } = loadModule();
    const summary = {
      schemaVersion: 1, summaryEpoch: 'referral-v3', ownerId: 'client-a', ownerType: 'client', codeCount: 0, attributionCount: 0,
      inviter: { pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotalsByCurrency: {} },
      invitee: { pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotalsByCurrency: {} },
    };
    const { firestore } = firestoreState({
      users: { 'client-a': { uid: 'client-a' } }, memberships: {}, freelancerProfiles: {},
      referralOwnerSummaries: { 'client__client-a': summary },
      referralOwnerHistory: {
        one: { ownerKey: 'client__client-a', ownerId: 'client-a', ownerType: 'client', role: 'inviter', rewardId: 'program-a__client-b', createdAt: '2026-09-12T10:00:00.000Z' },
        two: { ownerKey: 'client__client-a', ownerId: 'client-a', ownerType: 'client', role: 'inviter', rewardId: 'program-a__client-c', createdAt: '2026-09-12T09:00:00.000Z' },
      },
      referralRewards: {}, creditLedgers: {}, referralAttributions: {},
    });

    const first = await getMyReferralWorkspace('client-a', { scope: { type: 'client' }, limit: 1 }, firestore);
    expect(first.history).toMatchObject({ truncated: true, nextPageToken: 'one' });
    await expect(getMyReferralWorkspace('client-a', {
      scope: { type: 'client' }, limit: 1, pageToken: first.history.nextPageToken,
    }, firestore)).resolves.toMatchObject({ history: { truncated: false } });
  });

  test('renders only source-validated canonical client and brand rewards with matching ledgers', async () => {
    const { processReferralBookingCompletion, reviewReferralReward, getMyReferralWorkspace } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' }, 'client-a': { uid: 'client-a' }, 'brand-admin': { uid: 'brand-admin' } },
      memberships: { 'brand-a__principal__brand-admin': { userId: 'brand-admin', brandId: 'brand-a', role: 'principal_admin', status: 'active' } },
      brands: { 'brand-a': { name: 'A' } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: {
        CLIENTA: { code: 'CLIENTA', programId: 'program-a', ownerId: 'client-a', ownerType: 'client', status: 'active' },
        BRANDA: { code: 'BRANDA', programId: 'program-a', ownerId: 'brand-a', ownerType: 'brand', status: 'active' },
      },
      referralAttributions: {
        'client-y': { code: 'CLIENTA', programId: 'program-a', inviterId: 'client-a', inviterOwnerType: 'client', expiresAt: '2026-09-20T00:00:00.000Z' },
        'client-z': { code: 'BRANDA', programId: 'program-a', inviterId: 'brand-a', inviterOwnerType: 'brand', expiresAt: '2026-09-20T00:00:00.000Z' },
      },
      bookings: {
        'booking-y': { clientId: 'client-y', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500, completedAt: '2026-09-12T10:00:00.000Z' },
        'booking-z': { clientId: 'client-z', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500, completedAt: '2026-09-12T10:00:00.000Z' },
      },
      referralRewards: {}, creditLedgers: {}, auditEvents: {},
    });
    const now = new Date('2026-09-12T12:00:00.000Z');
    await expect(processReferralBookingCompletion('booking-y', firestore, now, trustedReferralCompletion('event-y'))).resolves.toEqual({ created: true });
    await expect(processReferralBookingCompletion('booking-z', firestore, now, trustedReferralCompletion('event-z'))).resolves.toEqual({ created: true });
    await expect(reviewReferralReward('admin-a', { rewardId: 'program-a__client-y', decision: 'approve' }, firestore)).resolves.toEqual({ rewardId: 'program-a__client-y', status: 'approved' });
    await expect(reviewReferralReward('admin-a', { rewardId: 'program-a__client-z', decision: 'approve' }, firestore)).resolves.toEqual({ rewardId: 'program-a__client-z', status: 'approved' });
    state.referralRewards['program-a__client-malformed'] = {
      ...state.referralRewards['program-a__client-y'], rewardId: 'program-a__client-malformed', bookingId: 'booking-malformed',
      invitedUserId: 'client-malformed', invitedOwnerId: 'client-malformed', inviterId: 'other-client',
    };
    state.creditLedgers['program-a__client-malformed__inviter'] = {
      ...state.creditLedgers['program-a__client-y__inviter'], rewardId: 'program-a__client-malformed',
    };
    state.referralRewards['program-a__client-brand-malformed'] = {
      ...state.referralRewards['program-a__client-z'], rewardId: 'program-a__client-brand-malformed', bookingId: 'booking-brand-malformed',
      invitedUserId: 'client-brand-malformed', invitedOwnerId: 'client-brand-malformed', inviterId: 'other-brand',
    };
    state.creditLedgers['program-a__client-brand-malformed__inviter'] = {
      ...state.creditLedgers['program-a__client-z__inviter'], rewardId: 'program-a__client-brand-malformed',
    };

    const clientWorkspace = await getMyReferralWorkspace('client-a', { scope: { type: 'client' } }, firestore);
    expect(clientWorkspace).toMatchObject({
      contractVersion: 3, summary: { state: 'verified', ownerType: 'client' },
      history: { items: [{ id: 'program-a__client-y', ownerType: 'client', role: 'inviter', amountMinor: 500, currency: 'EUR', status: 'approved' }] },
    });
    const brandWorkspace = await getMyReferralWorkspace('brand-admin', { scope: { type: 'brand', brandId: 'brand-a' } }, firestore);
    expect(brandWorkspace).toMatchObject({
      contractVersion: 3, summary: { state: 'verified', ownerType: 'brand' },
      history: { items: [{ id: 'program-a__client-z', ownerType: 'brand', role: 'inviter', amountMinor: 500, status: 'approved' }] },
    });
    expect(state.referralOwnerSummaries['client__client-a'].inviter).toMatchObject({
      pendingCount: 0, approvedCount: 1, creditTotalsByCurrency: { EUR: { pendingMinor: 0, approvedMinor: 500 } },
    });
    expect(state.referralOwnerSummaries['brand__brand-a'].inviter).toMatchObject({
      pendingCount: 0, approvedCount: 1, creditTotalsByCurrency: { EUR: { pendingMinor: 0, approvedMinor: 500 } },
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
      users: { 'principal-a': { uid: 'principal-a' } },
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

    await expect(getMyReferralWorkspace('principal-a', { scope: { type: 'brand', brandId: 'brand-a' } }, firestore))
      .resolves.toMatchObject({ contractVersion: 3, scope: { type: 'brand', brandId: 'brand-a' }, summary: { state: 'unavailable' } });
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
    const { createMyReferralCode, getReferralMarketingOverview } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'client-a': { uid: 'client-a' }, 'admin-a': { role: 'superadmin' } },
      referralProgramState: { active: { programId: 'program-a' } }, referralPrograms: { 'program-a': activeProgram },
      referralCodes: {}, memberships: {}, freelancerProfiles: {}, referralTelemetry: {}, referralAudit: {},
    });
    const now = new Date('2026-09-12T12:00:00Z');

    await expect(createMyReferralCode('client-a', { scope: { type: 'client' } }, firestore, now, () => 'CLIENT-A1')).resolves.toEqual({
      code: 'CLIENT-A1', ownerType: 'client', programId: 'program-a', reused: false,
    });
    await expect(createMyReferralCode('client-a', { scope: { type: 'client' } }, firestore, now, () => 'UNUSED-1')).resolves.toEqual({
      code: 'CLIENT-A1', ownerType: 'client', programId: 'program-a', reused: true,
    });
    expect(state.referralCodes['CLIENT-A1'].ownerId).toBe('client-a');
    expect(state.referralOwnerSummaries['client__client-a']).toMatchObject({
      schemaVersion: 1, summaryEpoch: 'referral-v3', ownerType: 'client', ownerId: 'client-a', codeCount: 1,
      currentCode: { code: 'CLIENT-A1', programId: 'program-a', status: 'active' },
    });
    await expect(getReferralMarketingOverview('admin-a', { code: 'client-a1', limit: 1 }, firestore)).resolves.toMatchObject({
      auditTrail: [{ action: 'REFERRAL_CODE_CREATED', code: 'CLIENT-A1', actorUid: 'client-a' }],
    });
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
      users: { 'manager-a': { uid: 'manager-a' } },
      memberships: { 'brand-a__location-a__manager-a': { userId: 'manager-a', brandId: 'brand-a', locationId: 'location-a', role: 'salon_admin', status: 'active', permissions: {} } },
      brands: { 'brand-a': { name: 'A' } },
      referralCodes: { BRANDA: { code: 'BRANDA', ownerId: 'brand-a', ownerType: 'brand', programId: 'program-a', status: 'active' } },
      referralRewards: {}, referralAttributions: {},
    });

    await expect(getMyReferralWorkspace('manager-a', { scope: { type: 'brand', brandId: 'brand-a' } }, firestore))
      .resolves.toMatchObject({ contractVersion: 3, scope: { type: 'brand', brandId: 'brand-a' } });
  });

  test('does not hide an authorized brand behind more than twenty irrelevant memberships', async () => {
    const { getMyReferralWorkspace } = loadModule();
    const irrelevant = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [
      `irrelevant-${index}`, { userId: 'admin-a', brandId: `irrelevant-brand-${index}`, role: 'worker', status: 'active' },
    ]));
    const { firestore } = firestoreState({
      users: { 'admin-a': { uid: 'admin-a' } },
      memberships: {
        ...irrelevant,
        valid: { userId: 'admin-a', brandId: 'brand-a', role: 'principal_admin', status: 'active' },
      },
      brands: { 'brand-a': { name: 'A' } }, referralCodes: {}, referralRewards: {}, referralAttributions: {},
    });

    await expect(getMyReferralWorkspace('admin-a', { scope: { type: 'brand', brandId: 'brand-a' } }, firestore)).resolves.toMatchObject({
      contractVersion: 3,
      scope: { type: 'brand', brandId: 'brand-a' },
      summary: { ownerType: 'brand', state: 'unavailable' },
    });
  });

  test('requires exactly one authorized workspace scope and never conflates matching IDs', async () => {
    const { getMyReferralWorkspace } = loadModule();
    const { firestore } = firestoreState({
      users: { X: { uid: 'X' }, 'brand-admin': { uid: 'brand-admin' } },
      memberships: { membership: { userId: 'brand-admin', brandId: 'X', role: 'principal_admin', status: 'active', permissions: {} } },
      brands: { X: { name: 'X' } }, freelancerProfiles: {},
      referralOwnerSummaries: {
        'client__X': { schemaVersion: 1, summaryEpoch: 'referral-v3', ownerId: 'X', ownerType: 'client', codeCount: 0, attributionCount: 0,
          inviter: { pendingCount: 1, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotalsByCurrency: {} },
          invitee: { pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotalsByCurrency: {} } },
        'brand__X': { schemaVersion: 1, summaryEpoch: 'referral-v3', ownerId: 'X', ownerType: 'brand', codeCount: 0, attributionCount: 0,
          inviter: { pendingCount: 9, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotalsByCurrency: {} },
          invitee: { pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotalsByCurrency: {} } },
      }, referralOwnerHistory: {}, referralRewards: {}, referralAttributions: {}, creditLedgers: {},
    });
    await expect(getMyReferralWorkspace('X', { scope: { type: 'client' } }, firestore))
      .resolves.toMatchObject({ summary: { ownerType: 'client', inviter: { pendingCount: 1 } } });
    await expect(getMyReferralWorkspace('brand-admin', { scope: { type: 'brand', brandId: 'X' } }, firestore))
      .resolves.toMatchObject({ summary: { ownerType: 'brand', inviter: { pendingCount: 9 } } });
    await expect(getMyReferralWorkspace('brand-admin', {}, firestore)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('records a validated public referral visit without changing rewards or credits', async () => {
    const { recordReferralVisit } = loadModule();
    const { firestore, state, readLog } = firestoreState({
      referralCodes: {
        FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' },
        PAUSED: { code: 'PAUSED', programId: 'paused-program', ownerId: 'inviter-a', ownerType: 'client', status: 'active' },
      },
      referralPrograms: {
        'program-a': activeProgram,
        'paused-program': { ...activeProgram, status: 'paused' },
      },
      referralTelemetry: {}, referralRewards: {}, creditLedgers: {},
    });

    await expect(recordReferralVisit({ code: 'missing' }, firestore, new Date('2026-09-12T12:00:00Z')))
      .rejects.toMatchObject({ code: 'not-found' });
    await expect(recordReferralVisit({ code: 'paused' }, firestore, new Date('2026-09-12T12:00:00Z')))
      .rejects.toMatchObject({ code: 'not-found' });
    expect(state.referralTelemetry).toEqual({});
    await expect(recordReferralVisit({ code: 'friend' }, firestore, new Date('2026-09-12T12:00:00Z')))
      .resolves.toEqual({ code: 'FRIEND', status: 'active', recorded: true });
    expect(state.referralTelemetry['program-a__FRIEND']).toMatchObject({
      code: 'FRIEND', programId: 'program-a', countryCode: 'FR', validatedVisitCount: 1,
    });
    expect(state.referralRewards).toEqual({});
    expect(state.creditLedgers).toEqual({});
    state.referralTelemetry['program-a__FRIEND'].validatedVisitCount = 10_000;
    await expect(recordReferralVisit({ code: 'friend' }, firestore, new Date('2026-09-12T12:00:00Z')))
      .resolves.toEqual({ code: 'FRIEND', status: 'active', recorded: false });
    expect(state.referralTelemetry['program-a__FRIEND'].validatedVisitCount).toBe(10_000);
    state.referralTelemetry['program-a__FRIEND'].validatedVisitCount = 1;
    state.referralTelemetry.overview.validatedVisitCount = 1_000_000;
    readLog.length = 0;
    await expect(recordReferralVisit({ code: 'friend' }, firestore, new Date('2026-09-12T12:00:00Z')))
      .resolves.toEqual({ code: 'FRIEND', status: 'active', recorded: false });
    expect(state.referralTelemetry.overview.validatedVisitCount).toBe(1_000_000);
    expect(state.referralTelemetry['program-a__FRIEND'].validatedVisitCount).toBe(1);
    expect(readLog).not.toContain('referralTelemetry/program-a__FRIEND');
  });

  test('allows only a super admin to flag and clear pending referral activity', async () => {
    const { setReferralRewardFlag } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' }, 'client-a': { uid: 'client-a' } },
      referralRewards: { pending: { programId: 'program-a', status: 'pending' } },
      creditLedgers: {}, auditEvents: {},
    });

    await expect(setReferralRewardFlag('client-a', {
      rewardId: 'pending', flagged: true, reason: 'Repeated referral activity',
    }, firestore)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setReferralRewardFlag('admin-a', {
      rewardId: 'pending', flagged: true, reason: 'Repeated referral activity',
    }, firestore)).resolves.toEqual({ rewardId: 'pending', flagged: true });
    expect(state.referralRewards.pending).toMatchObject({
      status: 'pending', fraudFlag: { status: 'flagged', reason: 'Repeated referral activity', reviewedBy: 'admin-a' },
    });
    expect(Object.values(state.auditEvents)).toEqual([expect.objectContaining({
      action: 'REFERRAL_REWARD_FLAGGED', rewardId: 'pending', actorUid: 'admin-a',
    })]);
    expect(state.creditLedgers).toEqual({});
    await expect(setReferralRewardFlag('admin-a', {
      rewardId: 'pending', flagged: false, reason: 'Reviewed and cleared',
    }, firestore)).resolves.toEqual({ rewardId: 'pending', flagged: false });
    expect(state.referralRewards.pending.fraudFlag).toMatchObject({ status: 'cleared', reason: 'Reviewed and cleared' });
  });

  test('requires a Super Admin to clear a flagged reward before approval can issue credits', async () => {
    const { processReferralBookingCompletion, reviewReferralReward, setReferralRewardFlag } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      bookings: { paid: { clientId: 'new-client', status: 'completed', isTest: false, paymentStatus: 'paid', pricePaidMinor: 2500, completedAt: '2026-09-11T10:00:00.000Z' } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'inviter-a', ownerType: 'client', status: 'active' } },
      referralAttributions: { 'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' } },
      referralRewards: {}, creditLedgers: {}, referralAudit: {}, auditEvents: {},
    });
    const now = new Date('2026-09-12T12:00:00Z');

    await expect(processReferralBookingCompletion('paid', firestore, now, trustedReferralCompletion('event-paid'))).resolves.toEqual({ created: true });
    await expect(setReferralRewardFlag('admin-a', {
      rewardId: 'program-a__new-client', flagged: true, reason: 'Awaiting fraud review',
    }, firestore)).resolves.toEqual({ rewardId: 'program-a__new-client', flagged: true });
    await expect(reviewReferralReward('admin-a', { rewardId: 'program-a__new-client', decision: 'approve' }, firestore))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.creditLedgers).toEqual({});
    await expect(setReferralRewardFlag('admin-a', {
      rewardId: 'program-a__new-client', flagged: false, reason: 'Manual review cleared the activity',
    }, firestore)).resolves.toEqual({ rewardId: 'program-a__new-client', flagged: false });
    await expect(reviewReferralReward('admin-a', { rewardId: 'program-a__new-client', decision: 'approve' }, firestore))
      .resolves.toEqual({ rewardId: 'program-a__new-client', status: 'approved' });
    expect(Object.keys(state.creditLedgers)).toHaveLength(2);
    await expect(reviewReferralReward('admin-a', { rewardId: 'program-a__new-client', decision: 'approve' }, firestore))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('returns typed observability totals, flagged queue, and bounded referral audit search', async () => {
    const { getReferralMarketingOverview } = loadModule();
    const { firestore } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { code: 'FRIEND', programId: 'program-a', ownerId: 'X', ownerType: 'client', status: 'active' } },
      referralTelemetry: {
        overview: { validatedVisitCount: 2 },
      },
      referralAttributions: { invited: { code: 'FRIEND', programId: 'program-a', inviterId: 'X', inviterOwnerType: 'client' } },
      referralRewards: {
        'program-a__invited': canonicalOverviewReward('program-a__invited', {
          inviterId: 'X', status: 'pending',
          fraudFlag: { status: 'flagged', reason: 'Duplicate device signal', reviewedBy: 'admin-a' },
        }),
        'program-a__credited': canonicalOverviewReward('program-a__credited', { inviterId: 'X' }),
      },
      creditLedgers: {
        'program-a__credited__inviter': { rewardId: 'program-a__credited', ownerId: 'X', ownerType: 'client', amountMinor: 500, currency: 'EUR', kind: 'referral_inviter_credit', status: 'approved' },
        'program-a__credited__invited': { rewardId: 'program-a__credited', ownerId: 'credited', ownerType: 'client', amountMinor: 300, currency: 'EUR', kind: 'referral_invited_discount', status: 'approved' },
      },
      referralAudit: {
        matching: { action: 'REFERRAL_REWARD_FLAGGED', rewardId: 'program-a__invited', programId: 'program-a', createdAt: '2026-09-12T11:00:00.000Z' },
        other: { action: 'REFERRAL_REWARD_APPROVED', rewardId: 'other', programId: 'program-a', createdAt: '2026-09-12T12:00:00.000Z' },
        unrelated: { action: 'BOOKING_CREATED', createdAt: '2026-09-12T13:00:00.000Z' },
      },
    });

    await expect(getReferralMarketingOverview('admin-a', { rewardId: 'program-a__invited', limit: 1 }, firestore)).resolves.toMatchObject({
      contractVersion: 2,
      funnel: {
        validatedVisits: 2, attributedSignups: 1, eligibleFirstBookings: 2,
        pendingRewards: 1, approvedRewards: 1,
      },
      approvedCreditTotals: [{ currency: 'EUR', amountMinor: 800 }],
      topReferrers: [{ inviterId: 'X', inviterOwnerType: 'client', referrals: 1, rewards: 2 }],
      flaggedRewards: [{ id: 'program-a__invited', fraudFlag: { status: 'flagged', reason: 'Duplicate device signal' } }],
      auditTrail: [{ rewardId: 'program-a__invited', action: 'REFERRAL_REWARD_FLAGGED' }],
    });
    await expect(getReferralMarketingOverview('admin-a', { rewardId: 'program-a__invited', limit: 51 }, firestore))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('requires fresh Firebase App Check attestation for public telemetry reporting', () => {
    const { referralVisitCallableOptions, canRecordReferralVisit } = loadModule();

    expect(referralVisitCallableOptions).toEqual({ enforceAppCheck: true, consumeAppCheckToken: true, maxInstances: 2 });
    expect(canRecordReferralVisit({ alreadyConsumed: false })).toBe(true);
    expect(canRecordReferralVisit({ alreadyConsumed: true })).toBe(false);
  });

  test('rejects a consumed App Check token before the public telemetry handler writes', async () => {
    const { recordReferralVisitFunction } = loadModule();

    await expect(recordReferralVisitFunction.run({ code: 'FRIEND' }, { app: { alreadyConsumed: true } }))
      .rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  test('rejects a missing App Check context before the public telemetry handler writes', async () => {
    const { recordReferralVisitFunction } = loadModule();

    await expect(recordReferralVisitFunction.run({ code: 'FRIEND' }, {}))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
