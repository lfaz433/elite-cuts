const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync, existsSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const ts = require('typescript');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const sdk = {
  'firebase-functions': { https: { HttpsError }, region: () => ({ https: { onCall: handler => handler } }) },
  'firebase-admin': { firestore: Object.assign(() => {}, { FieldValue: { serverTimestamp: () => 'timestamp' } }) },
};
function load(file) {
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(id => id.startsWith('.') ? load(resolve(dirname(file), id + '.ts')) : sdk[id] ?? require(id), module, module.exports);
  return module.exports;
}
const file = resolve(__dirname, 'salonServices.ts');
const api = existsSync(file) ? load(file) : {};
const services = [{ id: 'coupe', label: 'Coupe', priceMinor: 2000, durationMinutes: 30 }];
const input = { locationId: 'salon-a', expectedRevision: 0, services };
function fixture(member = { userId: 'owner', brandId: 'brand-a', role: 'principal_admin', status: 'active' }, staff = false) {
  const state = {
    salonLocations: { 'salon-a': { name: 'Ayline', brandId: 'brand-a', phone: 'unchanged', publicProfile: { visible: false, approvalStatus: 'pending' } } },
    memberships: { [staff ? 'brand-a__salon-a__owner' : 'brand-a__principal__owner']: member },
    publicProfiles: {}, auditEvents: {},
  };
  const snapshot = ref => ({ exists: !!state[ref.collection]?.[ref.id], data: () => state[ref.collection]?.[ref.id] });
  const db = {
    collection: name => ({ doc: (id = 'event') => { const ref = { collection: name, id }; return { ...ref, get: async () => snapshot(ref) }; } }),
    runTransaction: async callback => {
      const writes = [];
      const value = await callback({ getAll: async (...refs) => refs.map(snapshot),
        update: (ref, data) => writes.push(() => Object.assign(state[ref.collection][ref.id], data)),
        create: (ref, data) => writes.push(() => { state[ref.collection][ref.id] = data; }),
      });
      writes.forEach(write => write()); return value;
    },
  };
  return { state, db };
}
test('saves a private draft, preserves salon and publication, and refuses stale overwrites', async () => {
  assert.equal(typeof api.saveSalonServiceCatalog, 'function', 'Salon catalog saving is missing');
  const { state, db } = fixture();
  const result = await api.saveSalonServiceCatalog('owner', input, db);
  assert.deepEqual(result, { locationId: 'salon-a', revision: 1, currency: 'EUR', services });
  assert.deepEqual(state.salonLocations['salon-a'].serviceCatalogDraft.services, services);
  assert.equal(state.salonLocations['salon-a'].phone, 'unchanged');
  assert.deepEqual(state.salonLocations['salon-a'].publicProfile, { visible: false, approvalStatus: 'pending' });
  assert.deepEqual(state.publicProfiles, {});
  assert.equal(state.auditEvents.event.actorUid, 'owner');
  await assert.rejects(api.saveSalonServiceCatalog('owner', input, db), { code: 'aborted' });
  const changed = [{ ...services[0], priceMinor: 2250 }];
  await api.saveSalonServiceCatalog('owner', { ...input, expectedRevision: 1, services: changed }, db);
  assert.equal(state.salonLocations['salon-a'].serviceCatalogDraft.services[0].priceMinor, 2250);
});
test('allows an active salon admin with manageServices on this location', async () => {
  const { db } = fixture({ userId: 'owner', brandId: 'brand-a', locationId: 'salon-a', role: 'salon_admin', status: 'active', permissions: { manageServices: true } }, true);
  assert.equal((await api.saveSalonServiceCatalog('owner', input, db)).revision, 1);
});
for (const patch of [{userId:'someone'}, {brandId:'brand-b'}, {status:'revoked'}, {role:'worker'}, {locationId:'salon-b'}, {permissions:{manageServices:false}}]) {
  test(`denies wrong or revoked membership ${JSON.stringify(patch)}`, async () => {
    const { state, db } = fixture({ userId:'owner', brandId:'brand-a', locationId:'salon-a', role:'salon_admin', status:'active', permissions:{manageServices:true}, ...patch }, true);
    await assert.rejects(api.saveSalonServiceCatalog('owner', input, db), { code:'permission-denied' });
    assert.equal(state.salonLocations['salon-a'].serviceCatalogDraft, undefined);
  });
}
test('requires authentication', async () => {
  await assert.rejects(api.saveSalonServiceCatalog(null, input, fixture().db), { code:'unauthenticated' });
});
for (const patch of [{priceMinor:-1}, {priceMinor:20.5}, {priceMinor:NaN}, {durationMinutes:0}, {durationMinutes:1.5}, {durationMinutes:481}, {label:' '}, {id:'a/b'}, {visible:true}]) {
  test(`rejects invalid service ${JSON.stringify(patch)}`, async () => {
    await assert.rejects(api.saveSalonServiceCatalog('owner', {...input, services:[{...services[0],...patch}]}, fixture().db), {code:'invalid-argument'});
  });
}
test('rejects duplicate services and publication fields', async () => {
  await assert.rejects(api.saveSalonServiceCatalog('owner', {...input, services:[...services,...services]}, fixture().db), {code:'invalid-argument'});
  await assert.rejects(api.saveSalonServiceCatalog('owner', {...input, visible:true}, fixture().db), {code:'invalid-argument'});
});
