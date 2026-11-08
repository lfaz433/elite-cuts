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

const isLaunch = target === 'launch' || target === EXPECTED_FIREBASE_PROJECTS.launch;
if (!isLaunch) {
  console.error('Public document migration requires --project launch.');
  process.exit(2);
}
if (
  process.env.CONFIRM_LAUNCH_MIGRATION !== EXPECTED_FIREBASE_PROJECTS.launch
) {
  console.error(`Launch access refused. Set CONFIRM_LAUNCH_MIGRATION=${EXPECTED_FIREBASE_PROJECTS.launch}.`);
  process.exit(2);
}
if (args.has('--dry-run') && apply) {
  console.error('Choose either --dry-run or --apply.');
  process.exit(2);
}
const admin = require('firebase-admin');
const projectId = EXPECTED_FIREBASE_PROJECTS.launch;
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
