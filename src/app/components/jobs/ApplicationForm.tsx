import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { PortfolioItem } from '../../lib/marketplace/freelancer';
import type { JobPost } from '../../lib/marketplace/jobs';

export default function ApplicationForm({ job, portfolioItems, onApplied }: { job: JobPost; portfolioItems: PortfolioItem[]; onApplied: (input: { jobId: string; portfolioItemIds: string[]; message: string }) => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { await onApplied({ jobId: job.id, portfolioItemIds: selected, message }); } finally { setBusy(false); } };
  return <div className="mt-4 rounded-2xl border border-[#D4AF37]/20 bg-black p-4"><p className="text-xs font-bold uppercase tracking-wider text-white/45">Réalisations jointes</p><div className="mt-3 flex flex-wrap gap-2">{portfolioItems.map(item => <label key={item.id} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs"><input type="checkbox" checked={selected.includes(item.id)} onChange={event => setSelected(current => event.currentTarget.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />{item.caption || 'Réalisation'}</label>)}</div><textarea className="mt-3 w-full rounded-xl border border-white/10 bg-[#111] p-3 text-sm" rows={4} maxLength={1500} placeholder="Votre message au salon" value={message} onChange={event => setMessage(event.currentTarget.value)} /><button disabled={busy || !message.trim()} type="button" onClick={() => void submit()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Envoyer la candidature</button></div>;
}
