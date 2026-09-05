import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { parseClientCampaigns, type ClientCampaign } from './campaignRecords';

const listClientCampaignsCall = httpsCallable<Record<string, never>, unknown>(
  functions,
  'listClientCampaigns',
);

export async function listClientCampaigns(): Promise<ClientCampaign[]> {
  const result = await listClientCampaignsCall({});
  const campaigns = parseClientCampaigns(result.data);
  if (!campaigns) throw new Error('The campaign service returned an invalid response');
  return campaigns;
}

export type { ClientCampaign } from './campaignRecords';
