const { execFileSync, spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const verifier = resolve(__dirname, '..', 'scripts', 'verify-environment.mjs');
const productionGuard = resolve(__dirname, '..', 'scripts', 'guard-production-deploy.mjs');
const targetGuard = require(resolve(__dirname, '..', 'scripts', 'lib', 'firebase-targets.cjs'));

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

test('implicit Firebase CLI target is staging and deploy scripts name their target', () => {
  const firebaseRc = JSON.parse(readFileSync(resolve(__dirname, '..', '.firebaserc'), 'utf8'));
  const functionsPackage = JSON.parse(readFileSync(resolve(__dirname, '..', 'functions/package.json'), 'utf8'));

  expect(firebaseRc.projects.default).toBe('elite-cuts-staging');
  expect(firebaseRc.projects.staging).toBe('elite-cuts-staging');
  expect(firebaseRc.projects.production).toBe('elite-cuts-app');
  expect(functionsPackage.scripts).not.toHaveProperty('deploy');
  expect(functionsPackage.scripts['deploy:staging']).toContain('--project staging');
  expect(functionsPackage.scripts['deploy:staging']).toContain('guard-firebase-target.mjs staging');
  expect(functionsPackage.scripts['deploy:production']).toContain('--project production');
  expect(functionsPackage.scripts['deploy:production']).toContain('guard-firebase-target.mjs production');
});

test('Firebase target guard rejects any staging or production alias remap', () => {
  expect(() => targetGuard.assertFirebaseAliases({
    projects: { default: 'elite-cuts-staging', staging: 'elite-cuts-app', production: 'elite-cuts-app' },
  })).toThrow('staging alias');
  expect(() => targetGuard.assertFirebaseAliases({
    projects: { default: 'elite-cuts-staging', staging: 'elite-cuts-staging', production: 'attacker-project' },
  })).toThrow('production alias');
});

test('production deploy requires an exact explicit confirmation', () => {
  const rejected = spawnSync(process.execPath, [productionGuard], {
    env: { ...process.env, CONFIRM_PRODUCTION_PROJECT: '' },
  });
  const accepted = spawnSync(process.execPath, [productionGuard], {
    env: { ...process.env, CONFIRM_PRODUCTION_PROJECT: 'elite-cuts-app' },
  });

  expect(rejected.status).not.toBe(0);
  expect(accepted.status).toBe(0);
});

test('Firebase Admin never accepts a client Vite project variable as server configuration', () => {
  const source = readFileSync(resolve(__dirname, '..', 'api/utils/firebaseAdmin.ts'), 'utf8');
  expect(source).toContain('process.env.FIREBASE_PROJECT_ID');
  expect(source).not.toContain('process.env.VITE_FIREBASE_PROJECT_ID');
});

test('data mutation utilities contain no committed password or production target and default to no-write', () => {
  for (const relativePath of ['scripts/seedDemo.js', 'scripts/seedDemoClient.js', 'scripts/resetFinancial.js']) {
    const source = readFileSync(resolve(__dirname, '..', relativePath), 'utf8');
    expect(source).not.toContain('elite-cuts-app');
    expect(source).not.toMatch(/password123|Demo1234!/i);
    expect(source).toContain('requireStagingWrite');
  }
});

test('diagnostic utilities are explicitly staging-only and contain no committed Firebase key', () => {
  for (const relativePath of ['audit.mjs', 'inspect_users.js', 'get_barbers.js']) {
    const source = readFileSync(resolve(__dirname, '..', relativePath), 'utf8');
    expect(source).not.toContain('elite-cuts-app');
    expect(source).not.toMatch(/AIzaSy[A-Za-z0-9_-]+/);
    expect(source).toContain('requireStagingRead');
  }
});
