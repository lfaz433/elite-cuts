function fakeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

function loadPushHandler(dependencies) {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const ts = require('typescript');
  const filename = resolve(__dirname, '..', 'api/send-push.ts');
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', output)(request => {
    if (request.includes('firebaseAdmin')) return dependencies.firebaseAdmin;
    if (request.includes('pushTarget')) return dependencies.pushTarget;
    return require(request);
  }, loaded, loaded.exports);
  return loaded.exports;
}

test('checkout handler rejects a request without Firebase authentication', async () => {
  const { createCheckoutSessionHandler } = require('../functions/lib/index.js');
  const response = fakeResponse();

  await createCheckoutSessionHandler({ method: 'POST', headers: {}, body: {} }, response);

  expect(response.statusCode).toBe(401);
  expect(response.body).toBe('Unauthorized');
});

test('booking payment handler rejects a request without Firebase authentication', async () => {
  const { recordBookingPaymentHandler } = require('../functions/lib/index.js');
  const response = fakeResponse();

  await recordBookingPaymentHandler({ method: 'POST', headers: {}, body: {} }, response);

  expect(response.statusCode).toBe(401);
  expect(response.body).toBe('Unauthorized');
});

test('booking creation handler rejects a request without Firebase authentication', async () => {
  const { createBookingHandler } = require('../functions/lib/index.js');
  const response = fakeResponse();

  await createBookingHandler({
    method: 'POST',
    headers: {},
    body: { tenantId: 'tenant-a', booking: {} },
  }, response);

  expect(response.statusCode).toBe(401);
  expect(response.body).toBe('Unauthorized');
});

test('booking status endpoint rejects standalone completion before any booking write', async () => {
  const { transitionBookingStatusHandler } = require('../functions/lib/index.js');
  const admin = require('../functions/node_modules/firebase-admin');
  const verify = jest.spyOn(admin.auth(), 'verifyIdToken').mockResolvedValue({ uid: 'manager-a' });
  const response = fakeResponse();

  try {
    await transitionBookingStatusHandler({
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
      body: { bookingId: 'booking-a', status: 'completed' },
    }, response);
  } finally {
    verify.mockRestore();
  }

  expect(response.statusCode).toBe(409);
  expect(response.body).toBe('Completion requires the atomic payment command');
});

test('atomic completion handler rejects a request without Firebase authentication', async () => {
  const { completeBookingPaymentHandler } = require('../functions/lib/index.js');
  const response = fakeResponse();

  await completeBookingPaymentHandler({ method: 'POST', headers: {}, body: {} }, response);

  expect(response.statusCode).toBe(401);
  expect(response.body).toBe('Unauthorized');
});

test('webhook handler fails closed when Stripe configuration is absent', async () => {
  const oldSecret = process.env.STRIPE_SECRET_KEY;
  const oldWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const { stripeWebhookHandler } = require('../functions/lib/index.js');
  const response = fakeResponse();
  const firebaseFunctions = require('../functions/node_modules/firebase-functions');
  const errorLog = jest.spyOn(firebaseFunctions.logger, 'error').mockImplementation(() => {});

  try {
    await stripeWebhookHandler({ headers: {}, rawBody: Buffer.from('{}') }, response);
  } finally {
    errorLog.mockRestore();
    if (oldSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = oldSecret;
    if (oldWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = oldWebhookSecret;
  }

  expect(response.statusCode).toBe(500);
  expect(response.body).toBe('Webhook is not configured.');
});

test('push endpoint rejects a replay before a second external delivery', async () => {
  let claimed = false;
  let fetchCalls = 0;
  const { sendPushHandler } = loadPushHandler({
    firebaseAdmin: {
      adminDb: {},
      verifyFirebaseIdToken: async () => ({ uid: 'manager-a' }),
      hasMembershipPermission: async () => true,
    },
    pushTarget: {
      claimPushTarget: async () => {
        if (claimed) throw new Error('Push target was already claimed');
        claimed = true;
        return {
          recipientId: 'recipient-a',
          title: 'Title',
          body: 'Body',
          redirectUrl: '/client',
        };
      },
      recordPushDelivery: async () => {},
    },
  });
  const oldFetch = global.fetch;
  const oldAppId = process.env.ONESIGNAL_APP_ID;
  const oldApiKey = process.env.ONESIGNAL_REST_API_KEY;
  process.env.ONESIGNAL_APP_ID = 'test-app';
  process.env.ONESIGNAL_REST_API_KEY = 'test-key';
  global.fetch = async () => {
    fetchCalls += 1;
    return { ok: true, json: async () => ({ id: 'delivery-a' }) };
  };
  const warningLog = jest.spyOn(console, 'warn').mockImplementation(() => {});

  try {
    const request = {
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: { tenantId: 'tenant-a', notificationId: 'notification-a' },
    };
    const first = fakeResponse();
    const second = fakeResponse();
    await sendPushHandler(request, first);
    await sendPushHandler(request, second);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    expect(fetchCalls).toBe(1);
  } finally {
    warningLog.mockRestore();
    global.fetch = oldFetch;
    if (oldAppId === undefined) delete process.env.ONESIGNAL_APP_ID;
    else process.env.ONESIGNAL_APP_ID = oldAppId;
    if (oldApiKey === undefined) delete process.env.ONESIGNAL_REST_API_KEY;
    else process.env.ONESIGNAL_REST_API_KEY = oldApiKey;
  }
});
