import type { CityId } from './discovery';

export type RelationshipType = 'employee' | 'chair_rental';

export interface JobPost {
  id: string;
  brandId: string;
  locationId: string;
  cityId: CityId;
  relationshipType: RelationshipType;
  title: string;
  description: string;
  serviceIds: string[];
  schedule: string;
  terms: string;
}

export interface JobApplication {
  id: string;
  jobId: string;
  applicantId: string;
  applicantEmail: string;
  applicantName: string;
  portfolioItemIds: string[];
  message: string;
  brandId: string;
  locationId: string;
  cityId: CityId;
  relationshipType: RelationshipType;
  status: 'submitted' | 'rejected' | 'invited';
}

export interface SalonHiringWorkspace {
  locationId: string;
  cityId: CityId;
  jobs: JobPost[];
  applications: JobApplication[];
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isCityId(value: unknown): value is CityId {
  return value === 'fr-paris' || value === 'fr-grenoble' || value === 'fr-mulhouse';
}

export function parseJobPost(value: unknown, requestedCity: CityId): JobPost | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const job = value as Record<string, unknown>;
  if (
    typeof job.id !== 'string'
    || typeof job.brandId !== 'string'
    || typeof job.locationId !== 'string'
    || job.cityId !== requestedCity
    || (job.relationshipType !== 'employee' && job.relationshipType !== 'chair_rental')
    || typeof job.title !== 'string'
    || typeof job.description !== 'string'
    || !strings(job.serviceIds)
    || typeof job.schedule !== 'string'
    || typeof job.terms !== 'string'
  ) return null;
  return {
    id: job.id,
    brandId: job.brandId,
    locationId: job.locationId,
    cityId: requestedCity,
    relationshipType: job.relationshipType,
    title: job.title,
    description: job.description,
    serviceIds: job.serviceIds,
    schedule: job.schedule,
    terms: job.terms,
  };
}

export function parseSalonHiringWorkspace(
  value: unknown,
  requestedLocationId: string,
): SalonHiringWorkspace | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const workspace = value as Record<string, unknown>;
  if (
    workspace.locationId !== requestedLocationId
    || !isCityId(workspace.cityId)
    || !Array.isArray(workspace.jobs)
    || !Array.isArray(workspace.applications)
  ) return null;
  const cityId = workspace.cityId;
  const jobs = workspace.jobs
    .map(job => parseJobPost(job, cityId))
    .filter((job): job is JobPost => job !== null && job.locationId === requestedLocationId);
  const jobsById = new Map(jobs.map(job => [job.id, job]));
  const applications = workspace.applications.flatMap(applicationValue => {
    if (!applicationValue || typeof applicationValue !== 'object' || Array.isArray(applicationValue)) return [];
    const application = applicationValue as Record<string, unknown>;
    const job = typeof application.jobId === 'string' ? jobsById.get(application.jobId) : undefined;
    if (
      !job
      || typeof application.id !== 'string'
      || typeof application.applicantId !== 'string'
      || typeof application.applicantEmail !== 'string'
      || typeof application.applicantName !== 'string'
      || !strings(application.portfolioItemIds)
      || typeof application.message !== 'string'
      || application.brandId !== job.brandId
      || application.locationId !== requestedLocationId
      || application.cityId !== cityId
      || application.relationshipType !== job.relationshipType
      || (application.status !== 'submitted'
        && application.status !== 'rejected'
        && application.status !== 'invited')
    ) return [];
    return [{
      id: application.id,
      jobId: application.jobId as string,
      applicantId: application.applicantId,
      applicantEmail: application.applicantEmail,
      applicantName: application.applicantName,
      portfolioItemIds: application.portfolioItemIds,
      message: application.message,
      brandId: application.brandId as string,
      locationId: requestedLocationId,
      cityId,
      relationshipType: application.relationshipType as RelationshipType,
      status: application.status,
    }];
  });
  return { locationId: requestedLocationId, cityId, jobs, applications };
}
