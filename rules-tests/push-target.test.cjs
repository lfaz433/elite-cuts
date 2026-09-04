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
  new Function('require', 'module', 'exports', output)(
    request => request.startsWith('.')
      ? require(resolve(dirname(filename), request))
      : require(request),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

function fakeDb(notification) {
  return {
    collection: name => ({
      doc: id => ({
        get: async () => ({
          exists: name === 'notifications' && id === 'notification-a',
          data: () => notification,
        }),
      }),
    }),
  };
}

test('rejects a server-issued push target owned by another tenant', async () => {
  const { resolvePushTarget } = loadTypeScriptModule('api/utils/pushTarget.ts');
  const db = fakeDb({
    serverIssued: true,
    tenantId: 'tenant-b',
    recipientId: 'recipient-b',
    title: 'Server title',
    message: 'Server message',
    redirectUrl: '/client',
  });

  await expect(resolvePushTarget(db, 'tenant-a', 'notification-a'))
    .rejects.toThrow('Push target does not belong to this tenant');
});

test('returns only delivery data stored in the server-issued notification', async () => {
  const { resolvePushTarget } = loadTypeScriptModule('api/utils/pushTarget.ts');
  const db = fakeDb({
    serverIssued: true,
    tenantId: 'tenant-a',
    recipientId: 'recipient-a',
    title: 'Server title',
    message: 'Server message',
    redirectUrl: '/client',
  });

  await expect(resolvePushTarget(db, 'tenant-a', 'notification-a')).resolves.toEqual({
    recipientId: 'recipient-a',
    title: 'Server title',
    body: 'Server message',
    redirectUrl: '/client',
  });
});
