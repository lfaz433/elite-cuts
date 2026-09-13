const scrub = require('../scripts/lib/public-document-scrub.cjs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

test('legacy public documents are recursively scrubbed and marked safe', () => {
  const source = {
    name: 'Worker',
    password: 'plaintext',
    nested: { temporaryCredential: 'plaintext', note: 'keep' },
    list: [{ adminPassword: 'plaintext', label: 'keep' }],
  };

  expect(scrub.sanitizePublicDocument(source)).toEqual({
    name: 'Worker',
    nested: { note: 'keep' },
    list: [{ label: 'keep' }],
    publicCredentialSafe: true,
  });
  expect(scrub.needsPublicDocumentScrub(source)).toBe(true);
  expect(scrub.needsPublicDocumentScrub(scrub.sanitizePublicDocument(source))).toBe(false);
  expect(scrub.sanitizeBarberDocument(source)).toEqual({
    name: 'Worker',
    publicCredentialSafe: true,
  });
});

test('public-document migration requires exact confirmation before production access', () => {
  const result = spawnSync(process.execPath, [
    resolve(__dirname, '..', 'scripts', 'migrate-public-documents.mjs'),
    '--project', 'production', '--dry-run',
  ], { env: { ...process.env, CONFIRM_PRODUCTION_MIGRATION: '' } });

  expect(result.status).toBe(2);
  expect(result.stderr.toString()).toContain('CONFIRM_PRODUCTION_MIGRATION=elite-cuts-app');
});
