import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  needsPublicDocumentScrub,
  sanitizeBarberDocument,
  sanitizePublicDocument,
} = require('./lib/public-document-scrub.cjs');
const { EXPECTED_FIREBASE_PROJECTS } = require('./lib/firebase-targets.cjs');
const args = new Set(process.argv.slice(2));
const projectIndex = process.argv.indexOf('--project');
const target = projectIndex >= 0 ? process.argv[projectIndex + 1] : undefined;
const apply = args.has('--apply');

const isStaging = target === 'staging' || target === EXPECTED_FIREBASE_PROJECTS.staging;
const isProduction = target === 'production' || target === EXPECTED_FIREBASE_PROJECTS.production;
if (!isStaging && !isProduction) {
  console.error('Public document migration requires --project staging or --project production.');
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

const admin = require('firebase-admin');
const projectId = isProduction
  ? EXPECTED_FIREBASE_PROJECTS.production
  : EXPECTED_FIREBASE_PROJECTS.staging;
if (admin.apps.length === 0) admin.initializeApp({ projectId });
const db = admin.firestore();
const documents = [];

const barbers = await db.collection('barbers').get();
for (const document of barbers.docs) documents.push({ document, kind: 'barber' });
const tenants = await db.collection('tenants').get();
for (const tenant of tenants.docs) {
  const info = await tenant.ref.collection('businessInfo').doc('info').get();
  if (info.exists) documents.push({ document: info, kind: 'businessInfo' });
}

const candidates = documents.filter(item => {
  const source = item.document.data();
  const safe = item.kind === 'barber' ? sanitizeBarberDocument(source) : null;
  return needsPublicDocumentScrub(source)
    || (safe !== null && Object.keys(source).some(key => (
      !Object.prototype.hasOwnProperty.call(safe, key)
    )));
});
if (apply) {
  for (const item of candidates) {
    const source = item.document.data();
    const safe = item.kind === 'barber'
      ? sanitizeBarberDocument(source)
      : sanitizePublicDocument(source);
    await item.document.ref.set(safe);
  }
}

console.log(JSON.stringify({
  projectId,
  mode: apply ? 'apply' : 'dry-run',
  scanned: documents.length,
  scrubbed: apply ? candidates.length : 0,
  pendingScrubs: apply ? 0 : candidates.length,
}, null, 2));
