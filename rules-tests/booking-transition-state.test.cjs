const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');

function loadModule(relativePath) {
  const filename = resolve(__dirname, '..', relativePath);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', output)(require, loaded, loaded.exports);
  return loaded.exports;
}

const activeManager = {
  userId: 'manager-a',
  locationId: 'location-a',
  status: 'active',
  permissions: { manageBookings: true },
};

test('transaction state rejects a booking moved after the initial authorization check', () => {
  const { assertTransitionTransactionState } = loadModule(
    'functions/src/bookingTransitionState.ts',
  );

  expect(() => assertTransitionTransactionState(
    'manager-a',
    'tenant-a',
    'location-a',
    { tenantId: 'tenant-b', locationId: 'location-b' },
    activeManager,
  )).toThrow('Booking scope changed during transition');
});

test('transaction state rejects membership revoked after the initial authorization check', () => {
  const { assertTransitionTransactionState } = loadModule(
    'functions/src/bookingTransitionState.ts',
  );

  expect(() => assertTransitionTransactionState(
    'manager-a',
    'tenant-a',
    'location-a',
    { tenantId: 'tenant-a', locationId: 'location-a' },
    { ...activeManager, status: 'disabled' },
  )).toThrow('Booking authorization changed during transition');
});

test('transaction state accepts the same active scoped membership', () => {
  const { assertTransitionTransactionState } = loadModule(
    'functions/src/bookingTransitionState.ts',
  );

  expect(() => assertTransitionTransactionState(
    'manager-a',
    'tenant-a',
    'location-a',
    { tenantId: 'tenant-a', locationId: 'location-a' },
    activeManager,
  )).not.toThrow();
});
