const { readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath) {
  const filename = resolve(__dirname, '..', relativePath);
  const source = readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) => require(resolve(dirname(filename), request));
  new Function('require', 'module', 'exports', output)(
    request => request.startsWith('.') ? localRequire(request) : require(request),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

test('a pending booking cannot skip approval and complete directly', () => {
  const { assertTransition } = loadTypeScriptModule('functions/src/bookingStatus.ts');

  expect(() => assertTransition('pending_approval', 'completed'))
    .toThrow('Invalid booking transition');
});

test.each([
  ['draft', 'pending_approval'],
  ['draft', 'confirmed'],
  ['pending_approval', 'confirmed'],
  ['pending_approval', 'declined'],
  ['confirmed', 'completed'],
  ['confirmed', 'payment_failed'],
  ['payment_failed', 'confirmed'],
])('allows the supported transition from %s to %s', (from, to) => {
  const { assertTransition } = loadTypeScriptModule('functions/src/bookingStatus.ts');

  expect(() => assertTransition(from, to)).not.toThrow();
});

test.each(['declined', 'cancelled', 'completed'])(
  '%s is terminal and cannot return to confirmed',
  status => {
    const { assertTransition } = loadTypeScriptModule('functions/src/bookingStatus.ts');

    expect(() => assertTransition(status, 'confirmed'))
      .toThrow('Invalid booking transition');
  },
);

test('an HTTP request without a Firebase bearer token is anonymous', async () => {
  const { verifyFirebaseIdToken } = loadTypeScriptModule('functions/src/httpAuth.ts');

  await expect(verifyFirebaseIdToken({ headers: {} })).resolves.toBeNull();
});

test('a malformed Firebase authorization header is anonymous', async () => {
  const { verifyFirebaseIdToken } = loadTypeScriptModule('functions/src/httpAuth.ts');

  await expect(verifyFirebaseIdToken({ headers: { authorization: 'Basic value' } }))
    .resolves.toBeNull();
});
