import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { requireMembership } from './authz';
import {
  assertTransition,
  isStoredBookingStatus,
  normalizeBookingStatus,
} from './bookingStatus';
import { bootstrapTenantOwnerFunction } from './bootstrapTenant';
import { assertTransitionTransactionState } from './bookingTransitionState';
import { verifyFirebaseIdToken } from './httpAuth';

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

export { requireMembership } from './authz';
export { assertTransition, BookingStatus, isBookingStatus } from './bookingStatus';
export { verifyFirebaseIdToken } from './httpAuth';
export const bootstrapTenantOwner = bootstrapTenantOwnerFunction;

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not defined.');
  }
  return new Stripe(key, { apiVersion: '2023-10-16' as any });
}

export const createCheckoutSessionHandler = async (
  req: functions.https.Request,
  res: functions.Response,
): Promise<void> => {
  // CORS configuration
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const decodedToken = await verifyFirebaseIdToken(req);
    if (!decodedToken) {
      res.status(401).send('Unauthorized');
      return;
    }

    const { tenantId, planId } = req.body;

    if (typeof tenantId !== 'string' || typeof planId !== 'string') {
      res.status(400).send('Bad Request: Missing tenantId or planId');
      return;
    }

    try {
      await requireMembership(decodedToken.uid, tenantId, 'manageBilling');
    } catch {
      res.status(403).send('Forbidden');
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
    const subdomain = tenantData?.subdomain;
    if (typeof subdomain !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(subdomain)) {
      res.status(409).send('Tenant has no valid subdomain');
      return;
    }

    const mainDomain = process.env.MAIN_DOMAIN?.trim();
    if (!mainDomain) {
      res.status(500).send('MAIN_DOMAIN environment variable is not defined');
      return;
    }

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
      success_url: `https://${subdomain}.${mainDomain}/billing?success=true`,
      cancel_url: `https://${subdomain}.${mainDomain}/billing`,
      metadata: { tenantId }
    });

    res.status(200).json({ url: session.url });
  } catch (error: any) {
    functions.logger.error('Error creating checkout session', error);
    res.status(500).send(error.message || 'Internal Server Error');
  }
};

export const createCheckoutSession = functions.https.onRequest(createCheckoutSessionHandler);

export const transitionBookingStatusHandler = async (
  req: functions.https.Request,
  res: functions.Response,
): Promise<void> => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const decodedToken = await verifyFirebaseIdToken(req);
  if (!decodedToken) {
    res.status(401).send('Unauthorized');
    return;
  }

  const bookingId = req.body?.bookingId;
  const nextStatus = req.body?.status;
  if (typeof bookingId !== 'string' || !isStoredBookingStatus(nextStatus)) {
    res.status(400).send('Invalid booking status request');
    return;
  }

  const bookingRef = db.collection('bookings').doc(bookingId);

  try {
    const initialSnapshot = await bookingRef.get();
    if (!initialSnapshot.exists) {
      res.status(404).send('Booking not found');
      return;
    }

    const initialData = initialSnapshot.data();
    const tenantId = initialData?.tenantId;
    const locationId = initialData?.locationId ?? tenantId;
    if (typeof tenantId !== 'string') {
      res.status(409).send('Booking has no tenant');
      return;
    }
    if (typeof locationId !== 'string') {
      res.status(409).send('Booking has no location');
      return;
    }

    let authorizedMembership;
    try {
      authorizedMembership = await requireMembership(decodedToken.uid, locationId, 'manageBookings');
    } catch {
      res.status(403).send('Forbidden');
      return;
    }

    const notificationId = await db.runTransaction(async transaction => {
      const membershipRef = db.collection('memberships').doc(authorizedMembership.id);
      const [snapshot, membershipSnapshot] = await Promise.all([
        transaction.get(bookingRef),
        transaction.get(membershipRef),
      ]);
      if (!snapshot.exists) {
        throw new Error('Booking not found');
      }

      const currentData = snapshot.data();
      const membership = membershipSnapshot.data();
      assertTransitionTransactionState(
        decodedToken.uid,
        tenantId,
        locationId,
        currentData,
        membershipSnapshot.exists ? membership : undefined,
      );

      const currentStatus = currentData?.status;
      if (!isStoredBookingStatus(currentStatus)) {
        throw new Error('Booking has an invalid current status');
      }
      assertTransition(
        normalizeBookingStatus(currentStatus),
        normalizeBookingStatus(nextStatus),
      );
      transaction.update(bookingRef, {
        status: nextStatus,
        statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        statusUpdatedBy: decodedToken.uid,
      });

      const normalizedNextStatus = normalizeBookingStatus(nextStatus);
      const recipientId = normalizedNextStatus === 'completed'
        ? currentData?.barberId
        : currentData?.clientId;
      if (
        typeof recipientId !== 'string'
        || !recipientId.trim()
        || !['confirmed', 'declined', 'completed'].includes(normalizedNextStatus)
      ) {
        return null;
      }

      const notificationRef = db.collection('notifications').doc();
      const date = typeof currentData?.date === 'string' ? currentData.date : '';
      const time = typeof currentData?.time === 'string' ? currentData.time : '';
      const delivery = normalizedNextStatus === 'confirmed'
        ? {
          type: 'APPROVED',
          title: 'Réservation confirmée',
          message: `Votre réservation est confirmée pour le ${date} à ${time}`,
          redirectUrl: '/client',
        }
        : normalizedNextStatus === 'declined'
          ? {
            type: 'REJECTED',
            title: 'Réservation annulée',
            message: `Votre réservation du ${date} à ${time} a été annulée`,
            redirectUrl: '/client',
          }
          : {
            type: 'COMPLETED',
            title: 'Service enregistré',
            message: 'Un service terminé a été ajouté à votre activité.',
            redirectUrl: '/barber/gains',
          };

      transaction.create(notificationRef, {
        ...delivery,
        serverIssued: true,
        tenantId,
        recipientId,
        reservationId: bookingId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return notificationRef.id;
    });

    res.status(200).json({
      bookingId,
      status: nextStatus,
      notificationIds: notificationId ? [notificationId] : [],
    });
  } catch (error) {
    functions.logger.warn('Booking transition rejected', error);
    const message = error instanceof Error ? error.message : 'Invalid booking transition';
    const status = message === 'Booking authorization changed during transition' ? 403 : 409;
    res.status(status).send(message);
  }
};

export const transitionBookingStatus = functions.https.onRequest(transitionBookingStatusHandler);

export const stripeWebhookHandler = async (
  req: functions.https.Request,
  res: functions.Response,
): Promise<void> => {
  const signatureValue = req.headers['stripe-signature'];
  const signature = Array.isArray(signatureValue) ? signatureValue[0] : signatureValue;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!webhookSecret || !stripeSecretKey) {
    functions.logger.error('Stripe webhook configuration is incomplete.');
    res.status(500).send('Webhook is not configured.');
    return;
  }

  if (!signature) {
    res.status(400).send('Stripe signature is required.');
    return;
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(req.rawBody, signature, webhookSecret);
  } catch (err: any) {
    functions.logger.error('Stripe webhook signature validation failed.', err);
    res.status(400).send(`Webhook Signature Error: ${err.message}`);
    return;
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
};

export const stripeWebhook = functions.https.onRequest(stripeWebhookHandler);
