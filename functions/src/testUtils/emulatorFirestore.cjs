// Admin Firestore transport for local integration tests. Actual transactions,
// queries, conflicts and commits execute in the emulator; no cloud credentials.
const { randomUUID } = require('node:crypto');

module.exports = function emulatorFirestore() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8188') throw new Error('Local emulator required');
  const root = 'projects/demo-freelancer-booking-fixes/databases/(default)/documents';
  const base = `http://127.0.0.1:8188/v1/${root}`;
  const encode = value => typeof value === 'string' ? { stringValue: value }
    : typeof value === 'boolean' ? { booleanValue: value }
    : typeof value === 'number' ? { doubleValue: value }
    : value === null ? { nullValue: null }
    : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } }
    : { mapValue: { fields: fields(value) } };
  const fields = value => Object.fromEntries(Object.entries(value).map(([key, value]) => [key, encode(value)]));
  const decode = value => 'stringValue' in value ? value.stringValue
    : 'booleanValue' in value ? value.booleanValue
    : 'doubleValue' in value ? value.doubleValue
    : 'integerValue' in value ? Number(value.integerValue)
    : 'nullValue' in value ? null
    : 'arrayValue' in value ? (value.arrayValue.values ?? []).map(decode)
    : Object.fromEntries(Object.entries(value.mapValue?.fields ?? {}).map(([key, value]) => [key, decode(value)]));
  async function request(path, body, method = 'POST') {
    const response = await fetch(`${base}${path}`, { method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error?.message ?? 'Emulator request failed'), { code: result.error?.status });
    return result;
  }
  const snapshot = (document, id) => ({ id, exists: !!document,
    data: () => document ? decode({ mapValue: { fields: document.fields } }) : undefined });
  const collection = name => ({
    doc(id = randomUUID()) { const path = `${name}/${id}`; return { id, path,
      get: async () => {
        try { return snapshot(await request(`/${path}`, null, 'GET'), id); }
        catch (error) { if (error.code === 'NOT_FOUND') return snapshot(null, id); throw error; }
      },
      set: value => request(`/${path}`, { fields: fields(value) }, 'PATCH'),
    }; },
    where: (field, operator, value) => ({ name, field, operator, value }),
  });
  return { collection, async runTransaction(callback) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { transaction } = await request(':beginTransaction', {});
      const writes = [];
      const getAll = async (...refs) => {
        const result = await request(':batchGet', { documents: refs.map(ref => `${root}/${ref.path}`), transaction });
        return refs.map(ref => snapshot(result.find(row => row.found?.name === `${root}/${ref.path}`)?.found, ref.id));
      };
      try {
        const result = await callback({ getAll,
          get: async ref => ref.path ? (await getAll(ref))[0] : {
            docs: (await request(':runQuery', { transaction, structuredQuery: {
              from: [{ collectionId: ref.name }], where: { fieldFilter: {
                field: { fieldPath: ref.field }, op: 'EQUAL', value: encode(ref.value),
              } },
            } })).filter(row => row.document).map(row => snapshot(row.document, row.document.name.split('/').pop())),
          },
          create: (ref, value) => writes.push({ update: { name: `${root}/${ref.path}`, fields: fields(value) }, currentDocument: { exists: false } }),
          update: (ref, value) => writes.push({ update: { name: `${root}/${ref.path}`, fields: fields(value) }, updateMask: { fieldPaths: Object.keys(value) }, currentDocument: { exists: true } }),
        });
        await request(':commit', { transaction, writes });
        return result;
      } catch (error) {
        await request(':rollback', { transaction }).catch(() => {});
        if (error.code !== 'ABORTED' || attempt === 7) throw error;
      }
    }
  } };
};
