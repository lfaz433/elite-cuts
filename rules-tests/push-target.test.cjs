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

function fakeDb(notification, membership) {
  const state = { notification: { ...notification } };
  const makeRef = (collectionName, id) => ({ collectionName, id });
  const snapshot = ref => ({
    exists: ref.collectionName === 'notifications'
      ? ref.id === 'notification-a'
      : ref.id === notification.recipientMembershipId,
    data: () => ref.collectionName === 'notifications' ? state.notification : membership,
  });
  return {
    collection: name => ({
      doc: id => makeRef(name, id),
    }),
    runTransaction: async callback => callback({
      get: async ref => snapshot(ref),
      update: (ref, value) => {
        if (ref.collectionName === 'notifications') {
          state.notification = { ...state.notification, ...value };
        }
      },
    }),
    state,
  };
}

test('rejects a server-issued push target owned by another tenant', async () => {
  const { claimPushTarget } = loadTypeScriptModule('api/utils/pushTarget.ts');
  const db = fakeDb({
    serverIssued: true,
    tenantId: 'tenant-b',
    locationId: 'tenant-b',
    recipientId: 'recipient-b',
    recipientMembershipId: 'membership-b',
    title: 'Server title',
    message: 'Server message',
    redirectUrl: '/client',
  });

  await expect(claimPushTarget(db, 'tenant-a', 'notification-a'))
    .rejects.toThrow('Push target does not belong to this tenant');
});

test('returns only delivery data stored in the server-issued notification', async () => {
  const { claimPushTarget } = loadTypeScriptModule('api/utils/pushTarget.ts');
  const db = fakeDb({
    serverIssued: true,
    tenantId: 'tenant-a',
    locationId: 'tenant-a',
    recipientId: 'recipient-a',
    recipientMembershipId: 'membership-a',
    title: 'Server title',
    message: 'Server message',
    redirectUrl: '/client',
  }, {
    userId: 'recipient-a',
    brandId: 'tenant-a',
    locationId: 'tenant-a',
    status: 'active',
  });

  await expect(claimPushTarget(db, 'tenant-a', 'notification-a')).resolves.toEqual({
    recipientId: 'recipient-a',
    title: 'Server title',
    body: 'Server message',
    redirectUrl: '/client',
  });
});

test('rejects a recipient whose membership belongs to another tenant', async () => {
  const { claimPushTarget } = loadTypeScriptModule('api/utils/pushTarget.ts');
  const db = fakeDb({
    serverIssued: true,
    tenantId: 'tenant-a',
    locationId: 'tenant-a',
    recipientId: 'recipient-b',
    recipientMembershipId: 'membership-b',
    title: 'Server title',
    message: 'Server message',
    redirectUrl: '/client',
  }, {
    userId: 'recipient-b',
    brandId: 'tenant-b',
    locationId: 'tenant-b',
    status: 'active',
  });

  await expect(claimPushTarget(db, 'tenant-a', 'notification-a'))
    .rejects.toThrow('Push recipient is not associated with this tenant');
});

test('atomically rejects replay after the first delivery claim', async () => {
  const { claimPushTarget } = loadTypeScriptModule('api/utils/pushTarget.ts');
  const db = fakeDb({
    serverIssued: true,
    tenantId: 'tenant-a',
    locationId: 'tenant-a',
    recipientId: 'recipient-a',
    recipientMembershipId: 'membership-a',
    title: 'Server title',
    message: 'Server message',
    redirectUrl: '/client',
  }, {
    userId: 'recipient-a',
    brandId: 'tenant-a',
    locationId: 'tenant-a',
    status: 'active',
  });

  await expect(claimPushTarget(db, 'tenant-a', 'notification-a')).resolves.toBeDefined();
  await expect(claimPushTarget(db, 'tenant-a', 'notification-a'))
    .rejects.toThrow('Push target was already claimed');
});
