const { execFileSync, spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const verifier = resolve(__dirname, '..', 'scripts', 'verify-environment.mjs');
const targetGuardScript = resolve(__dirname, '..', 'scripts', 'guard-firebase-target.mjs');
const targetGuard = require(resolve(__dirname, '..', 'scripts', 'lib', 'firebase-targets.cjs'));

test('environment verifier rejects an unsupported target even when the project id is absent', () => {
  const result = spawnSync(process.execPath, [verifier, 'preview'], {
    env: { ...process.env, VITE_FIREBASE_PROJECT_ID: '' },
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr.toString()).toContain('Unsupported environment target');
});

test('environment verifier accepts the launch environment only for the founder-owned project', () => {
  expect(() => execFileSync(process.execPath, [verifier, 'launch'], {
    env: { ...process.env, VITE_FIREBASE_PROJECT_ID: 'elitecuts-2fb0a' },
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

test('Firebase CLI defaults to the launch project and deploy scripts name their target', () => {
  const firebaseRc = JSON.parse(readFileSync(resolve(__dirname, '..', '.firebaserc'), 'utf8'));
  const functionsPackage = JSON.parse(readFileSync(resolve(__dirname, '..', 'functions/package.json'), 'utf8'));

  expect(firebaseRc.projects.default).toBe('elitecuts-2fb0a');
  expect(firebaseRc.projects.launch).toBe('elitecuts-2fb0a');
  expect(Object.keys(firebaseRc.projects).sort()).toEqual(['default', 'launch']);
  expect(functionsPackage.scripts).not.toHaveProperty('deploy');
  expect(functionsPackage.scripts).toHaveProperty('deploy:launch');
  expect(functionsPackage.scripts).not.toHaveProperty('deploy:staging');
  expect(functionsPackage.scripts).not.toHaveProperty('deploy:production');
  expect(functionsPackage.scripts['deploy:launch']).toContain('--project launch');
  expect(functionsPackage.scripts['deploy:launch']).toContain('guard-firebase-target.mjs launch');
  expect(functionsPackage.scripts['deploy:launch']).toContain('--only firestore:rules,firestore:indexes,functions');
});

test('Firebase target guard rejects any default or launch alias remap', () => {
  expect(() => targetGuard.assertFirebaseAliases({
    projects: { default: 'attacker-project', launch: 'elitecuts-2fb0a' },
  })).toThrow('default alias');
  expect(() => targetGuard.assertFirebaseAliases({
    projects: { default: 'elitecuts-2fb0a', launch: 'attacker-project' },
  })).toThrow('launch alias');
});

test('launch deploy requires an exact explicit confirmation', () => {
  const rejected = spawnSync(process.execPath, [targetGuardScript, 'launch'], {
    env: { ...process.env, CONFIRM_LAUNCH_PROJECT: '' },
  });
  const accepted = spawnSync(process.execPath, [targetGuardScript, 'launch'], {
    env: { ...process.env, CONFIRM_LAUNCH_PROJECT: 'elitecuts-2fb0a' },
  });

  expect(rejected.status).not.toBe(0);
  expect(accepted.status).toBe(0);
});

test('launch validation script runs the build, Firebase environment checks, and rules suite', () => {
  const rootPackage = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'));

  expect(rootPackage.scripts).toHaveProperty('test:rules');
  expect(rootPackage.scripts).toHaveProperty('test:launch');
  expect(rootPackage.scripts['test:launch']).toContain('npm run build');
  expect(rootPackage.scripts['test:launch']).toContain('npm --prefix functions run build');
  expect(rootPackage.scripts['test:launch']).toContain('firebaseEnvironment.test.mjs');
  expect(rootPackage.scripts['test:launch']).toContain('npm run test:rules');
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
