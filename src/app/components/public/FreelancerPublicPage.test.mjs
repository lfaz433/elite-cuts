import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from '../../../../functions/node_modules/typescript/lib/typescript.js';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const uuid = 'f7256c73-e0bd-4a27-9a6e-3b218caaebde';
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  return {
    id: 'freelancer__ada', publicSlug: 'ada-cuts', displayName: 'Ada Cuts', cityId: 'fr-paris',
    bio: 'Des finitions soignées.', serviceSummary: 'Coupes et barbe à Paris.',
    profileImageUrl: 'https://example.test/portrait.jpg', portfolioUrls: ['https://example.test/approved.jpg'],
    services: [{ id: 'cut', label: 'Coupe classique', priceMinor: 2500, durationMinutes: 30 }],
    workModes: { home: true, chair: true },
    workplace: { name: 'Studio Paris', line1: '8 rue du Salon', postalCode: '75003', city: 'Paris' },
    socialLinks: { instagram: 'https://instagram.com/ada', whatsapp: '+33612345678' },
    travelFeeMinor: 500, cancellationWindowHours: 24, reviewSummary: { count: 0, average: null, reviews: [] },
    slots: [{ value: '2099-09-05T10:00', appointmentMode: 'chair' }, { value: '2099-09-05T11:00', appointmentMode: 'home' }],
  };
}

function hooks() {
  const cells = []; let cursor = 0; let effects = [];
  const api = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
      return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
    useId: () => 'guest-test',
    useEffect(callback, deps) {
      const index = cursor++; const previous = cells[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        effects.push(() => { previous?.cleanup?.(); cells[index] = { deps, cleanup: callback() }; });
      }
    },
  };
  return {
    api, cells,
    render(Component, props) { cursor = 0; return Component(props); },
    effects() { const pending = effects; effects = []; pending.forEach(run => run()); },
  };
}

function load(relative, options = {}, cache = new Map()) {
  const filename = resolve(import.meta.dirname, relative);
  if (!existsSync(filename)) return {};
  if (cache.has(filename)) return cache.get(filename);
  const module = { exports: {} }; cache.set(filename, module.exports);
  const source = readFileSync(filename, 'utf8').replaceAll('import.meta.env', '{}');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }, fileName: filename }).outputText;
  const isApp = filename.endsWith('/app/App.tsx');
  new Function('require', 'module', 'exports', output + (isApp ? '\nexports.testRoutes = AppRoutes; exports.testContent = AppContent;' : ''))(request => {
    if (request === 'react') return options.react ?? React;
    if (request === 'react-router') return { useNavigate: () => options.navigate ?? (() => {}), useParams: () => ({ publicSlug: options.slug ?? 'ada-cuts', bookingId: options.bookingId ?? 'booking-1' }), useLocation: () => ({ pathname: '/b/ada-cuts' }), Route: 'route', Routes: 'routes', Navigate: 'redirect' };
    if (isApp && request.startsWith('.')) return new Proxy({}, { get: (_target, key) => key === 'default' ? request : () => ({}) });
    if (request.endsWith('/guestBookingSession')) return { ensureGuestBookingSession: options.session ?? (async () => 'anon') };
    if (request.endsWith('/bookings')) return {
      requestPublicFreelancerBooking: options.submit ?? (async () => ({ bookingId: 'booking-1', status: 'pending_approval' })),
      bookingStatusLabel: status => status,
      getBookingAddress: options.address ?? (async () => { throw new Error('No home address'); }),
      cancelBooking: options.cancel ?? (async () => {}), getGuestFreelancerBooking: options.followup ?? (async () => { throw new Error('Missing session'); }),
    };
    if (request === 'sonner') return { toast: { success() {}, error() {} } };
    if (request === 'firebase/functions') return { httpsCallable: (_functions, name) => async input => ({ data: await (options.callable ?? (() => fixture()))(name, input) }) };
    if (request.endsWith('/firebase')) return { functions: {} };
    if (request.startsWith('.')) {
      const path = resolve(dirname(filename), request);
      return load(existsSync(path) ? path : existsSync(`${path}.tsx`) ? `${path}.tsx` : `${path}.ts`, options, cache);
    }
    return require(request);
  }, module, module.exports);
  return module.exports;
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
const field = (tree, name) => nodes(tree).find(node => node.props?.name === name);
const submitButton = tree => nodes(tree).find(node => node.type === 'button' && node.props.type === 'submit');
const markup = tree => renderToStaticMarkup(tree);
function formHarness(page = fixture(), options = {}) {
  const state = hooks();
  const Form = load('./GuestFreelancerBookingForm.tsx', { ...options, react: state.api }).default;
  assert.equal(typeof Form, 'function', 'the guest booking form must exist');
  const render = () => state.render(Form, { page });
  const change = (name, value) => {
    const control = field(render(), name); assert.ok(control, `missing field ${name}`);
    control.props.onChange({ target: { value } });
  };
  const submit = () => nodes(render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const contact = () => { change('clientName', 'Ada Client'); change('clientEmail', 'client@example.com'); change('clientPhone', '+33612345678'); };
  return { render, change, submit, contact, state };
}

test('renders only published fields, approved portfolio and no account or payment controls', () => {
  const { FreelancerPublicView } = load('./FreelancerPublicPage.tsx');
  assert.equal(typeof FreelancerPublicView, 'function');
  const page = { ...fixture(), clientEmail: 'client@example.com', homeAddress: { line1: '12 rue des Fleurs' },
    portfolioItems: [{ imageUrl: 'https://example.test/pending.jpg' }], latitude: 48.123456 };
  const html = markup(React.createElement(FreelancerPublicView, { page }));
  for (const text of ['Ada Cuts', 'Paris', 'Coupes et barbe', 'Coupe classique', '25,00', '30 min', '24', 'À domicile', 'Au fauteuil', 'approved.jpg', 'portrait.jpg']) assert.ok(html.includes(text), text);
  assert.match(html, /Nouveau sur Barberboard/);
  assert.match(html, /href="#reservation"/);
  assert.match(html, /id="reservation"/);
  assert.match(html, /href="https:\/\/wa.me\/33612345678"/);
  assert.doesNotMatch(html, /12 rue des Fleurs|client@example.com|pending.jpg|48.123456|\/register|\/client|favori|paiement|Stripe|anonymous|anonyme/i);
});

test('renders genuine review counts and escaped text without inventing a rating for new profiles', () => {
  const { FreelancerPublicView } = load('./FreelancerPublicPage.tsx');
  assert.equal(typeof FreelancerPublicView, 'function');
  const page = fixture(); page.reviewSummary = { count: 2, average: 4.5, reviews: [{ authorName: 'Lina D.', rating: 5, text: '<script>private()</script>', createdAtMs: 1700000000000 }] };
  const html = markup(React.createElement(FreelancerPublicView, { page }));
  assert.match(html, /4,5/); assert.match(html, /2 avis/); assert.match(html, /Lina D\./);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>|Nouveau sur Barberboard/);
  page.reviewSummary = { count: 0, average: null, reviews: [] };
  const empty = markup(React.createElement(FreelancerPublicView, { page }));
  assert.doesNotMatch(empty, /0\s*\/\s*5|5\s*\/\s*5/);
});

test('address field selection is limited to home appointments', () => {
  const { bookingFieldsFor } = load('../../lib/marketplace/publicFreelancer.ts');
  assert.equal(typeof bookingFieldsFor, 'function');
  assert.deepEqual(bookingFieldsFor('chair'), ['clientName', 'clientEmail', 'clientPhone']);
  assert.deepEqual(bookingFieldsFor('home'), ['clientName', 'clientEmail', 'clientPhone', 'approximateArea', 'homeAddress']);
});
test('selected mode shows service, travel and total before submit', () => {
  const form = formHarness();
  assert.match(markup(form.render()), /Total[^]*25,00/);
  form.change('appointmentMode', 'home');
  assert.match(markup(form.render()), /Déplacement[^]*5,00/);
  assert.match(markup(form.render()), /Total[^]*30,00/);
  form.change('appointmentMode', 'chair');
  assert.doesNotMatch(markup(form.render()), /30,00/);
});
test('confirmation links to a refreshable account-free follow-up', async () => {
  const navigation = []; const form = formHarness(fixture(), { navigate: (...args) => navigation.push(args) }); form.contact(); form.change('slot', '2099-09-05T10:00'); await form.submit();
  assert.match(markup(form.render()), /href="\/b\/reservations\/booking-1"/);
  assert.match(markup(form.render()), /Suivre ma réservation/);
  assert.deepEqual(navigation, [['/b/reservations/booking-1', { replace: true }]]);
});
test('client chair card shows the commercial snapshot and never loads a private address', async () => {
  let requests = 0; const state = hooks();
  const Card = load('../booking/BookingStatusCard.tsx', { react: state.api, address: async () => { requests++; return { line1: 'private', city: 'Paris' }; } }).BookingStatusCard;
  const booking = { id: 'chair', source: 'marketplace', ownerType: 'freelancer', appointmentMode: 'chair', status: 'confirmed', serviceId: 'cut', date: '2099-09-05', time: '11:00', workplaceSnapshot: fixture().workplace };
  const html = markup(state.render(Card, { booking })); state.effects(); await flush();
  assert.match(html, /En salon/); assert.match(html, /Studio Paris/); assert.match(html, /8 rue du Salon/); assert.match(html, /75003/);
  assert.doesNotMatch(html, /À domicile/); assert.equal(requests, 0);
  state.render(Card, { booking: { ...booking, id: 'home', appointmentMode: 'home' } }); state.effects(); await flush();
  assert.equal(requests, 1);
});

test('guest follow-up loads the URL reference, refreshes status, cancels and presents review state without signup', async () => {
  const state = hooks(); const calls = []; const booking = {
    id: 'booking-1', source: 'marketplace', clientId: 'anon', ownerType: 'freelancer', appointmentMode: 'chair', guestBooking: true,
    serviceId: 'cut', date: '2099-09-05', time: '11:00', status: 'pending_approval', workplaceSnapshot: fixture().workplace,
  };
  let response = { booking, canCancel: true, reviewState: 'ineligible' };
  const Page = load('./GuestBookingFollowUpPage.tsx', { react: state.api,
    followup: async id => { calls.push(id); return response; },
    cancel: async id => { assert.equal(id, 'booking-1'); response = { ...response, booking: { ...booking, status: 'cancelled' }, canCancel: false }; },
  }).default;
  assert.equal(typeof Page, 'function');
  const render = () => state.render(Page, {});
  render(); state.effects(); await flush();
  assert.deepEqual(calls, ['booking-1']);
  let tree = render(); assert.match(markup(tree), /Votre réservation/); assert.doesNotMatch(markup(tree), /register|signup|Créer un compte/);
  await nodes(tree).find(node => node.type === 'button' && node.props.children === 'Annuler ma réservation').props.onClick();
  render(); state.effects(); await flush(); tree = render();
  assert.match(markup(tree), /cancelled/);
  assert.equal(nodes(tree).some(node => node.props.children === 'Annuler ma réservation'), false);
  response = { booking: { ...booking, status: 'completed' }, canCancel: false, reviewState: 'eligible' };
  await nodes(tree).find(node => node.type === 'button' && node.props.children === 'Actualiser le statut').props.onClick();
  render(); state.effects(); await flush(); tree = render();
  assert.ok(nodes(tree).some(node => typeof node.type === 'function' && node.type.name === 'BookingReviewForm'));
  response = { ...response, reviewState: 'reviewed' };
  await nodes(tree).find(node => node.props.children === 'Actualiser le statut').props.onClick(); render(); state.effects(); await flush();
  assert.match(markup(render()), /avis.*enregistré/i);
});
test('follow-up error exposes no booking and offers retry in the original browser', async () => {
  const state = hooks(); const Page = load('./GuestBookingFollowUpPage.tsx', { react: state.api, followup: async () => { throw new Error('private@example.test'); } }).default;
  assert.equal(typeof Page, 'function'); state.render(Page, {}); state.effects(); await flush();
  const html = markup(state.render(Page, {})); assert.match(html, /navigateur|session/i); assert.match(html, /Réessayer/);
  assert.doesNotMatch(html, /private@example|<form/);
});

test('mode changes show matching slots and discard exact and approximate home details from state', () => {
  const form = formHarness();
  assert.equal(field(form.render(), 'homeAddress.line1'), undefined);
  assert.equal(field(form.render(), 'approximateArea'), undefined);
  assert.match(markup(form.render()), /2099-09-05T10:00/);
  assert.doesNotMatch(markup(form.render()), /2099-09-05T11:00/);
  form.change('appointmentMode', 'home');
  form.change('approximateArea', 'Paris 11e'); form.change('homeAddress.line1', '12 rue des Fleurs');
  form.change('homeAddress.city', 'Paris'); form.change('homeAddress.postalCode', '75011');
  form.change('slot', '2099-09-05T11:00');
  assert.match(markup(form.render()), /12 rue des Fleurs/);
  assert.doesNotMatch(markup(form.render()), /2099-09-05T10:00/);
  form.change('appointmentMode', 'chair');
  assert.equal(field(form.render(), 'slot').props.value, '');
  assert.doesNotMatch(JSON.stringify(form.state.cells), /12 rue des Fleurs|Paris 11e|75011|homeAddress|approximateArea/);
  assert.equal(field(form.render(), 'homeAddress.line1'), undefined);
  form.change('appointmentMode', 'home');
  assert.equal(field(form.render(), 'homeAddress.line1').props.value, '');
});

test('disabled modes and no available slots cannot be submitted', async () => {
  let calls = 0; const page = fixture(); page.workModes = { home: false, chair: true }; page.slots = [];
  const form = formHarness(page, { session: async () => { calls++; } });
  assert.equal(nodes(field(form.render(), 'appointmentMode')).some(node => node.props.value === 'home'), false);
  assert.equal(submitButton(form.render()).props.disabled, true);
  assert.match(markup(form.render()), /Aucun créneau/);
  await form.submit(); assert.equal(calls, 0);
});

test('chair submission creates its session first, blocks duplicate submits and sends no home data', async () => {
  const events = []; let finish; let uuidCalls = 0;
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID() { events.push('uuid'); uuidCalls++; return uuid; } } });
  try {
    const form = formHarness(fixture(), {
      session: async () => { events.push('session'); return 'anon'; },
      submit: input => { events.push(input); return new Promise(resolve => { finish = resolve; }); },
    });
    form.contact(); form.change('slot', '2099-09-05T10:00');
    const first = form.submit(); const duplicate = form.submit(); await flush();
    assert.equal(submitButton(form.render()).props.disabled, true);
    assert.equal(nodes(form.render()).find(node => node.type === 'fieldset').props.disabled, true);
    assert.deepEqual(events, ['session', 'uuid', { publicSlug: 'ada-cuts', serviceId: 'cut', appointmentMode: 'chair', date: '2099-09-05', time: '10:00', clientName: 'Ada Client', clientEmail: 'client@example.com', clientPhone: '+33612345678', clientRequestId: uuid }]);
    assert.equal(uuidCalls, 1);
    finish({ bookingId: 'booking-1', status: 'pending_approval' }); await Promise.all([first, duplicate]);
    assert.match(markup(form.render()), /Demande envoyée/);
    assert.match(markup(form.render()), /confirmation/i);
    assert.equal(submitButton(form.render()), undefined);
  } finally { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original }); }
});

test('home submission includes only the collected home details and preserves UUID on an unchanged retry', async () => {
  const calls = []; const form = formHarness(fixture(), { submit: async input => {
    calls.push(input); if (calls.length === 1) throw Object.assign(new Error('offline'), { code: 'functions/unavailable' });
    return { bookingId: 'booking-1', status: 'pending_approval' };
  } });
  form.contact(); form.change('appointmentMode', 'home'); form.change('slot', '2099-09-05T11:00');
  form.change('approximateArea', 'Paris 11e'); form.change('homeAddress.line1', '12 rue des Fleurs');
  form.change('homeAddress.city', 'Paris'); form.change('homeAddress.postalCode', '75011');
  await form.submit();
  assert.equal(submitButton(form.render()).props.disabled, false);
  assert.match(markup(form.render()), /réessayer/i);
  await form.submit();
  assert.equal(calls.length, 2); assert.equal(calls[1].clientRequestId, calls[0].clientRequestId);
  assert.deepEqual(calls[0], { publicSlug: 'ada-cuts', serviceId: 'cut', appointmentMode: 'home', date: '2099-09-05', time: '11:00', clientName: 'Ada Client', clientEmail: 'client@example.com', clientPhone: '+33612345678', approximateArea: 'Paris 11e', homeAddress: { line1: '12 rue des Fleurs', city: 'Paris', postalCode: '75011' }, clientRequestId: calls[0].clientRequestId });
  assert.match(calls[0].clientRequestId, /^[0-9a-f-]{36}$/);
});

for (const [code, message, expected] of [
  ['functions/failed-precondition', 'Firebase App Check is required', /vérification de sécurité/i],
  ['functions/failed-precondition', 'This App Check token was already consumed', /vérification de sécurité/i],
  ['functions/unauthenticated', 'Unauthenticated', /vérification de sécurité/i],
  ['appCheck/fetch-network-error', 'network', /vérification de sécurité/i],
  ['functions/failed-precondition', 'This time is no longer available', /créneau.*plus disponible/i],
  ['functions/failed-precondition', 'This appointment time has passed', /créneau.*plus disponible/i],
  ['functions/not-found', 'This professional is not available for booking', /profil.*plus disponible/i],
  ['functions/failed-precondition', 'Professional booking details are unavailable', /profil.*plus disponible/i],
  ['functions/internal', 'Private upstream details', /réessayer/i],
]) {
  test(`shows safe French feedback for ${code}: ${message}`, async () => {
    const form = formHarness(fixture(), { submit: async () => { throw Object.assign(new Error(message), { code }); } });
    form.contact(); form.change('slot', '2099-09-05T10:00'); await form.submit();
    const alert = nodes(form.render()).find(node => node.props.role === 'alert');
    assert.ok(alert); assert.match(markup(alert), expected); assert.doesNotMatch(markup(alert), /Private upstream details|Firebase/);
  });
}

test('invalid contact data or mode-mismatched slots do not open a session', async () => {
  let calls = 0; const form = formHarness(fixture(), { session: async () => { calls++; return 'anon'; } });
  form.change('slot', '2099-09-05T10:00'); await form.submit();
  form.contact(); form.change('clientEmail', 'bad-email'); await form.submit();
  form.change('clientEmail', 'client@example.com'); form.change('slot', '2099-09-05T11:00'); await form.submit();
  assert.equal(calls, 0);
});

test('page loading uses the safe callable and never shows an old profile after slug navigation', async () => {
  const state = hooks(); const requests = [];
  const options = { react: state.api, slug: 'ada-cuts', callable: (name, input) => new Promise(resolve => requests.push({ name, input, resolve })) };
  const Page = load('./FreelancerPublicPage.tsx', options).default;
  assert.equal(typeof Page, 'function');
  const render = () => state.render(Page, {});
  assert.match(markup(render()), /Chargement/); state.effects();
  assert.equal(requests[0].name, 'getPublicFreelancerPageBySlug'); assert.deepEqual(requests[0].input, { slug: 'ada-cuts' });
  options.slug = 'next-profile';
  assert.match(markup(render()), /Chargement/); state.effects();
  requests[0].resolve(fixture()); await flush();
  assert.match(markup(render()), /Chargement/);
  requests[1].resolve({ ...fixture(), publicSlug: 'next-profile', displayName: 'Next Profile' }); await flush();
  const loaded = render(); assert.equal(loaded.props.page.displayName, 'Next Profile');
});

test('unpublished, missing, or unsafe profiles never render the booking form', async () => {
  for (const result of [Object.assign(new Error('not found'), { code: 'functions/not-found' }), { ...fixture(), clientEmail: 'private@example.com' }]) {
    const state = hooks();
    const Page = load('./FreelancerPublicPage.tsx', { react: state.api, callable: async () => { if (result instanceof Error) throw result; return result; } }).default;
    assert.equal(typeof Page, 'function');
    state.render(Page, {}); state.effects(); await flush();
    const html = markup(state.render(Page, {}));
    assert.match(html, /indisponible|impossible/i); assert.doesNotMatch(html, /<form|Ada Cuts|private@example.com/);
  }
});

test('registers the lazy public bio route inside PublicLayout without an authentication or business wrapper', () => {
  const app = load('../../App.tsx');
  const tree = app.testRoutes();
  const parent = nodes(tree).find(node => node.props.path === '/');
  const route = nodes(parent).find(node => node.props.path === 'b/:publicSlug');
  assert.ok(route, '/b/:publicSlug must be a public child route');
  assert.equal(parent.props.element.type, './components/layouts/PublicLayout');
  assert.equal(route.props.element.type.$$typeof, Symbol.for('react.lazy'));
  const followup = nodes(parent).find(node => node.props.path === 'b/reservations/:bookingId');
  assert.ok(followup); assert.equal(followup.props.element.type.$$typeof, Symbol.for('react.lazy'));
  assert.equal(app.testContent().type, 'div');
});
