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

test('checkout handler rejects a request without Firebase authentication', async () => {
  const { createCheckoutSessionHandler } = require('../functions/lib/index.js');
  const response = fakeResponse();

  await createCheckoutSessionHandler({ method: 'POST', headers: {}, body: {} }, response);

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

  try {
    await stripeWebhookHandler({ headers: {}, rawBody: Buffer.from('{}') }, response);
  } finally {
    if (oldSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = oldSecret;
    if (oldWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = oldWebhookSecret;
  }

  expect(response.statusCode).toBe(500);
  expect(response.body).toBe('Webhook is not configured.');
});
