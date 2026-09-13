const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

test('no administrator or demo seeder creates or reveals a worker password', () => {
  const sources = [
    'src/app/components/pages/AdminDashboard.tsx',
    'src/app/components/admin/BarberModal.tsx',
    'scripts/seedDemo.js',
    'scripts/seedDemoClient.js',
  ].map(relativePath => readFileSync(resolve(__dirname, '..', relativePath), 'utf8')).join('\n');

  expect(sources).not.toMatch(/createAuthUser\(['"]demo-barber/i);
  expect(sources).not.toMatch(/Barber:\s*demo-barber[^\n]*\//i);
  expect(sources).not.toMatch(/type=["']password["'][\s\S]{0,500}coiffeur/i);
});

test('public barber collection queries require the server-enforced safe marker', () => {
  const context = readFileSync(resolve(__dirname, '..', 'src/app/components/context/BusinessContext.tsx'), 'utf8');
  const rules = readFileSync(resolve(__dirname, '..', 'firestore.rules'), 'utf8');

  expect(context).toContain("where('publicCredentialSafe', '==', true)");
  expect(rules).toContain('resource.data.publicCredentialSafe == true');
});

test('every browser barber producer and query uses the safe public marker', () => {
  const onboarding = readFileSync(resolve(__dirname, '..', 'src/app/components/pages/Onboarding.tsx'), 'utf8');
  const superAdmin = readFileSync(resolve(__dirname, '..', 'src/app/components/pages/SuperAdmin.tsx'), 'utf8');
  const admin = readFileSync(resolve(__dirname, '..', 'src/app/components/pages/AdminDashboard.tsx'), 'utf8');

  expect(onboarding).toContain('publicCredentialSafe: true');
  expect(superAdmin).toContain("where('publicCredentialSafe', '==', true)");
  expect(admin).toContain('WorkerInviteDialog');
  expect(admin).not.toContain('Les accès collaborateurs sont créés depuis un espace multi-salon');
});
