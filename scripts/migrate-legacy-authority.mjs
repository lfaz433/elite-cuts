import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const {
  compatibleOwnerMembership,
  executeLegacyAuthorityPlan,
  planLegacyAuthorityMigration,
} = require('./lib/legacy-authority-plan.cjs');
const { EXPECTED_FIREBASE_PROJECTS } = require('./lib/firebase-targets.cjs');

const args = new Set(process.argv.slice(2));
const projectArgumentIndex = process.argv.indexOf('--project');
const target = projectArgumentIndex >= 0 ? process.argv[projectArgumentIndex + 1] : undefined;
const apply = args.has('--apply');

const isStaging = target === 'staging' || target === EXPECTED_FIREBASE_PROJECTS.staging;
const isProduction = target === 'production' || target === EXPECTED_FIREBASE_PROJECTS.production;
if (!isStaging && !isProduction) {
  console.error('Legacy authority migration requires --project staging or --project production.');
  process.exit(2);
}
if (
  isProduction
  && process.env.CONFIRM_PRODUCTION_MIGRATION !== EXPECTED_FIREBASE_PROJECTS.production
) {
  console.error(`Production access refused. Set CONFIRM_PRODUCTION_MIGRATION=${EXPECTED_FIREBASE_PROJECTS.production}.`);
  process.exit(2);
}
if (args.has('--dry-run') && apply) {
  console.error('Choose either --dry-run or --apply.');
  process.exit(2);
}
if (apply && isStaging && process.env.CONFIRM_STAGING_WRITE !== EXPECTED_FIREBASE_PROJECTS.staging) {
  console.error(`Staging apply requires CONFIRM_STAGING_WRITE=${EXPECTED_FIREBASE_PROJECTS.staging}.`);
  process.exit(2);
}

const projectId = isProduction
  ? EXPECTED_FIREBASE_PROJECTS.production
  : EXPECTED_FIREBASE_PROJECTS.staging;
if (admin.apps.length === 0) admin.initializeApp({ projectId });
const db = admin.firestore();
const auth = admin.auth();

const tenantSnapshot = await db.collection('tenants').get();
const tenants = tenantSnapshot.docs.map(document => ({
  id: document.id,
  ownerUid: document.data().ownerUid,
}));
const authUsers = [];
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  for (const user of page.users) {
    authUsers.push({ uid: user.uid, customClaims: user.customClaims ?? {} });
  }
  pageToken = page.pageToken;
} while (pageToken);

const memberships = {};
const membershipIds = new Set(tenants
  .filter(tenant => typeof tenant.ownerUid === 'string')
  .map(tenant => `${tenant.id}__${tenant.ownerUid}`));
for (const user of authUsers) {
  const tenantId = user.customClaims?.tenantId;
  if (typeof tenantId === 'string' && tenantId) membershipIds.add(`${tenantId}__${user.uid}`);
}
for (const id of [...membershipIds].sort()) {
  const snapshot = await db.collection('memberships').doc(id).get();
  if (snapshot.exists) memberships[id] = snapshot.data();
}

const profileSnapshot = await db.collection('users')
  .where('role', 'in', ['admin', 'salon_admin', 'principal_admin', 'superadmin'])
  .get();
const legacyProfiles = profileSnapshot.docs.map(document => {
  const data = document.data();
  return {
    id: document.id,
    uid: data.uid,
    tenantId: data.tenantId,
    role: data.role,
  };
});

const plan = planLegacyAuthorityMigration({
  tenants,
  memberships,
  authUsers,
  legacyProfiles,
});

const operations = {
  createMembership: async (id, data) => {
    const ref = db.collection('memberships').doc(id);
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        if (compatibleOwnerMembership(snapshot.data(), data.locationId, data.userId)) return;
        throw new Error(`Conflict detected while creating ${id}`);
      }
      transaction.create(ref, {
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  },
  updateClaims: async (uid, claims) => {
    await auth.setCustomUserClaims(uid, claims);
    await auth.revokeRefreshTokens(uid);
  },
};

const result = await executeLegacyAuthorityPlan(plan, operations, { apply });
console.log(JSON.stringify({
  projectId,
  mode: apply ? 'apply' : 'dry-run',
  result,
  summary: {
    skippedExisting: plan.skippedExisting.length,
    conflicts: plan.conflicts.length,
    deferred: plan.deferred.length,
    reviewCandidates: plan.reviewCandidates.length,
  },
}, null, 2));

if (plan.conflicts.length > 0) process.exitCode = 3;
