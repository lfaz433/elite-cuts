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

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
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
