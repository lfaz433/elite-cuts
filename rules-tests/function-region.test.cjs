const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const functionsDirectory = resolve(__dirname, '..', 'functions', 'src');
const functionModules = [
  'index.ts',
  'bootstrapTenant.ts',
  'memberships.ts',
  'invitations.ts',
  'businessInfo.ts',
  'publicProfiles.ts',
  'bookings.ts',
  'freelancers.ts',
  'jobs.ts',
  'deposits.ts',
  'campaigns.ts',
  'referrals.ts',
];

test('all deployed Function builders use the shared Europe region runtime', () => {
  const runtime = readFileSync(resolve(functionsDirectory, 'runtime.ts'), 'utf8');
  expect(runtime).toContain("export const FUNCTIONS_REGION = 'europe-west1'");
  expect(runtime).toContain('export const europeFunctions = functions.region(FUNCTIONS_REGION)');

  for (const moduleName of functionModules) {
    const source = readFileSync(resolve(functionsDirectory, moduleName), 'utf8');
    expect(source).toContain("from './runtime'");
    expect(source).not.toMatch(/functions\.(https\.onCall|https\.onRequest|firestore\.document|runWith)\b/);
  }
});
