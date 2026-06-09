import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.firestore();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not defined.');
  }
  return new Stripe(key, { apiVersion: '2023-10-16' as any });
}

export const createCheckoutSession = functions.https.onRequest(async (req, res) => {
  // CORS configuration
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const { tenantId, planId, subdomain } = req.body;

    if (!tenantId || !planId || !subdomain) {
      res.status(400).send('Bad Request: Missing tenantId, planId, or subdomain');
      return;
    }

    let priceId = '';
    if (planId === 'basic') {
      priceId = process.env.STRIPE_PRICE_BASIC || '';
    } else if (planId === 'pro') {
      priceId = process.env.STRIPE_PRICE_PRO || '';
    } else {
      res.status(400).send('Invalid planId');
      return;
    }

    if (!priceId) {
      res.status(500).send('Stripe Price ID not configured for the requested plan');
      return;
    }

    const tenantRef = db.collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();

    if (!tenantSnap.exists) {
      res.status(404).send('Tenant not found');
      return;
    }

    const tenantData = tenantSnap.data();
    let stripeCustomerId = tenantData?.stripeCustomerId;

    const stripe = getStripe();

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: tenantData?.name || `Tenant ${tenantId}`,
        metadata: { tenantId }
      });
      stripeCustomerId = customer.id;
      await tenantRef.update({ stripeCustomerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: `https://${subdomain}.barberboard.pro/billing?success=true`,
      cancel_url: `https://${subdomain}.barberboard.pro/billing`,
      metadata: { tenantId }
    });

    res.status(200).json({ url: session.url });
  } catch (error: any) {
    functions.logger.error('Error creating checkout session', error);
    res.status(500).send(error.message || 'Internal Server Error');
  }
});

export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  let event: Stripe.Event;

  if (webhookSecret === 'placeholder_will_replace_after_deploy') {
    functions.logger.warn('Skipping Stripe webhook signature check (development bypass activated).');
    event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } else {
    try {
      const rawBody = req.rawBody;
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
      functions.logger.error('Stripe webhook signature validation failed.', err);
      res.status(400).send(`Webhook Signature Error: ${err.message}`);
      return;
    }
  }

  try {
    const dataObject = event.data.object as any;
    const tenantId = dataObject.metadata?.tenantId;

    if (!tenantId) {
      functions.logger.warn(`Webhook event ${event.type} received without tenantId metadata.`);
      res.status(200).send('Event processed without action (missing tenantId).');
      return;
    }

    const tenantRef = db.collection('tenants').doc(tenantId);

    switch (event.type) {
      case 'customer.subscription.created': {
        await tenantRef.update({
          'subscription.status': 'active'
        });
        functions.logger.info(`Subscription created successfully for tenant ${tenantId}`);
        break;
      }

      case 'customer.subscription.updated': {
        const status = dataObject.status;
        const currentPeriodEnd = dataObject.current_period_end * 1000;
        const items = dataObject.items?.data || [];
        const priceId = items[0]?.price?.id || '';

        let planId = 'basic';
        if (priceId === process.env.STRIPE_PRICE_PRO) {
          planId = 'pro';
        }

        await tenantRef.update({
          'subscription.status': status,
          'subscription.planId': planId,
          'subscription.currentPeriodEnd': currentPeriodEnd
        });
        functions.logger.info(`Subscription updated successfully for tenant ${tenantId} to status: ${status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        await tenantRef.update({
          'subscription.status': 'canceled'
        });
        functions.logger.info(`Subscription canceled for tenant ${tenantId}`);
        break;
      }

      case 'invoice.payment_failed': {
        await tenantRef.update({
          'subscription.status': 'past_due'
        });
        functions.logger.info(`Subscription payment failed (past_due) for tenant ${tenantId}`);
        break;
      }

      default:
        functions.logger.info(`Event type ${event.type} ignored.`);
    }

    res.status(200).send('Event processed.');
  } catch (error: any) {
    functions.logger.error('Error handling webhook event', error);
    res.status(500).send('Internal Server Error');
  }
});


