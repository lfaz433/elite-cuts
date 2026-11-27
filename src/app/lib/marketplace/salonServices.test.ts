import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSalonCatalog, serviceDraftPayload } from './salonServices';

test('reads persisted catalog and converts French prices to exact cents', () => {
  assert.deepEqual(parseSalonCatalog(undefined), { revision: 0, rows: [] });
  const draft = parseSalonCatalog({ revision: 3, currency: 'EUR', services: [{ id:'coupe', label:'Coupe', priceMinor:2250, durationMinutes:30 }] });
  assert.equal(draft.revision, 3);
  assert.equal(draft.rows[0].price, '22.50');
  assert.deepEqual(serviceDraftPayload([{...draft.rows[0], price:'22,75'}]), [{ id:'coupe', label:'Coupe', priceMinor:2275, durationMinutes:30 }]);
});
for (const price of ['', '-10', '20.555', 'abc', '1e2']) test(`rejects invalid price ${price}`, () => {
  assert.throws(() => serviceDraftPayload([{id:'cut',label:'Coupe',price,duration:'30'}]));
});
test('rejects incomplete rows and corrupt saved data rather than replacing it with empty values', () => {
  assert.throws(() => serviceDraftPayload([{id:'cut',label:'',price:'20',duration:'30'}]));
  assert.throws(() => serviceDraftPayload([{id:'cut',label:'Coupe',price:'20',duration:'0'}]));
  assert.throws(() => parseSalonCatalog({revision:2,services:'broken'}));
});
