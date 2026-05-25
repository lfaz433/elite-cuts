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


// ─── Demo Reset (runs every 24h) ───────────────────────────────────────────
const DEMO_TENANT_ID = 'barberboard-demo';

async function deleteCollection(collectionPath: string, tenantId: string) {
  const snap = await db.collection(collectionPath)
    .where('tenantId', '==', tenantId)
    .get();
  const batchSize = snap.size;
  if (batchSize === 0) return;
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  functions.logger.info(`Deleted ${batchSize} docs from ${collectionPath}`);
}

async function reseedDemo() {
  functions.logger.info('🔄 Resetting demo data...');

  // Delete old data
  for (const col of ['barbers', 'services', 'bookings', 'sales', 'expenses']) {
    await deleteCollection(col, DEMO_TENANT_ID);
  }

  const getDateOffset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };
  const TODAY = new Date().toISOString().split('T')[0];

  // Seed barbers
  const barberRefs: string[] = [];
  const barbersData = [
    { name: 'Karim B.', specialty: 'Spécialiste Dégradé', status: 'available', commission: 50, email: 'demo-barber@barberboard.pro' },
    { name: 'Yassine M.', specialty: 'Expert Barbe & Rasage', status: 'available', commission: 55 },
    { name: 'Marcus J.', specialty: 'Coloriste & Styling', status: 'available', commission: 60 },
  ];
  for (const b of barbersData) {
    const ref = await db.collection('barbers').add({ ...b, tenantId: DEMO_TENANT_ID, image: '', createdAt: Date.now() });
    barberRefs.push(ref.id);
  }

  // Seed services
  const serviceRefs: string[] = [];
  const servicesData = [
    { name: 'Coupe Classique', price: '25', duration: '30 min' },
    { name: 'Dégradé Américain', price: '35', duration: '45 min' },
    { name: 'Barbe & Rasage', price: '20', duration: '30 min' },
    { name: 'Coupe + Barbe', price: '50', duration: '60 min' },
    { name: 'Coloration', price: '65', duration: '90 min' },
  ];
  for (const s of servicesData) {
    const ref = await db.collection('services').add({ ...s, tenantId: DEMO_TENANT_ID, image: '', createdAt: Date.now() });
    serviceRefs.push(ref.id);
  }

  // Seed bookings
  const clients = ['Ahmed D.', 'Thomas R.', 'Lucas M.', 'Bilal S.', 'Maxime L.', 'Noah B.', 'Amine K.', 'Kevin P.', 'Jordan T.', 'Clément V.', 'Samir A.', 'Romain C.', 'Dylan F.', 'Yanis H.', 'Jérémy N.'];
  const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30'];
  type BookingSpec = { client: string; date: string; time: string; status: string; pricePaid?: number; barberIdx: number; serviceIdx: number };
  const bookingSpecs: BookingSpec[] = [
    { client: clients[0], date: TODAY, time: times[0], status: 'pending', barberIdx: 0, serviceIdx: 0 },
    { client: clients[1], date: TODAY, time: times[2], status: 'pending', barberIdx: 1, serviceIdx: 2 },
    { client: clients[2], date: TODAY, time: times[4], status: 'pending', barberIdx: 2, serviceIdx: 1 },
    { client: clients[3], date: getDateOffset(1), time: times[6], status: 'pending', barberIdx: 0, serviceIdx: 3 },
    { client: clients[4], date: getDateOffset(1), time: times[8], status: 'pending', barberIdx: 1, serviceIdx: 4 },
    { client: clients[5], date: getDateOffset(2), time: times[1], status: 'approved', barberIdx: 2, serviceIdx: 0 },
    { client: clients[6], date: getDateOffset(2), time: times[3], status: 'approved', barberIdx: 0, serviceIdx: 2 },
    { client: clients[7], date: getDateOffset(3), time: times[5], status: 'approved', barberIdx: 1, serviceIdx: 1 },
    { client: clients[8], date: getDateOffset(3), time: times[7], status: 'approved', barberIdx: 2, serviceIdx: 3 },
    { client: clients[9], date: getDateOffset(4), time: times[9], status: 'approved', barberIdx: 0, serviceIdx: 4 },
    { client: clients[10], date: getDateOffset(-2), time: times[0], status: 'completed', pricePaid: 25, barberIdx: 1, serviceIdx: 0 },
    { client: clients[11], date: getDateOffset(-3), time: times[1], status: 'completed', pricePaid: 35, barberIdx: 2, serviceIdx: 1 },
    { client: clients[12], date: getDateOffset(-4), time: times[2], status: 'completed', pricePaid: 20, barberIdx: 0, serviceIdx: 2 },
    { client: clients[13], date: getDateOffset(-5), time: times[3], status: 'completed', pricePaid: 50, barberIdx: 1, serviceIdx: 3 },
    { client: clients[14], date: getDateOffset(-6), time: times[4], status: 'completed', pricePaid: 65, barberIdx: 2, serviceIdx: 4 },
  ];
  for (const b of bookingSpecs) {
    await db.collection('bookings').add({
      tenantId: DEMO_TENANT_ID,
      clientName: b.client,
      clientEmail: `${b.client.toLowerCase().replace(/[^a-z]/g, '')}@demo.com`,
      clientPhone: `0600000000`,
      clientId: '',
      barberId: barberRefs[b.barberIdx],
      serviceId: serviceRefs[b.serviceIdx],
      date: b.date,
      time: b.time,
      status: b.status,
      pricePaid: b.pricePaid || 0,
      paymentMethod: 'cash',
      paymentStatus: b.status === 'completed' ? 'paid' : 'pending',
      notes: '',
      createdAt: Date.now(),
      unreadAdmin: b.status === 'pending',
      unreadBarber: b.status === 'pending',
    });
  }

  // Seed sales
  const salesAmounts = [95, 120, 75, 155, 85, 110, 95, 65];
  const salesDays = [-1, -3, -5, -8, -10, -14, -18, -22];
  for (let i = 0; i < salesAmounts.length; i++) {
    await db.collection('sales').add({
      tenantId: DEMO_TENANT_ID,
      barberId: barberRefs[i % 3],
      serviceId: serviceRefs[i % 5],
      amount: salesAmounts[i],
      date: getDateOffset(salesDays[i]),
      paymentMethod: i % 2 === 0 ? 'cash' : 'card',
      createdAt: Date.now(),
    });
  }

  // Seed expenses
  const expenses = [
    { description: 'Produits capillaires', amount: 45, category: 'Matériel', date: getDateOffset(-5) },
    { description: 'Loyer', amount: 800, category: 'Facture', date: getDateOffset(-10) },
    { description: 'Fournitures', amount: 30, category: 'Achat', date: getDateOffset(-15) },
  ];
  for (const e of expenses) {
    await db.collection('expenses').add({ ...e, tenantId: DEMO_TENANT_ID, createdAt: Date.now() });
  }

  functions.logger.info('✅ Demo data reset complete');
}

// HTTP endpoint to manually trigger reset (callable via curl or admin panel)
export const resetDemoDataHttp = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  const secret = req.headers['x-reset-secret'] || req.query.secret;
  if (secret !== 'barberboard-demo-reset-2026') {
    res.status(401).send('Unauthorized');
    return;
  }
  try {
    await reseedDemo();
    res.status(200).json({ ok: true, message: 'Demo data reset complete' });
  } catch (err: any) {
    functions.logger.error('Error resetting demo data', err);
    res.status(500).send(err.message);
  }
});

// Scheduled: every 24 hours at midnight UTC
export const resetDemoDataScheduled = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('UTC')
  .onRun(async (_context) => {
    await reseedDemo();
    return null;
  });
