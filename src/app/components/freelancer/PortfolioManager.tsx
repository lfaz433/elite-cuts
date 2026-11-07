import { useRef, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { PortfolioItem } from '../../lib/marketplace/freelancer';

interface Props {
  items: PortfolioItem[];
  onCreate: (input: { imageUrl: string; caption: string; visible: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  secondaryActions?: boolean;
}

export default function PortfolioManager({ items, onCreate, onDelete, secondaryActions = false }: Props) {
  const [imageUrl, setImageUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionLock = useRef(false);
  const addStyle = secondaryActions ? 'border border-white/15 text-white/75' : 'bg-[#D4AF37] text-black';
  const submit = async () => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError(null);
    try { await onCreate({ imageUrl, caption, visible: true }); setImageUrl(''); setCaption(''); }
    catch { setError('Impossible d’ajouter cette réalisation. Vérifiez le lien HTTPS puis réessayez.'); }
    finally { actionLock.current = false; setBusy(false); }
  };
  const remove = async (id: string) => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError(null);
    try { await onDelete(id); }
    catch { setError('Impossible de supprimer cette réalisation. Réessayez.'); }
    finally { actionLock.current = false; setBusy(false); }
  };
  return (
    <section className="rounded-3xl border border-white/10 bg-[#111] p-6">
      <h2 className="text-xl font-black">Portfolio</h2><p className="mt-1 text-sm text-white/45">Vos éléments restent votre propriété. Toute publication publique passe par la modération.</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-200">{error}</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><input aria-label="URL HTTPS de l’image" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm" placeholder="https://…" value={imageUrl} onChange={event => setImageUrl(event.currentTarget.value)} /><input aria-label="Légende" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm" placeholder="Légende" value={caption} onChange={event => setCaption(event.currentTarget.value)} /><button disabled={busy || !imageUrl.trim()} type="button" onClick={() => void submit()} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black disabled:opacity-50 ${addStyle}`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ajouter</button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(item => <article key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black"><img src={item.imageUrl} alt={item.caption || 'Portfolio'} className="h-40 w-full object-cover" /><div className="flex items-center justify-between gap-3 p-3"><div><p className="text-sm font-bold">{item.caption || 'Sans légende'}</p><p className="text-xs text-white/40">{item.moderationStatus === 'approved' ? 'Approuvé' : item.moderationStatus === 'rejected' ? 'Refusé' : 'En modération'}</p></div><button type="button" aria-label="Supprimer" disabled={busy} onClick={() => void remove(item.id)} className="rounded-lg border border-red-400/20 p-2 text-red-300"><Trash2 className="h-4 w-4" /></button></div></article>)}</div>
      {items.length === 0 && <p className="mt-5 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/40">Ajoutez votre première réalisation.</p>}
    </section>
  );
}
