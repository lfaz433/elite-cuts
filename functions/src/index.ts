import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { requireMembership } from './authz';
import { createBooking } from './bookingCreate';
import { completeBookingAndRecordPayment, recordBookingPayment } from './bookingPayment';
import {
  assertStandaloneTransition,
  assertTransition,
  isStoredBookingStatus,
  normalizeBookingStatus,
} from './bookingStatus';
import { bootstrapTenantOwnerFunction } from './bootstrapTenant';
import { assertTransitionTransactionState } from './bookingTransitionState';
import { verifyFirebaseIdToken } from './httpAuth';
import { resolvePushRecipient } from './pushRecipient';
import {
  bootstrapBrandOwnerFunction,
  createSalonLocationFunction,
  updateMembershipPermissionsFunction,
} from './memberships';
import { createWorkerInvitationFunction, respondToInvitationFunction } from './invitations';
import { updateBusinessInfoFunction } from './businessInfo';
import {
  getPublicProfileFunction,
  listPublicCitiesFunction,
  listPublicProfilesFunction,
  syncFreelancerPublicProfile,
  syncSalonPublicProfile,
} from './publicProfiles';
import {
  cancelBookingFunction,
  getBookingAddressFunction,
  listSalonBookingWorkspaceFunction,
  processCompletedBookingReferralFunction,
  requestBookingFunction,
  respondToBookingFunction,
  saveSalonAvailabilityFunction,
} from './bookings';
import {
  createFreelancerPortfolioItemFunction,
  deleteFreelancerPortfolioItemFunction,
  saveFreelancerProfileFunction,
  syncFreelancerPortfolio,
} from './freelancers';
import {
  applyToJobFunction,
  createJobPostFunction,
  listCityJobsFunction,
  listSalonHiringWorkspaceFunction,
  reviewJobApplicationFunction,
} from './jobs';
import { createConfirmedDepositFunction } from './deposits';
import { listClientCampaignsFunction } from './campaigns';
import {
  attributeReferralFunction,
  createMyReferralCodeFunction,
  createReferralProgramFunction,
  getReferralMarketingOverviewFunction,
  getMyReferralWorkspaceFunction,
  getPublicReferralCodeFunction,
  reviewReferralRewardFunction,
} from './referrals';

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

export { requireMembership } from './authz';
export { assertTransition, BookingStatus, isBookingStatus } from './bookingStatus';
export { verifyFirebaseIdToken } from './httpAuth';
export const bootstrapTenantOwner = bootstrapTenantOwnerFunction;
export const bootstrapBrandOwner = bootstrapBrandOwnerFunction;
export const createSalonLocation = createSalonLocationFunction;
export const updateMembershipPermissions = updateMembershipPermissionsFunction;
export const createWorkerInvitation = createWorkerInvitationFunction;
export const respondToInvitation = respondToInvitationFunction;
export const updateBusinessInfo = updateBusinessInfoFunction;
export { syncSalonPublicProfile, syncFreelancerPublicProfile };
export const listPublicCities = listPublicCitiesFunction;
export const listPublicProfiles = listPublicProfilesFunction;
export const getPublicProfile = getPublicProfileFunction;
export const requestBooking = requestBookingFunction;
export const respondToBooking = respondToBookingFunction;
export const cancelBooking = cancelBookingFunction;
export const getBookingAddress = getBookingAddressFunction;
export const listSalonBookingWorkspace = listSalonBookingWorkspaceFunction;
export const saveSalonAvailability = saveSalonAvailabilityFunction;
export const processCompletedBookingReferral = processCompletedBookingReferralFunction;
export const saveFreelancerProfile = saveFreelancerProfileFunction;
export const createFreelancerPortfolioItem = createFreelancerPortfolioItemFunction;
export const deleteFreelancerPortfolioItem = deleteFreelancerPortfolioItemFunction;
export const createJobPost = createJobPostFunction;
export const listCityJobs = listCityJobsFunction;
export const listSalonHiringWorkspace = listSalonHiringWorkspaceFunction;
export const applyToJob = applyToJobFunction;
export const reviewJobApplication = reviewJobApplicationFunction;
export const createConfirmedDeposit = createConfirmedDepositFunction;
export const listClientCampaigns = listClientCampaignsFunction;
export const createReferralProgram = createReferralProgramFunction;
export const createMyReferralCode = createMyReferralCodeFunction;
export const attributeReferral = attributeReferralFunction;
export const reviewReferralReward = reviewReferralRewardFunction;
export const getReferralMarketingOverview = getReferralMarketingOverviewFunction;
export const getMyReferralWorkspace = getMyReferralWorkspaceFunction;
export const getPublicReferralCode = getPublicReferralCodeFunction;
export { syncFreelancerPortfolio };

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

export const createBookingHandler = async (
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
  const tenantId = req.body?.tenantId;
  if (typeof tenantId !== 'string') {
    res.status(400).send('tenantId is required');
    return;
  }
  try {
    const result = await createBooking(
      tenantId,
      decodedToken.uid,
      req.body?.booking,
      db,
      req.body?.staffAction,
    );
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Booking creation failed';
    const status = message.includes('does not belong') || message === 'Tenant not found' ? 409 : 400;
    res.status(status).send(message);
  }
};

export const createBookingRequest = functions.https.onRequest(createBookingHandler);

export const recordBookingPaymentHandler = async (
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
  if (typeof bookingId !== 'string') {
    res.status(400).send('bookingId is required');
    return;
  }

  try {
    const booking = await db.collection('bookings').doc(bookingId).get();
    if (!booking.exists) {
      res.status(404).send('Booking not found');
      return;
    }
    const locationId = booking.data()?.locationId ?? booking.data()?.tenantId;
    if (typeof locationId !== 'string') {
      res.status(409).send('Booking has no location');
      return;
    }
    const membership = await requireMembership(decodedToken.uid, locationId, 'manageBookings');
    await recordBookingPayment(
      decodedToken.uid,
      bookingId,
      locationId,
      membership,
      req.body?.payment,
      db,
    );
    res.status(200).json({ bookingId, paymentStatus: 'paid' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment recording failed';
    const status = message.includes('Permission') || message.includes('authorization') ? 403 : 409;
    res.status(status).send(message);
  }
};

export const recordBookingPaymentRequest = functions.https.onRequest(recordBookingPaymentHandler);

export const completeBookingPaymentHandler = async (
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
  if (typeof bookingId !== 'string') {
    res.status(400).send('bookingId is required');
    return;
  }

  try {
    const booking = await db.collection('bookings').doc(bookingId).get();
    if (!booking.exists) {
      res.status(404).send('Booking not found');
      return;
    }
    const locationId = booking.data()?.locationId ?? booking.data()?.tenantId;
    if (typeof locationId !== 'string') {
      res.status(409).send('Booking has no location');
      return;
    }
    const membership = await requireMembership(decodedToken.uid, locationId, 'manageBookings');
    const recipientAssociation = await resolvePushRecipient(
      db,
      locationId,
      booking.data()?.barberId,
      'barber',
    );
    const result = await completeBookingAndRecordPayment(
      decodedToken.uid,
      bookingId,
      locationId,
      membership,
      req.body?.payment,
      db,
      recipientAssociation,
    );
    res.status(200).json({
      bookingId,
      status: 'completed',
      paymentStatus: 'paid',
      notificationIds: result.notificationIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Completion payment failed';
    const status = message.includes('Permission') || message.includes('authorization') ? 403 : 409;
    res.status(status).send(message);
  }
};

export const completeBookingPaymentRequest = functions.https.onRequest(completeBookingPaymentHandler);

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
  try {
    assertStandaloneTransition(nextStatus);
  } catch (error) {
    res.status(409).send(error instanceof Error ? error.message : 'Invalid booking status request');
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

    const normalizedRequestedStatus = normalizeBookingStatus(nextStatus);
    const recipientKind = normalizedRequestedStatus === 'completed' ? 'barber' : 'client';
    const recipientAlias = normalizedRequestedStatus === 'completed'
      ? initialData?.barberId
      : initialData?.clientId;
    const recipientAssociation = ['confirmed', 'declined', 'completed'].includes(normalizedRequestedStatus)
      ? await resolvePushRecipient(db, locationId, recipientAlias, recipientKind)
      : null;

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
      const currentRecipientAlias = normalizedNextStatus === 'completed'
        ? currentData?.barberId
        : currentData?.clientId;
      if (
        !recipientAssociation
        || currentRecipientAlias !== recipientAssociation.sourceAlias
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
        locationId,
        recipientId: recipientAssociation.userId,
        ...(recipientAssociation.membershipId
          ? { recipientMembershipId: recipientAssociation.membershipId }
          : {}),
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
