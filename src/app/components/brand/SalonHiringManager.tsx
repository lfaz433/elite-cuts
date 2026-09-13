import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  createJobPost,
  listSalonHiringWorkspace,
  reviewJobApplication,
  type JobApplication,
  type JobPost,
} from '../../lib/marketplace/jobs';
import { SalonHiringManagerView, type JobDraft } from './SalonManagerViews';

export default function SalonHiringManager({
  locationId,
  canInviteWorkers,
}: { locationId: string; canInviteWorkers: boolean }) {
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      const workspace = await listSalonHiringWorkspace(locationId);
      setJobs(workspace.jobs);
      setApplications(workspace.applications);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible de charger les offres et candidatures.');
    }
  }, [locationId]);
  useEffect(() => { void load(); }, [load]);
  const create = async (draft: JobDraft) => {
    setCreating(true);
    try {
      await createJobPost({ locationId, ...draft });
      await load();
      toast.success('Offre publiée.');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Impossible de publier cette offre.');
    } finally { setCreating(false); }
  };
  const review = async (applicationId: string, decision: 'reject' | 'invite') => {
    try {
      const result = await reviewJobApplication(applicationId, decision);
      setApplications(current => current.map(application => application.id === applicationId
        ? { ...application, status: result.status }
        : application));
      toast.success(decision === 'invite' ? 'Invitation créée.' : 'Candidature refusée.');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Impossible de traiter cette candidature.');
      await load();
    }
  };
  return <div>{error && <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{error}</p>}<SalonHiringManagerView jobs={jobs} applications={applications} canInviteWorkers={canInviteWorkers} creating={creating} onCreate={create} onReview={review} /></div>;
}
