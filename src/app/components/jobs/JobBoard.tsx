import { useEffect, useState } from 'react';
import { BriefcaseBusiness } from 'lucide-react';
import { toast } from 'sonner';
import { applyToJob, listCityJobs, type JobPost } from '../../lib/marketplace/jobs';
import type { CityId } from '../../lib/marketplace/discovery';
import type { PortfolioItem } from '../../lib/marketplace/freelancer';
import ApplicationForm from './ApplicationForm';

export default function JobBoard({ cityId, portfolioItems, reloadToken = 0 }: { cityId: CityId; portfolioItems: PortfolioItem[]; reloadToken?: number }) {
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; setLoading(true); void listCityJobs(cityId).then(result => { if (active) setJobs(result); }).catch(() => toast.error('Impossible de charger les offres de votre ville.')).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [cityId, reloadToken]);
  return <section className="rounded-3xl border border-white/10 bg-[#111] p-6"><div className="flex items-start gap-3"><BriefcaseBusiness className="mt-1 h-5 w-5 text-[#D4AF37]" /><div><h2 className="text-xl font-black">Opportunités dans votre ville</h2><p className="mt-1 text-sm text-white/45">Postes salariés et locations de fauteuil indépendantes sont clairement séparés.</p></div></div>{loading ? <p className="mt-5 text-sm text-white/40">Chargement…</p> : <div className="mt-5 space-y-4">{jobs.map(job => <article key={job.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"><p className="text-xs font-black uppercase tracking-wider text-[#D4AF37]">{job.relationshipType === 'employee' ? 'Poste salarié' : 'Location de fauteuil — indépendant'}</p><h3 className="mt-2 text-lg font-black">{job.title}</h3><p className="mt-2 text-sm text-white/55">{job.description}</p><p className="mt-3 text-xs text-white/40">{job.schedule} · {job.terms}</p><button type="button" onClick={() => setSelected(current => current === job.id ? '' : job.id)} className="mt-4 rounded-xl border border-[#D4AF37]/30 px-4 py-2 text-sm font-bold text-[#D4AF37]">Candidater</button>{selected === job.id && <ApplicationForm job={job} portfolioItems={portfolioItems} onApplied={async input => { await applyToJob(input); toast.success('Candidature envoyée.'); setSelected(''); }} />}</article>)}{jobs.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/40">Aucune offre publiée dans votre ville.</p>}</div>}</section>;
}
