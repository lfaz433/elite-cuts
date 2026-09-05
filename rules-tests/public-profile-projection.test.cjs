const { readFileSync } = require('node:fs');
const { dirname, isAbsolute, resolve } = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath) {
  const filename = isAbsolute(relativePath)
    ? relativePath
    : resolve(__dirname, '..', relativePath);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    request => request === 'firebase-admin' || request === 'firebase-functions'
      ? require(resolve(__dirname, '..', 'functions', 'node_modules', request))
      : require(request),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

test('approved salon projections contain only public discovery fields', () => {
  const { projectSalonPublicProfile } = loadTypeScriptModule('functions/src/publicProfiles.ts');

  expect(projectSalonPublicProfile('salon-paris', {
    name: 'Atelier Paris',
    city: 'Paris',
    address: '17 rue privée',
    publicProfile: {
      approvalStatus: 'approved',
      visible: true,
      latitude: 48.8566,
      longitude: 2.3522,
      serviceSummary: 'Coupe et barbe',
      portfolioUrls: ['https://example.test/portfolio/paris.jpg'],
      serviceIds: ['cut', 'beard'],
    },
  })).toEqual({
    kind: 'salon',
    cityId: 'fr-paris',
    latitude: 48.85,
    longitude: 2.35,
    serviceSummary: 'Coupe et barbe',
    portfolioUrls: ['https://example.test/portfolio/paris.jpg'],
    visible: true,
    approvalStatus: 'approved',
    displayName: 'Atelier Paris',
    serviceIds: ['cut', 'beard'],
    homeVisit: false,
  });
});

test('public map coordinates never retain the exact source location', () => {
  const { projectSalonPublicProfile } = loadTypeScriptModule('functions/src/publicProfiles.ts');

  const profile = projectSalonPublicProfile('salon-paris', {
    name: 'Atelier Paris',
    city: 'Paris',
    publicProfile: {
      approvalStatus: 'approved',
      visible: true,
      latitude: 48.8566,
      longitude: 2.3522,
      serviceSummary: 'Coupe et barbe',
      portfolioUrls: [],
    },
  });

  expect(profile).not.toBeNull();
  expect(profile.latitude).not.toBe(48.8566);
  expect(profile.longitude).not.toBe(2.3522);
});

test('only explicitly approved source profiles become visible projections', () => {
  const { projectSalonPublicProfile } = loadTypeScriptModule('functions/src/publicProfiles.ts');

  expect(projectSalonPublicProfile('salon-paris', {
    name: 'Atelier Paris',
    city: 'Paris',
    publicProfile: {
      approvalStatus: 'pending',
      visible: true,
      latitude: 48.8566,
      longitude: 2.3522,
      serviceSummary: 'Coupe et barbe',
      portfolioUrls: [],
    },
  })).toBeNull();
});

test('a city is publicly eligible only when its launch record is enabled', () => {
  const { enabledCity } = loadTypeScriptModule('functions/src/publicProfiles.ts');

  expect(enabledCity('fr-paris', { status: 'enabled' })).toBe(true);
  expect(enabledCity('fr-grenoble', { status: 'disabled' })).toBe(false);
});
