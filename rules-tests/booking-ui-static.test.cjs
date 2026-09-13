const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');

function bookingStatusCalls(relativePath) {
  const filename = resolve(__dirname, '..', relativePath);
  const source = readFileSync(filename, 'utf8');
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls = [];
  function visit(node) {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'updateBookingStatus'
    ) calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return calls;
}

test.each([
  'src/app/components/pages/AdminDashboard.tsx',
  'src/app/components/pages/BarberDashboard.tsx',
])('%s awaits every booking status mutation before reporting UI success', relativePath => {
  const calls = bookingStatusCalls(relativePath);
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(ts.isAwaitExpression(call.parent)).toBe(true);
  }
});

test('anonymous booking UI persists a safe draft and resumes through an authenticated route', () => {
  const bookingModal = readFileSync(resolve(
    __dirname, '..', 'src/app/components/modals/BookingModal.tsx',
  ), 'utf8');
  const app = readFileSync(resolve(__dirname, '..', 'src/app/App.tsx'), 'utf8');
  const landing = readFileSync(resolve(
    __dirname, '..', 'src/app/components/pages/LandingPage.tsx',
  ), 'utf8');

  expect(bookingModal).toContain('saveBookingDraft');
  expect(bookingModal).toContain('loadBookingDraft');
  expect(bookingModal).toContain("loginPathForProtectedRoute('/book')");
  expect(app).toMatch(/path="book"[^\n]+AuthRequired[^\n]+LandingPage/);
  expect(landing).toContain("route.pathname === '/book'");
});

test('location settings expose the server-enforced manual or automatic booking policy', () => {
  const admin = readFileSync(resolve(
    __dirname, '..', 'src/app/components/pages/AdminDashboard.tsx',
  ), 'utf8');
  expect(admin).toContain('settings-booking-policy');
  expect(admin).toContain("value=\"automatic\"");
  expect(admin).toContain("value=\"manual\"");
});
