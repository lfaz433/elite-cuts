const { execFileSync, spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const verifier = resolve(__dirname, '..', 'scripts', 'verify-environment.mjs');

test('environment verifier rejects an unsupported target even when the project id is absent', () => {
  const result = spawnSync(process.execPath, [verifier, 'preview'], {
    env: { ...process.env, VITE_FIREBASE_PROJECT_ID: '' },
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr.toString()).toContain('Unsupported environment target');
});

test.each([
  ['staging', 'elite-cuts-staging'],
  ['production', 'elite-cuts-app'],
])('environment verifier accepts %s only with its project', (target, projectId) => {
  expect(() => execFileSync(process.execPath, [verifier, target], {
    env: { ...process.env, VITE_FIREBASE_PROJECT_ID: projectId },
  })).not.toThrow();
});

test('runtime domain and push configuration does not embed production identifiers', () => {
  for (const relativePath of [
    'src/app/components/context/TenantContext.tsx',
    'src/app/components/context/NotificationContext.tsx',
    'src/app/components/pages/AdminDashboard.tsx',
    'api/remove-subdomain.ts',
  ]) {
    const source = readFileSync(resolve(__dirname, '..', relativePath), 'utf8');
    expect(source).not.toMatch(/barbeboard\.pro|812f9b44-12d9-4391-97b7-6f0b2798987d|elite-cuts-app\/databases/);
  }
});

test('registration availability reads the reservation collection', () => {
  const source = readFileSync(resolve(__dirname, '..', 'src/app/components/pages/Register.tsx'), 'utf8');
  expect(source).toContain("doc(db, 'subdomains', subdomain)");
  expect(source).not.toContain("where('subdomain', '==', subdomain)");
});
