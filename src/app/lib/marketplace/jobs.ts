import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { CityId } from './discovery';
import {
  parseJobPost,
  parseSalonHiringWorkspace,
  type JobPost,
  type RelationshipType,
  type SalonHiringWorkspace,
} from './jobRecords';

export * from './jobRecords';

const listJobsCall = httpsCallable<{ cityId: CityId }, unknown>(functions, 'listCityJobs');
const applyCall = httpsCallable<{
  jobId: string; portfolioItemIds: string[]; message: string;
}, { applicationId: string }>(functions, 'applyToJob');
const createJobCall = httpsCallable<{
  locationId: string;
  relationshipType: RelationshipType;
  title: string;
  description: string;
  serviceIds: string[];
  schedule: string;
  terms: string;
}, { jobId: string }>(functions, 'createJobPost');
const reviewApplicationCall = httpsCallable<{
  applicationId: string; decision: 'reject' | 'invite';
}, { applicationId: string; status: 'rejected' | 'invited'; invitationId?: string }>(
  functions,
  'reviewJobApplication',
);
const listSalonHiringWorkspaceCall = httpsCallable<{ locationId: string }, unknown>(
  functions,
  'listSalonHiringWorkspace',
);

export async function listCityJobs(cityId: CityId): Promise<JobPost[]> {
  const result = await listJobsCall({ cityId });
  if (!Array.isArray(result.data)) return [];
  return result.data
    .map(job => parseJobPost(job, cityId))
    .filter((job): job is JobPost => job !== null);
}

export async function applyToJob(input: {
  jobId: string;
  portfolioItemIds: string[];
  message: string;
}): Promise<{ applicationId: string }> {
  return (await applyCall(input)).data;
}

export async function createJobPost(input: {
  locationId: string;
  relationshipType: RelationshipType;
  title: string;
  description: string;
  serviceIds: string[];
  schedule: string;
  terms: string;
}): Promise<string> {
  return (await createJobCall(input)).data.jobId;
}

export async function reviewJobApplication(
  applicationId: string,
  decision: 'reject' | 'invite',
): Promise<{ status: 'rejected' | 'invited'; invitationId?: string }> {
  return (await reviewApplicationCall({ applicationId, decision })).data;
}

export async function listSalonHiringWorkspace(locationId: string): Promise<SalonHiringWorkspace> {
  const result = await listSalonHiringWorkspaceCall({ locationId });
  const workspace = parseSalonHiringWorkspace(result.data, locationId);
  if (!workspace) throw new Error('The hiring service returned an invalid response');
  return workspace;
}
