// @ts-nocheck -- Execute TSX with controlled hook state and the real JSX runtime.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from '../../../../functions/node_modules/typescript/lib/typescript.js';
const require = createRequire(import.meta.url);
let state = []; let cursor = 0; let calls = []; let response;
const callableOptions = new Map();
const sourceCache = new Map();
function loadSource(filename = resolve(import.meta.dirname, 'BookingReviewForm.tsx')) {
  if (sourceCache.has(filename)) return sourceCache.get(filename).exports;
  if (!existsSync(filename)) return {};
  const loaded = { exports: {} };
  sourceCache.set(filename, loaded);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText;
  new Function('require', 'module', 'exports', code)(request => {
    if (request === 'react') return {
      useId: () => 'review',
      useRef: initial => { const index = cursor++; state[index] ??= { current: initial }; return state[index]; },
      useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = value; }]; },
    };
    if (request === 'firebase/functions') return { httpsCallable: (_functions, name, options) => async input => {
      callableOptions.set(name, options);
      calls.push([name, input]); if (response instanceof Error) throw response; return { data: await response };
    } };
    if (request.endsWith('/firebase')) return { functions: {} };
    if (request === '../booking/BookingStatusCard') return { BookingStatusCard: () => null };
    if (request === 'lucide-react') return { History: () => null };
    if (request.startsWith('.')) {
      const base = resolve(dirname(filename), request);
      return loadSource(existsSync(`${base}.tsx`) ? `${base}.tsx` : `${base}.ts`);
    }
    return require(request);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const { BookingReviewForm } = loadSource();
const { BookingHistory } = loadSource(resolve(import.meta.dirname, 'BookingHistory.tsx'));
const eligible = { id: 'booking-a', source: 'marketplace', ownerType: 'freelancer', ownerId: 'freelancer-a', clientId: 'client-a', status: 'completed' };
function reset() { state = []; calls = []; response = { reviewId: 'booking-a', status: 'approved' }; }
function render(booking = eligible, callerUid = 'client-a') { cursor = 0; return BookingReviewForm({ booking, callerUid }); }
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}

for (const [name, patch, uid] of [
  ['eligible', {}, 'client-a'], ['salon', { ownerType: 'salon' }, 'client-a'],
  ['legacy', { source: 'legacy' }, 'client-a'], ['pending', { status: 'pending_approval' }, 'client-a'],
  ['confirmed', { status: 'confirmed' }, 'client-a'], ['cancelled', { status: 'cancelled' }, 'client-a'],
  ['another client', {}, 'client-b'], ['signed out', {}, undefined],
]) test(`history review form eligibility: ${name}`, () => {
  assert.equal(typeof BookingReviewForm, 'function'); reset();
  const booking = { ...eligible, ...patch };
  const history = BookingHistory({ bookings: [booking], callerUid: uid });
  const controls = nodes(history).filter(node => node.type === BookingReviewForm);
  assert.equal(controls.length, name === 'eligible' ? 1 : 0);
  if (name === 'eligible') {
    assert.equal(controls[0].props.callerUid, 'client-a');
    assert.equal(nodes(render(booking, uid)).filter(node => node.type === 'input' && node.props.type === 'radio').length, 5);
  } else { cursor = 0; assert.equal(BookingReviewForm({ booking, callerUid: uid }), null); }
});

test('submits the selected stars and optional bounded text then replaces the form with confirmation', async () => {
  assert.equal(typeof BookingReviewForm, 'function'); reset();
  let tree = render();
  const radios = nodes(tree).filter(node => node.type === 'input' && node.props.type === 'radio');
  assert.deepStrictEqual(radios.map(node => Number(node.props.value)), [1, 2, 3, 4, 5]);
  assert.equal(new Set(radios.map(node => node.props.name)).size, 1);
  radios[3].props.onChange({ target: { value: '4' } });
  const text = nodes(tree).find(node => node.type === 'textarea');
  assert.equal(text.props.maxLength, 500);
  text.props.onChange({ target: { value: 'Super' } });
  tree = render();
  await tree.props.onSubmit({ preventDefault() {} });
  assert.deepStrictEqual(calls, [['submitFreelancerReview', { bookingId: 'booking-a', rating: 4, text: 'Super' }]]);
  assert.deepStrictEqual(callableOptions.get('submitFreelancerReview'), { limitedUseAppCheckTokens: true });
  tree = render();
  assert.equal(nodes(tree).some(node => node.type === 'form'), false);
  assert.equal(tree.props.role, 'status');
});

test('blocks duplicate in-flight submissions and confirms an already-existing immutable review', async () => {
  assert.equal(typeof BookingReviewForm, 'function'); reset();
  let tree = render(); nodes(tree).find(node => node.type === 'input').props.onChange({ target: { value: '5' } });
  let finish; response = new Promise(resolve => { finish = resolve; });
  tree = render();
  const first = tree.props.onSubmit({ preventDefault() {} });
  const second = tree.props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  finish({ reviewId: 'booking-a', status: 'approved' }); await Promise.all([first, second]);
  reset(); response = Object.assign(new Error('duplicate'), { code: 'functions/already-exists' });
  tree = render(); nodes(tree).find(node => node.type === 'input').props.onChange({ target: { value: '5' } });
  await render().props.onSubmit({ preventDefault() {} });
  assert.equal(render().props.role, 'status');
});

test('service failures retain the form and show a retryable error', async () => {
  assert.equal(typeof BookingReviewForm, 'function'); reset(); response = new Error('unavailable');
  let tree = render(); nodes(tree).find(node => node.type === 'input').props.onChange({ target: { value: '3' } });
  await render().props.onSubmit({ preventDefault() {} });
  tree = render();
  assert.equal(tree.type, 'form');
  assert.ok(nodes(tree).some(node => node.props?.role === 'alert'));
  assert.equal(nodes(tree).find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, false);
});
