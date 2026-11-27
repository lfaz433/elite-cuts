import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createEuropeFunctions } from './runtime';

type RecordValue = Record<string, unknown>;
interface SalonService { id: string; label: string; priceMinor: number; durationMinutes: number }
const invalid = () => new functions.https.HttpsError('invalid-argument', 'Vérifiez le nom, le prix et la durée de chaque prestation.');
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as RecordValue;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw invalid();
  return value;
}
function services(value: unknown): SalonService[] {
  if (!Array.isArray(value) || value.length > 50) throw invalid();
  const ids = new Set<string>();
  return value.map(item => {
    const row = record(item);
    if (Object.keys(row).some(key => !['id', 'label', 'priceMinor', 'durationMinutes'].includes(key))) throw invalid();
    const serviceId = id(row.id);
    if (ids.has(serviceId)) throw invalid();
    ids.add(serviceId);
    if (typeof row.label !== 'string' || !row.label.trim() || row.label.trim().length > 80
      || typeof row.priceMinor !== 'number' || !Number.isSafeInteger(row.priceMinor) || row.priceMinor < 0 || row.priceMinor > 100000
      || typeof row.durationMinutes !== 'number' || !Number.isSafeInteger(row.durationMinutes) || row.durationMinutes < 5 || row.durationMinutes > 480) throw invalid();
    return { id: serviceId, label: row.label.trim(), priceMinor: row.priceMinor, durationMinutes: row.durationMinutes };
  });
}

export async function saveSalonServiceCatalog(callerUid: string | null, value: unknown, firestore = admin.firestore()) {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Connectez-vous pour enregistrer.');
  const input = record(value);
  if (Object.keys(input).some(key => !['locationId', 'expectedRevision', 'services'].includes(key))) throw invalid();
  const locationId = id(input.locationId);
  if (typeof input.expectedRevision !== 'number' || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw invalid();
  const expectedRevision = input.expectedRevision;
  const catalog = services(input.services);
  const locationRef = firestore.collection('salonLocations').doc(locationId);
  const initial = await locationRef.get();
  const brandId = initial.data()?.brandId;
  if (!initial.exists || typeof brandId !== 'string') throw new functions.https.HttpsError('not-found', 'Salon introuvable.');
  const principalRef = firestore.collection('memberships').doc(`${brandId}__principal__${callerUid}`);
  const memberRef = firestore.collection('memberships').doc(`${brandId}__${locationId}__${callerUid}`);
  const auditRef = firestore.collection('auditEvents').doc();
  return firestore.runTransaction(async transaction => {
    const [location, principalSnapshot, memberSnapshot] = await transaction.getAll(locationRef, principalRef, memberRef);
    const principal = principalSnapshot.data();
    const member = memberSnapshot.data();
    const principalAllowed = principal?.userId === callerUid && principal.brandId === brandId && principal.role === 'principal_admin' && principal.status === 'active';
    const memberAllowed = member?.userId === callerUid && member.brandId === brandId && member.locationId === locationId
      && member.role === 'salon_admin' && member.status === 'active' && member.permissions?.manageServices === true;
    if (!location.exists || location.data()?.brandId !== brandId || (!principalAllowed && !memberAllowed)) {
      throw new functions.https.HttpsError('permission-denied', 'Vous ne pouvez pas modifier les prestations de ce salon.');
    }
    const revision = location.data()?.serviceCatalogDraft?.revision ?? 0;
    if (revision !== expectedRevision) throw new functions.https.HttpsError('aborted', 'Les prestations ont changé. Rechargez-les avant de réessayer.');
    const nextRevision = expectedRevision + 1;
    const now = admin.firestore.FieldValue.serverTimestamp();
    // The working catalog is private. Publication and its approval are separate.
    transaction.update(locationRef, { serviceCatalogDraft: { revision: nextRevision, currency: 'EUR', services: catalog, updatedAt: now, updatedBy: callerUid } });
    transaction.create(auditRef, { action: 'SALON_SERVICE_DRAFT_UPDATED', actorUid: callerUid, brandId, locationId, revision: nextRevision, serviceCount: catalog.length, createdAt: now });
    return { locationId, revision: nextRevision, currency: 'EUR', services: catalog };
  });
}

export const saveSalonServiceCatalogFunction = createEuropeFunctions().https.onCall((data, context) => saveSalonServiceCatalog(context.auth?.uid ?? null, data));
