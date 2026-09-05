import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

type Firestore = admin.firestore.Firestore;
type RecordValue = Record<string, unknown>;
type CityId = 'fr-paris' | 'fr-grenoble' | 'fr-mulhouse';
type RelationshipType = 'employee' | 'chair_rental';
type ReviewDecision = 'reject' | 'invite';

interface ApplicationIdentity {
  uid: string;
  email?: string;
  emailVerified?: boolean;
}

const CITY_IDS = new Set<CityId>(['fr-paris', 'fr-grenoble', 'fr-mulhouse']);
const JOB_KEYS = new Set([
  'locationId', 'relationshipType', 'title', 'description', 'serviceIds', 'schedule', 'terms',
]);
const APPLICATION_KEYS = new Set(['jobId', 'portfolioItemIds', 'message']);
const REVIEW_KEYS = new Set(['applicationId', 'decision']);
const HIRING_WORKSPACE_KEYS = new Set(['locationId']);
const NO_PERMISSIONS = {
  manageBookings: false,
  manageStaff: false,
  inviteWorkers: false,
  removeWorkers: false,
  manageServices: false,
  manageInventory: false,
  manageJobs: false,
};

function locationMembershipId(brandId: string, locationId: string, userId: string): string {
  return `${brandId}__${locationId}__${userId}`;
}

function inputRecord(value: unknown, allowed: Set<string>, message: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', message);
  }
  const input = value as RecordValue;
  if (Object.keys(input).some(key => !allowed.has(key))) {
    throw new functions.https.HttpsError('invalid-argument', 'Server-owned job fields cannot be supplied');
  }
  return input;
}

function text(value: unknown, field: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > maximum) {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  return normalized;
}

function documentId(value: unknown, field: string): string {
  const id = text(value, field, 256);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  return id;
}

function stringList(value: unknown, field: string, maximumItems: number): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  const values = value.map(item => documentId(item, field));
  if (new Set(values).size !== values.length) {
    throw new functions.https.HttpsError('invalid-argument', `${field} contains duplicates`);
  }
  return values;
}

function relationship(value: unknown): RelationshipType {
  if (value !== 'employee' && value !== 'chair_rental') {
    throw new functions.https.HttpsError('invalid-argument', 'relationshipType is invalid');
  }
  return value;
}

function cityId(value: unknown): CityId {
  if (typeof value !== 'string' || !CITY_IDS.has(value as CityId)) {
    throw new functions.https.HttpsError('invalid-argument', 'cityId is invalid');
  }
  return value as CityId;
}

function locationCityId(value: RecordValue): CityId {
  if (typeof value.cityId === 'string' && CITY_IDS.has(value.cityId as CityId)) {
    return value.cityId as CityId;
  }
  if (typeof value.city !== 'string') {
    throw new functions.https.HttpsError('failed-precondition', 'Salon location has no supported city');
  }
  const normalized = value.city.trim().toLowerCase();
  if (normalized === 'paris') return 'fr-paris';
  if (normalized === 'grenoble') return 'fr-grenoble';
  if (normalized === 'mulhouse') return 'fr-mulhouse';
  throw new functions.https.HttpsError('failed-precondition', 'Salon location has no supported city');
}

function activeJob(value: admin.firestore.DocumentData | undefined): RecordValue | null {
  if (
    !value
    || typeof value.brandId !== 'string'
    || typeof value.locationId !== 'string'
    || typeof value.cityId !== 'string'
    || !CITY_IDS.has(value.cityId as CityId)
    || (value.relationshipType !== 'employee' && value.relationshipType !== 'chair_rental')
    || typeof value.title !== 'string'
    || typeof value.description !== 'string'
    || !Array.isArray(value.serviceIds)
    || value.serviceIds.some((item: unknown) => typeof item !== 'string')
    || typeof value.schedule !== 'string'
    || typeof value.terms !== 'string'
    || value.status !== 'published'
  ) return null;
  return value as RecordValue;
}

function canManageJobs(
  callerUid: string,
  brandId: string,
  locationId: string,
  principal: admin.firestore.DocumentData | undefined,
  membership: admin.firestore.DocumentData | undefined,
): boolean {
  const principalAllowed = principal?.userId === callerUid
    && principal.brandId === brandId
    && principal.role === 'principal_admin'
    && principal.status === 'active';
  const membershipAllowed = membership?.userId === callerUid
    && membership.brandId === brandId
    && membership.locationId === locationId
    && membership.status === 'active'
    && (membership.permissions as RecordValue | undefined)?.manageJobs === true;
  return principalAllowed || membershipAllowed;
}

function canInviteWorkers(
  callerUid: string,
  brandId: string,
  locationId: string,
  principal: admin.firestore.DocumentData | undefined,
  membership: admin.firestore.DocumentData | undefined,
): boolean {
  const principalAllowed = principal?.userId === callerUid
    && principal.brandId === brandId
    && principal.role === 'principal_admin'
    && principal.status === 'active';
  const membershipAllowed = membership?.userId === callerUid
    && membership.brandId === brandId
    && membership.locationId === locationId
    && membership.status === 'active'
    && (membership.permissions as RecordValue | undefined)?.inviteWorkers === true;
  return principalAllowed || membershipAllowed;
}

export async function createJobPost(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<{ jobId: string }> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const input = inputRecord(value, JOB_KEYS, 'Job post is required');
  const locationId = documentId(input.locationId, 'locationId');
  const locationRef = firestore.collection('salonLocations').doc(locationId);
  const locationSnapshot = await locationRef.get();
  const location = locationSnapshot.data() as RecordValue | undefined;
  if (!locationSnapshot.exists || typeof location?.brandId !== 'string') {
    throw new functions.https.HttpsError('not-found', 'Salon location not found');
  }
  const jobRef = firestore.collection('jobPosts').doc();
  const auditRef = firestore.collection('auditEvents').doc();
  const principalRef = firestore.collection('memberships').doc(`${location.brandId}__principal__${callerUid}`);
  const membershipRef = firestore.collection('memberships').doc(
    locationMembershipId(location.brandId, locationId, callerUid),
  );
  await firestore.runTransaction(async transaction => {
    const [currentLocation, principal, membership] = await transaction.getAll(
      locationRef,
      principalRef,
      membershipRef,
    );
    const current = currentLocation.data() as RecordValue | undefined;
    if (
      !currentLocation.exists
      || !current
      || current?.brandId !== location.brandId
      || !canManageJobs(callerUid, location.brandId as string, locationId, principal.data(), membership.data())
    ) {
      throw new functions.https.HttpsError('permission-denied', 'Permission denied');
    }
    const currentCityId = locationCityId(current);
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.create(jobRef, {
      brandId: location.brandId,
      locationId,
      cityId: currentCityId,
      relationshipType: relationship(input.relationshipType),
      title: text(input.title, 'title', 160),
      description: text(input.description, 'description', 2000),
      serviceIds: stringList(input.serviceIds, 'serviceIds', 24),
      schedule: text(input.schedule, 'schedule', 500),
      terms: text(input.terms, 'terms', 500),
      status: 'published',
      createdBy: callerUid,
      createdAt: now,
      updatedAt: now,
    });
    transaction.create(auditRef, {
      action: 'JOB_POST_PUBLISHED', actorUid: callerUid, jobId: jobRef.id,
      brandId: location.brandId, locationId, cityId: currentCityId, createdAt: now,
    });
  });
  return { jobId: jobRef.id };
}

export async function listCityJobs(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<Array<RecordValue & { id: string }>> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const input = inputRecord(value, new Set(['cityId']), 'cityId is required');
  const requestedCity = cityId(input.cityId);
  const profile = await firestore.collection('freelancerProfiles').doc(callerUid).get();
  if (!profile.exists || profile.data()?.cityId !== requestedCity) {
    throw new functions.https.HttpsError('permission-denied', 'Jobs are available only for your profile city');
  }
  const jobs = await firestore.collection('jobPosts')
    .where('cityId', '==', requestedCity)
    .where('status', '==', 'published')
    .get();
  return jobs.docs.flatMap(job => {
    const record = activeJob(job.data());
    return record ? [{
      id: job.id,
      brandId: record.brandId,
      locationId: record.locationId,
      cityId: record.cityId,
      relationshipType: record.relationshipType,
      title: record.title,
      description: record.description,
      serviceIds: record.serviceIds,
      schedule: record.schedule,
      terms: record.terms,
    }] : [];
  });
}

export async function listSalonHiringWorkspace(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<{
  locationId: string;
  cityId: CityId;
  jobs: Array<RecordValue & { id: string }>;
  applications: Array<RecordValue & { id: string }>;
}> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const input = inputRecord(value, HIRING_WORKSPACE_KEYS, 'locationId is required');
  const locationId = documentId(input.locationId, 'locationId');
  const locationRef = firestore.collection('salonLocations').doc(locationId);
  const locationSnapshot = await locationRef.get();
  const location = locationSnapshot.data() as RecordValue | undefined;
  if (!locationSnapshot.exists || typeof location?.brandId !== 'string') {
    throw new functions.https.HttpsError('not-found', 'Salon location not found');
  }
  const brandId = location.brandId;
  const [principal, membership] = await Promise.all([
    firestore.collection('memberships').doc(`${brandId}__principal__${callerUid}`).get(),
    firestore.collection('memberships').doc(locationMembershipId(brandId, locationId, callerUid)).get(),
  ]);
  if (!canManageJobs(callerUid, brandId, locationId, principal.data(), membership.data())) {
    throw new functions.https.HttpsError('permission-denied', 'Permission denied');
  }
  const scopedCityId = locationCityId(location);
  const [jobSnapshot, applicationSnapshot] = await Promise.all([
    firestore.collection('jobPosts').where('locationId', '==', locationId).get(),
    firestore.collection('jobApplications').where('locationId', '==', locationId).get(),
  ]);
  const jobs = jobSnapshot.docs.flatMap(document => {
    const job = activeJob(document.data());
    return job
      && job.brandId === brandId
      && job.locationId === locationId
      && job.cityId === scopedCityId
      ? [{
        id: document.id,
        brandId,
        locationId,
        cityId: scopedCityId,
        relationshipType: job.relationshipType,
        title: job.title,
        description: job.description,
        serviceIds: job.serviceIds,
        schedule: job.schedule,
        terms: job.terms,
      }]
      : [];
  }).sort((left, right) => left.id.localeCompare(right.id));
  const jobIds = new Set(jobs.map(job => job.id));
  const applications = applicationSnapshot.docs.flatMap(document => {
    const application = document.data() as RecordValue;
    if (
      application.brandId !== brandId
      || application.locationId !== locationId
      || application.cityId !== scopedCityId
      || !jobIds.has(String(application.jobId))
      || (application.relationshipType !== 'employee' && application.relationshipType !== 'chair_rental')
      || !['submitted', 'rejected', 'invited'].includes(String(application.status))
      || typeof application.applicantId !== 'string'
      || typeof application.applicantEmail !== 'string'
      || typeof application.applicantName !== 'string'
      || typeof application.message !== 'string'
      || !Array.isArray(application.portfolioItemIds)
      || application.portfolioItemIds.some(item => typeof item !== 'string')
    ) return [];
    return [{
      id: document.id,
      jobId: application.jobId,
      applicantId: application.applicantId,
      applicantEmail: application.applicantEmail,
      applicantName: application.applicantName,
      portfolioItemIds: application.portfolioItemIds,
      message: application.message,
      brandId,
      locationId,
      cityId: scopedCityId,
      relationshipType: application.relationshipType,
      status: application.status,
    }];
  }).sort((left, right) => left.id.localeCompare(right.id));
  return { locationId, cityId: scopedCityId, jobs, applications };
}

export async function applyToJob(
  identity: ApplicationIdentity,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<{ applicationId: string }> {
  if (!identity.uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  if (identity.emailVerified !== true || typeof identity.email !== 'string' || !identity.email.trim()) {
    throw new functions.https.HttpsError('permission-denied', 'A verified email address is required');
  }
  const applicantEmail = identity.email.trim().toLowerCase();
  const input = inputRecord(value, APPLICATION_KEYS, 'Job application is required');
  const jobId = documentId(input.jobId, 'jobId');
  const portfolioItemIds = stringList(input.portfolioItemIds, 'portfolioItemIds', 12);
  const applicationId = `${jobId}__${identity.uid}`;
  const jobRef = firestore.collection('jobPosts').doc(jobId);
  const profileRef = firestore.collection('freelancerProfiles').doc(identity.uid);
  const portfolioRefs = portfolioItemIds.map(id => firestore.collection('portfolioItems').doc(id));
  const applicationRef = firestore.collection('jobApplications').doc(applicationId);
  const auditRef = firestore.collection('auditEvents').doc();

  await firestore.runTransaction(async transaction => {
    const snapshots = await transaction.getAll(jobRef, profileRef, applicationRef, ...portfolioRefs);
    const [jobSnapshot, profileSnapshot, applicationSnapshot, ...portfolioSnapshots] = snapshots;
    const job = activeJob(jobSnapshot.data());
    const profile = profileSnapshot.data() as RecordValue | undefined;
    if (!jobSnapshot.exists || !job) {
      throw new functions.https.HttpsError('not-found', 'Job is not available');
    }
    if (!profileSnapshot.exists || profile?.uid !== identity.uid) {
      throw new functions.https.HttpsError('failed-precondition', 'Create your freelancer profile before applying');
    }
    if (profile.cityId !== job.cityId) {
      throw new functions.https.HttpsError('failed-precondition', 'This job is outside your profile city');
    }
    if (applicationSnapshot.exists) {
      throw new functions.https.HttpsError('already-exists', 'You have already applied to this job');
    }
    if (portfolioSnapshots.some(item => (
      !item.exists
      || item.data()?.ownerId !== identity.uid
      || item.data()?.ownerType !== 'freelancer'
    ))) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Applications may include only your own portfolio items',
      );
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.create(applicationRef, {
      jobId,
      applicantId: identity.uid,
      applicantEmail,
      applicantName: typeof profile.displayName === 'string' ? profile.displayName : '',
      portfolioItemIds,
      message: text(input.message, 'message', 1500),
      brandId: job.brandId,
      locationId: job.locationId,
      cityId: job.cityId,
      relationshipType: job.relationshipType,
      status: 'submitted',
      createdAt: now,
      updatedAt: now,
    });
    transaction.create(auditRef, {
      action: 'JOB_APPLICATION_SUBMITTED', actorUid: identity.uid,
      applicationId, jobId, brandId: job.brandId, locationId: job.locationId,
      cityId: job.cityId, createdAt: now,
    });
  });
  return { applicationId };
}

export async function reviewJobApplication(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<{ applicationId: string; status: 'rejected' } | {
  applicationId: string; status: 'invited'; invitationId: string;
}> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const input = inputRecord(value, REVIEW_KEYS, 'Application review is required');
  const applicationId = documentId(input.applicationId, 'applicationId');
  if (input.decision !== 'reject' && input.decision !== 'invite') {
    throw new functions.https.HttpsError('invalid-argument', 'decision is invalid');
  }
  const decision = input.decision as ReviewDecision;
  const applicationRef = firestore.collection('jobApplications').doc(applicationId);
  const initial = await applicationRef.get();
  const initialApplication = initial.data() as RecordValue | undefined;
  if (
    !initial.exists
    || typeof initialApplication?.brandId !== 'string'
    || typeof initialApplication.locationId !== 'string'
  ) {
    throw new functions.https.HttpsError('not-found', 'Application not found');
  }
  const jobRef = firestore.collection('jobPosts').doc(String(initialApplication.jobId));
  const principalRef = firestore.collection('memberships').doc(
    `${initialApplication.brandId}__principal__${callerUid}`,
  );
  const membershipRef = firestore.collection('memberships').doc(locationMembershipId(
    initialApplication.brandId,
    initialApplication.locationId,
    callerUid,
  ));
  const invitationRef = firestore.collection('invitations').doc();
  const auditRef = firestore.collection('auditEvents').doc();
  let result: { applicationId: string; status: 'rejected' } | {
    applicationId: string; status: 'invited'; invitationId: string;
  } = { applicationId, status: 'rejected' };

  await firestore.runTransaction(async transaction => {
    const [applicationSnapshot, jobSnapshot, principalSnapshot, membershipSnapshot] = (
      await transaction.getAll(applicationRef, jobRef, principalRef, membershipRef)
    );
    const application = applicationSnapshot.data() as RecordValue | undefined;
    const job = activeJob(jobSnapshot.data());
    if (!applicationSnapshot.exists || !application || application.status !== 'submitted') {
      throw new functions.https.HttpsError('failed-precondition', 'Application is no longer awaiting review');
    }
    if (
      !jobSnapshot.exists
      || !job
      || application.jobId !== jobRef.id
      || application.brandId !== job.brandId
      || application.locationId !== job.locationId
      || application.cityId !== job.cityId
      || application.relationshipType !== job.relationshipType
    ) {
      throw new functions.https.HttpsError('failed-precondition', 'Application scope does not match its job');
    }
    if (!canManageJobs(
      callerUid,
      String(job.brandId),
      String(job.locationId),
      principalSnapshot.data(),
      membershipSnapshot.data(),
    )) {
      throw new functions.https.HttpsError('permission-denied', 'Permission denied');
    }
    if (decision === 'invite' && !canInviteWorkers(
      callerUid,
      String(job.brandId),
      String(job.locationId),
      principalSnapshot.data(),
      membershipSnapshot.data(),
    )) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Worker invitation permission is required',
      );
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    if (decision === 'reject') {
      transaction.update(applicationRef, { status: 'rejected', reviewedBy: callerUid, updatedAt: now });
      result = { applicationId, status: 'rejected' };
    } else {
      const relationshipType = relationship(application.relationshipType);
      const role = relationshipType === 'employee' ? 'worker' : 'chair_renter';
      transaction.create(invitationRef, {
        brandId: job.brandId,
        locationId: job.locationId,
        email: text(application.applicantEmail, 'applicantEmail', 254).toLowerCase(),
        displayName: text(application.applicantName, 'applicantName', 120),
        role,
        relationshipType,
        permissions: NO_PERMISSIONS,
        status: 'pending',
        invitedBy: callerUid,
        jobId: jobRef.id,
        applicationId,
        createdAt: now,
      });
      transaction.update(applicationRef, {
        status: 'invited', invitationId: invitationRef.id, reviewedBy: callerUid, updatedAt: now,
      });
      result = { applicationId, status: 'invited', invitationId: invitationRef.id };
    }
    transaction.create(auditRef, {
      action: decision === 'invite' ? 'JOB_APPLICATION_INVITED' : 'JOB_APPLICATION_REJECTED',
      actorUid: callerUid, applicationId, jobId: jobRef.id, brandId: job.brandId,
      locationId: job.locationId, cityId: job.cityId, createdAt: now,
    });
  });
  return result;
}

export const createJobPostFunction = functions.https.onCall((data, context) => (
  createJobPost(context.auth?.uid ?? null, data)
));

export const listCityJobsFunction = functions.https.onCall((data, context) => (
  listCityJobs(context.auth?.uid ?? null, data)
));

export const listSalonHiringWorkspaceFunction = functions.https.onCall((data, context) => (
  listSalonHiringWorkspace(context.auth?.uid ?? null, data)
));

export const applyToJobFunction = functions.https.onCall((data, context) => (
  applyToJob({
    uid: context.auth?.uid ?? '',
    email: typeof context.auth?.token.email === 'string' ? context.auth.token.email : undefined,
    emailVerified: context.auth?.token.email_verified === true,
  }, data)
));

export const reviewJobApplicationFunction = functions.https.onCall((data, context) => (
  reviewJobApplication(context.auth?.uid ?? null, data)
));
