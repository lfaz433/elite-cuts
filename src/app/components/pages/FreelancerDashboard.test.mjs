import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from '../../../../functions/node_modules/typescript/lib/typescript.js';
const require = createRequire(import.meta.url);
let state = []; let cursor = 0;
let pathname = '/freelancer/overview';
let effectQueue = null;
let firestoreApi = {};
let callableHandlers = {};

function load(relativePath, base = import.meta.dirname) {
  const filename = resolve(base, relativePath);
  let source;
  try { source = readFileSync(filename, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename.endsWith('.mjs') ? filename.replace(/\.mjs$/, '.ts') : filename,
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    request => {
      if (request === 'react') return {
        useState: initial => { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
        useId: () => 'test-field', useEffect: callback => { effectQueue?.push(callback); }, useRef: value => ({ current: value }), useMemo: callback => callback(),
      };
      if (request === 'lucide-react') return new Proxy({}, { get: (_target, name) => name });
      if (request === 'react-router') return { Link: 'a', NavLink: 'a', Navigate: 'redirect', useLocation: () => ({ hash: '', pathname }) };
      if (request.endsWith('/context/AuthContext')) return { useAuth: () => ({ user: { uid: 'ada', displayName: 'Ada' }, logout() {} }) };
      if (request === 'firebase/firestore') return firestoreApi;
      if (request === 'firebase/functions') return { httpsCallable: (_functions, name) => async input => ({ data: callableHandlers[name] ? await callableHandlers[name](input) : [] }) };
      if (request.endsWith('/firebase')) return { db: {}, functions: {} };
      if (request.endsWith('/marketplace/bookings')) return {};
      if (request.endsWith('/jobs/JobBoard')) return { default: () => null };
      if (request === 'qrcode.react') return { QRCodeSVG: 'svg' };
      if (request === 'sonner') return { toast: { success() {}, error() {} } };
      if (request.endsWith('/referrals/ReferralCard')) return { default: () => null };
      if (request.startsWith('.')) {
        const file = resolve(dirname(filename), request);
        return load(existsSync(file) ? file : existsSync(`${file}.tsx`) ? `${file}.tsx` : `${file}.ts`);
      }
      return require(request);
    }, module, module.exports,
  );
  return module.exports;
}

const routes = load('../freelancer/workspace/freelancerWorkspaceRoutes.ts');
const helpers = load('../freelancer/workspace/freelancerWorkspacePresentation.ts');
const records = load('../../lib/marketplace/freelancerRecords.ts');

test('accepts the seven approved workspace routes only', () => {
  assert.equal(typeof routes.resolveFreelancerWorkspaceView, 'function');
  for (const view of ['overview', 'calendar', 'bookings', 'services', 'marketing', 'analytics', 'settings']) {
    assert.equal(routes.resolveFreelancerWorkspaceView(`/freelancer/${view}`), view);
  }
  for (const path of ['/freelancer', '/freelancer/not-a-view', '/freelancer/calendar/nested', '/freelancer/calendar/']) {
    assert.equal(routes.resolveFreelancerWorkspaceView(path), 'overview');
    assert.equal(routes.freelancerWorkspaceRedirect(path), '/freelancer/overview');
  }
  assert.equal(routes.freelancerWorkspaceRedirect('/freelancer/calendar'), null);
});

test('labels the amount as forecast, never collected revenue', () => {
  assert.equal(typeof helpers.renderForecastCopy, 'function');
  assert.match(helpers.renderForecastCopy(4200), /Prévision de CA/);
  assert.match(helpers.renderForecastCopy(4200), /42,00/);
  assert.doesNotMatch(helpers.renderForecastCopy(4200), /encaissé/i);
});

test('only exposes a published slug on the current origin', () => {
  assert.equal(typeof helpers.publicFreelancerUrl, 'function');
  assert.equal(helpers.publicFreelancerUrl('https://preview.example', { visible: true, identity: { publicSlug: 'ada-cuts' } }), 'https://preview.example/b/ada-cuts');
  assert.equal(helpers.publicFreelancerUrl('https://preview.example', { visible: false, identity: { publicSlug: 'ada-cuts' } }), null);
  assert.equal(helpers.publicFreelancerUrl('https://preview.example', { visible: true, identity: { publicSlug: '' } }), null);
});

test('hides cached home addresses before acceptance and displays the chair workplace', () => {
  assert.equal(typeof helpers.bookingLocation, 'function');
  const address = { line1: '99 private road', postalCode: '75001', city: 'Paris' };
  assert.equal(helpers.bookingLocation({ appointmentMode: 'home', status: 'pending_approval', approximateArea: 'Paris 11e' }, address), 'Zone approximative : Paris 11e');
  assert.match(helpers.bookingLocation({ appointmentMode: 'home', status: 'confirmed' }, address), /99 private road/);
  assert.equal(helpers.bookingLocation({ appointmentMode: 'chair', status: 'confirmed', workplaceSnapshot: { name: 'Atelier', line1: '1 rue du salon', postalCode: '75002', city: 'Paris' } }, address), 'Atelier · 1 rue du salon, 75002 Paris');
});

test('validates hidden drafts, publication slug, HTTPS links and WhatsApp with field errors', () => {
  assert.equal(typeof helpers.validateProfileIdentity, 'function');
  const draft = { visible: false, identity: { publicSlug: '', socialLinks: {} } };
  assert.deepEqual(helpers.validateProfileIdentity(draft), {});
  assert.equal(helpers.validateProfileIdentity({ ...draft, visible: true }).publicSlug, 'Choisissez un identifiant public de 3 à 64 caractères (lettres, chiffres et tirets).');
  assert.ok(helpers.validateProfileIdentity({ ...draft, identity: { publicSlug: 'ada-cuts', profileImageUrl: 'http://example.test/photo.jpg', socialLinks: { instagram: 'https://evil.test', whatsapp: '0612345678' } } }).profileImageUrl);
  assert.ok(helpers.validateProfileIdentity({ ...draft, identity: { publicSlug: '', socialLinks: { whatsapp: '0612345678' } } }).whatsapp);
  assert.deepEqual(helpers.validateProfileIdentity({ ...draft, identity: { publicSlug: 'ada-cuts', socialLinks: { instagram: 'https://instagram.com/ada', whatsapp: '+33612345678' } } }), {});
});

test('reloads a saved hidden draft with an empty slug but rejects a visible one', () => {
  const input = { uid: 'ada', ...records.emptyFreelancerProfile('Ada') };
  assert.ok(records.parseFreelancerProfile('ada', input));
  assert.equal(records.parseFreelancerProfile('ada', { ...input, visible: true }), null);
});

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
function render(component, props) { state = []; cursor = 0; return component(props); }
test('confirmed owner booking card offers completion and sends the selected booking id', () => {
  const Card = load('../freelancer/workspace/BookingCard.tsx').default;
  const calls = []; const booking = { id: 'request-a', appointmentMode: 'chair', status: 'confirmed', serviceId: 'cut', date: '2099-09-05', time: '11:00', clientName: 'Ada' };
  const props = { booking, onComplete: id => calls.push(id) };
  const button = nodes(render(Card, props)).find(node => node.type === 'button' && node.props.children === 'Marquer comme terminé');
  assert.ok(button); button.props.onClick(); assert.deepEqual(calls, ['request-a']);
  assert.equal(nodes(render(Card, { ...props, booking: { ...booking, status: 'pending_approval' } })).some(node => node.props.children === 'Marquer comme terminé'), false);
});

test('mobile Plus exposes the four remaining views and desktop navigation has seven entries', () => {
  const Shell = load('../freelancer/workspace/FreelancerShell.tsx').default;
  assert.equal(typeof Shell, 'function');
  const props = { view: 'overview', profile: records.emptyFreelancerProfile('Ada'), publicUrl: null, onLogout() {}, children: 'Content' };
  let tree = render(Shell, props);
  const desktop = nodes(tree).find(node => node.props?.['aria-label'] === 'Navigation principale');
  assert.equal(nodes(desktop).filter(node => node.props?.to?.startsWith('/freelancer/')).length, 7);
  const more = nodes(tree).find(node => node.props?.['aria-controls'] === 'freelancer-more');
  assert.equal(more.props['aria-expanded'], false);
  more.props.onClick(); cursor = 0; tree = Shell(props);
  assert.deepEqual(nodes(nodes(tree).find(node => node.props?.id === 'freelancer-more')).filter(node => node.props?.to).map(node => node.props.to), ['/freelancer/services', '/freelancer/marketing', '/freelancer/analytics', '/freelancer/settings']);
});

test('groups navigation around daily work, growth and account without changing its routes', () => {
  const Shell = load('../freelancer/workspace/FreelancerShell.tsx').default;
  const props = { view: 'overview', profile: records.emptyFreelancerProfile('Ada'), publicUrl: null, onLogout() {}, children: 'Content' };
  const tree = render(Shell, props);
  const groups = nodes(tree).filter(node => node.type === 'section' && typeof node.props?.['aria-label'] === 'string' && node.props['aria-label'].startsWith('Navigation :'));
  assert.deepEqual(groups.map(group => group.props['aria-label']), [
    'Navigation : Gérer mon activité',
    'Navigation : Développer mon activité',
    'Navigation : Compte',
  ]);
  const desktop = nodes(tree).find(node => node.props?.['aria-label'] === 'Navigation principale');
  assert.deepEqual(nodes(desktop).filter(node => node.props?.to?.startsWith('/freelancer/')).map(node => [node.props.to, node.props.children.at(-1)]), [
    ['/freelancer/overview', 'Accueil'],
    ['/freelancer/calendar', 'Planning'],
    ['/freelancer/bookings', 'Réservations'],
    ['/freelancer/services', 'Services & tarifs'],
    ['/freelancer/marketing', 'Ma vitrine'],
    ['/freelancer/analytics', 'Statistiques'],
    ['/freelancer/settings', 'Paramètres'],
  ]);
});

test('profile fields expose matching accessible errors and preserve the WhatsApp contract', () => {
  const Profile = load('../freelancer/ProfileSettings.tsx').default;
  let changed;
  const tree = render(Profile, { value: records.emptyFreelancerProfile('Ada'), onChange: value => { changed = value; }, errors: { publicSlug: 'Identifiant déjà utilisé.' } });
  const slug = nodes(tree).find(node => node.props?.name === 'publicSlug');
  assert.ok(slug);
  assert.equal(slug.props['aria-invalid'], true);
  assert.equal(nodes(tree).find(node => node.props?.id === slug.props['aria-describedby']).props.children, 'Identifiant déjà utilisé.');
  nodes(tree).find(node => node.props?.name === 'whatsapp').props.onChange({ currentTarget: { value: '+33612345678' } });
  assert.equal(changed.identity.socialLinks.whatsapp, '+33612345678');
});

test('service durations offer only the approved choices and are included in edits', () => {
  const Catalog = load('../freelancer/ServiceCatalog.tsx').default;
  let changed;
  const profile = { ...records.emptyFreelancerProfile('Ada'), serviceIds: ['cut'], servicePricesMinor: { cut: 2500 }, serviceDurationMinutes: { cut: 30 } };
  const tree = render(Catalog, { value: profile, onChange: value => { changed = value; } });
  const duration = nodes(tree).find(node => node.props?.['aria-label'] === 'Durée de Cut');
  assert.ok(duration);
  assert.deepEqual(nodes(duration).filter(node => node.type === 'option').map(node => node.props.value), [15, 30, 45, 60, 75, 90, 120]);
  duration.props.onChange({ currentTarget: { value: '45' } });
  assert.equal(changed.serviceDurationMinutes.cut, 45);
});

test('calendar combines bookings and available slots chronologically without double counting occupied slots', () => {
  assert.equal(typeof helpers.calendarEntries, 'function');
  const profile = { ...records.emptyFreelancerProfile('Ada'), workModes: { home: true, chair: true }, availabilityByMode: { home: ['2099-01-02T10:00', '2099-01-02T11:00'], chair: ['2099-01-01T09:00'] } };
  const booking = { id: 'one', date: '2099-01-02', time: '10:00', status: 'confirmed', appointmentMode: 'home' };
  assert.deepEqual(helpers.calendarEntries(profile, [booking], 'all').map(item => [item.slot, item.kind]), [['2099-01-01T09:00', 'available'], ['2099-01-02T10:00', 'booking'], ['2099-01-02T11:00', 'available']]);
  assert.equal(helpers.calendarEntries(profile, [booking], 'chair').length, 1);
});
test('calendar hides overlapping available starts across modes using the booking duration snapshot', () => {
  const profile = { ...records.emptyFreelancerProfile('Ada'), workModes: { home: true, chair: true },
    serviceDurationMinutes: { cut: 15 }, availabilityByMode: { home: ['2099-01-02T11:30', '2099-01-02T11:45'], chair: ['2099-01-02T11:00'] } };
  const booking = { appointmentMode: 'chair', date: '2099-01-02', time: '11:00', durationMinutes: 45, status: 'confirmed' };
  assert.deepEqual(helpers.calendarEntries(profile, [booking], 'home').map(entry => entry.slot), ['2099-01-02T11:45']);
});

test('availability edits retain per-mode slots and synchronize the legacy home field', () => {
  const Travel = load('../freelancer/TravelSettings.tsx').default;
  let changed;
  const profile = { ...records.emptyFreelancerProfile('Ada'), workModes: { home: true, chair: true }, availabilityByMode: { home: [], chair: ['2099-01-02T10:00'] } };
  const tree = render(Travel, { value: profile, onChange: value => { changed = value; } });
  const home = nodes(tree).find(node => node.props?.id === 'availability-home');
  assert.ok(home);
  home.props.onChange({ currentTarget: { value: '2099-01-01T09:00\n2099-01-01T10:00' } });
  assert.deepEqual(changed.availability, ['2099-01-01T09:00', '2099-01-01T10:00']);
  assert.deepEqual(changed.availabilityByMode.chair, ['2099-01-02T10:00']);
});

test('marketing renders a QR for the published URL and immutable review statuses', () => {
  const Marketing = load('../freelancer/workspace/FreelancerMarketingView.tsx').default;
  assert.equal(typeof Marketing, 'function');
  const props = { profile: records.emptyFreelancerProfile('Ada'), publicUrl: 'https://preview.example/b/ada-cuts', portfolio: [], reviews: [{ reviewId: 'one', bookingId: 'one', rating: 5, authorName: 'Léa M.', createdAtMs: 1, status: 'pending', text: 'Super' }], onCreatePortfolio: async () => {}, onDeletePortfolio: async () => {}, onRetryReviews: () => {} };
  const tree = render(Marketing, props);
  assert.equal(nodes(tree).find(node => node.type === 'svg').props.value, props.publicUrl);
  const reviewSection = nodes(tree).find(node => node.props?.['aria-label'] === 'Avis clients');
  assert.ok(reviewSection);
  assert.equal(nodes(reviewSection).filter(node => node.type === 'button').length, 0);
  assert.ok(nodes(reviewSection).some(node => node.props?.children === 'En attente de modération'));
  const hidden = render(Marketing, { ...props, publicUrl: null });
  assert.equal(nodes(hidden).some(node => node.type === 'svg'), false);
});

test('dashboard replaces the browser location for root and unknown children and selects one approved view', () => {
  const Dashboard = load('./FreelancerDashboard.tsx').default;
  for (const path of ['/freelancer', '/freelancer/not-a-view', '/freelancer/bookings/nested']) {
    pathname = path; const tree = render(Dashboard, {});
    assert.equal(tree.type, 'redirect');
    assert.equal(tree.props.to, '/freelancer/overview');
    assert.equal(tree.props.replace, true);
  }
  for (const view of ['overview', 'calendar', 'bookings', 'services', 'marketing', 'analytics', 'settings']) {
    pathname = `/freelancer/${view}`;
    assert.equal(render(Dashboard, {}).props.view, view);
  }
});

test('adding and deleting a service keeps its duration map consistent with the catalogue', () => {
  const Catalog = load('../freelancer/ServiceCatalog.tsx').default;
  let changed;
  const props = { value: records.emptyFreelancerProfile('Ada'), onChange: value => { changed = value; } };
  const tree = render(Catalog, props);
  nodes(tree).find(node => node.props?.['aria-label'] === 'Nom du nouveau service').props.onChange({ currentTarget: { value: 'Coupe test' } });
  cursor = 0;
  nodes(Catalog(props)).find(node => node.type === 'button' && String(node.props.className).includes('bg-[#D4AF37]')).props.onClick();
  assert.deepEqual(changed.serviceDurationMinutes, { 'coupe-test': 30 });
  const edited = render(Catalog, { ...props, value: changed });
  nodes(edited).find(node => node.props?.['aria-label'] === 'Supprimer Coupe test').props.onClick();
  assert.deepEqual(changed.serviceIds, []);
  assert.deepEqual(changed.serviceDurationMinutes, {});
});

test('portfolio failure retains input and exposes a retryable error', async () => {
  const Portfolio = load('../freelancer/PortfolioManager.tsx').default;
  const props = { items: [], onCreate: async () => { throw new Error('unavailable'); }, onDelete: async () => {}, secondaryActions: true };
  let tree = render(Portfolio, props);
  nodes(tree).find(node => node.props?.['aria-label'] === 'URL HTTPS de l’image').props.onChange({ currentTarget: { value: 'https://example.test/a.jpg' } });
  cursor = 0; tree = Portfolio(props);
  await nodes(tree).find(node => node.type === 'button').props.onClick();
  await new Promise(resolve => setTimeout(resolve, 0));
  cursor = 0; tree = Portfolio(props);
  assert.ok(nodes(tree).some(node => node.props?.role === 'alert'));
  assert.equal(nodes(tree).find(node => node.props?.['aria-label'] === 'URL HTTPS de l’image').props.value, 'https://example.test/a.jpg');
});

test('booking mode and status filters apply, and the primary action opens the next pending request', () => {
  const Bookings = load('../freelancer/workspace/FreelancerBookingsView.tsx').default;
  const booking = { id: 'home', date: '2099-01-01', time: '10:00', appointmentMode: 'home', status: 'confirmed' };
  const props = { bookings: [booking, { ...booking, id: 'chair', appointmentMode: 'chair', status: 'pending_approval' }, { ...booking, id: 'later', date: '2099-01-02', status: 'pending_approval' }], addresses: {}, busyId: null, onAnswer() {} };
  let tree = render(Bookings, props);
  nodes(tree).filter(node => node.type === 'select')[0].props.onChange({ currentTarget: { value: 'chair' } });
  cursor = 0; tree = Bookings(props);
  assert.deepEqual(nodes(tree).filter(node => node.props?.booking).map(node => node.props.booking.id), ['chair']);
  nodes(tree).find(node => node.props?.action).props.action.props.onClick();
  cursor = 0; tree = Bookings(props);
  assert.deepEqual(nodes(tree).filter(node => node.props?.booking).map(node => node.props.booking.id), ['chair', 'later']);
  assert.equal(nodes(tree).filter(node => node.type === 'select')[1].props.value, 'pending_approval');
});

test('analytics period selector recomputes forecast and uniquely counted clients', () => {
  const Analytics = load('../freelancer/workspace/FreelancerAnalyticsView.tsx').default;
  const booking = { id: 'one', date: '2099-01-02', time: '10:00', appointmentMode: 'home', status: 'confirmed', totalPriceMinor: 4200, clientId: 'one', serviceId: 'cut' };
  const props = { bookings: [booking, { ...booking, id: 'two', date: '2099-01-20', totalPriceMinor: 1000 }], now: new Date('2099-01-01T00:00') };
  let tree = render(Analytics, props);
  assert.match(nodes(tree).find(node => node.props?.label === 'Prévision de CA').props.value, /42,00/);
  const action = nodes(tree).find(node => node.props?.action).props.action;
  nodes(action).find(node => node.type === 'select').props.onChange({ currentTarget: { value: '30d' } });
  cursor = 0; tree = Analytics(props);
  assert.match(nodes(tree).find(node => node.props?.label === 'Prévision de CA').props.value, /52,00/);
  assert.equal(nodes(tree).find(node => node.props?.label === 'Clients uniques').props.value, 1);
});

test('booking card never renders a cached private address for an unaccepted home request', () => {
  const Card = load('../freelancer/workspace/BookingCard.tsx').default;
  const booking = { id: 'one', clientName: 'Ada', serviceId: 'cut', date: '2099-01-02', time: '10:00', appointmentMode: 'home', status: 'pending_approval', approximateArea: 'Paris 11e' };
  const tree = render(Card, { booking, address: { line1: '99 private road', city: 'Paris' } });
  const text = nodes(tree).flatMap(node => [node.props.children].flat(Infinity)).filter(value => typeof value === 'string').join(' ');
  assert.match(text, /Zone approximative : Paris 11e/);
  assert.doesNotMatch(text, /99 private road/);
});

for (const mode of ['home', 'chair']) test(`${mode} availability preserves Enter and every character of a second slot until blur`, () => {
  const Travel = load('../freelancer/TravelSettings.tsx').default;
  let profile = { ...records.emptyFreelancerProfile('Ada'), workModes: { home: true, chair: true }, availabilityByMode: { home: [], chair: [], [mode]: ['2099-01-01T09:00'] } };
  const props = () => ({ value: profile, onChange: next => { profile = next; } });
  let tree = render(Travel, props());
  let expected = '2099-01-01T09:00';
  for (const character of '\n2099-01-02T10:00') {
    const input = nodes(tree).find(node => node.props?.id === `availability-${mode}`);
    input.props.onChange({ currentTarget: { value: input.props.value + character } });
    expected += character;
    cursor = 0; tree = Travel(props());
    assert.equal(nodes(tree).find(node => node.props?.id === `availability-${mode}`).props.value, expected);
  }
  const input = nodes(tree).find(node => node.props?.id === `availability-${mode}`);
  input.props.onBlur({ currentTarget: { value: `${expected}\n\n2099-01-01T09:00\n` } });
  assert.deepEqual(profile.availabilityByMode[mode], ['2099-01-01T09:00', '2099-01-02T10:00']);
  assert.deepEqual(profile.availability, profile.availabilityByMode.home);
});

test('a first visible draft stays unpublished and unavailable until its save succeeds, including after failure', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const cleanups = [];
  try {
    globalThis.window = { location: { origin: 'https://preview.example' }, setInterval: () => 1, clearInterval() {} };
    globalThis.document = { getElementById: () => null };
    firestoreApi = {
      collection: (...args) => args, doc: (...args) => args, query: (...args) => args, where: (...args) => args,
      getDoc: async () => ({ exists: () => false }), getDocs: async () => ({ docs: [] }),
      onSnapshot: (_query, callback) => { callback({ docs: [] }); return () => {}; },
    };
    const Dashboard = load('./FreelancerDashboard.tsx').default;
    pathname = '/freelancer/settings';
    const container = render(Dashboard, {});
    effectQueue = [];
    render(container.type, container.props);
    const initialEffects = effectQueue; effectQueue = null;
    for (const effect of initialEffects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
    const flush = () => new Promise(resolve => setImmediate(resolve));
    await flush();
    const rerender = view => { cursor = 0; return container.type({ ...container.props, view }); };
    const settings = tree => nodes(tree).find(node => node.type?.name === 'FreelancerSettingsView');
    const draft = {
      ...records.emptyFreelancerProfile('Ada'), visible: true, identity: { publicSlug: 'ada-cuts', socialLinks: {} },
      serviceSummary: 'Coupe', serviceIds: ['cut'], servicePricesMinor: { cut: 2500 }, serviceDurationMinutes: { cut: 30 },
      availabilityByMode: { home: ['2099-01-05T10:00', '', '2099-01-05T10:00'], chair: [] },
    };
    settings(rerender('settings')).props.onChange(draft);
    const assertUnpublished = () => {
      const overviewTree = rerender('overview');
      assert.equal(overviewTree.props.publicUrl, null);
      const onboarding = nodes(overviewTree).find(node => node.type?.name === 'FreelancerOnboardingView');
      assert.ok(onboarding);
      const text = nodes(onboarding.type(onboarding.props)).flatMap(node => [node.props.children].flat(Infinity)).filter(value => typeof value === 'string').join(' ');
      assert.match(text, /Aucun client ni rendez-vous n’est créé automatiquement/);
      assert.doesNotMatch(text, /Votre profil est visible|Partager mon activité/);
      const calendar = nodes(rerender('calendar')).find(node => node.type?.name === 'FreelancerCalendarView');
      assert.deepEqual(helpers.calendarEntries(calendar.props.profile, [], 'all'), []);
      assert.equal(settings(rerender('settings')).props.profile.visible, true);
    };
    assertUnpublished();
    callableHandlers.saveFreelancerProfile = async () => { throw new Error('offline'); };
    settings(rerender('settings')).props.onSave(); await flush();
    assertUnpublished();
    let finishSave; let payload;
    callableHandlers.saveFreelancerProfile = input => { payload = input; return new Promise(resolve => { finishSave = resolve; }); };
    settings(rerender('settings')).props.onSave();
    assertUnpublished();
    finishSave({ uid: 'ada' }); await flush();
    assert.deepEqual(payload.availabilityByMode.home, ['2099-01-05T10:00']);
    assert.deepEqual(payload.availability, ['2099-01-05T10:00']);
    const savedTree = rerender('overview');
    assert.equal(savedTree.props.publicUrl, 'https://preview.example/b/ada-cuts');
    assert.equal(savedTree.props.profile.visible, true);
    assert.ok(nodes(savedTree).some(node => node.type?.name === 'FreelancerOverviewView'));
    const calendar = nodes(rerender('calendar')).find(node => node.type?.name === 'FreelancerCalendarView');
    assert.deepEqual(helpers.calendarEntries(calendar.props.profile, [], 'all').map(entry => entry.slot), ['2099-01-05T10:00']);
  } finally {
    cleanups.forEach(cleanup => cleanup());
    effectQueue = null; firestoreApi = {}; callableHandlers = {};
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
});
