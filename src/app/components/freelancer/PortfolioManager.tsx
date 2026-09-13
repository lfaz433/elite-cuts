import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { PortfolioItem } from '../../lib/marketplace/freelancer';

interface Props {
  items: PortfolioItem[];
  onCreate: (input: { imageUrl: string; caption: string; visible: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function PortfolioManager({ items, onCreate, onDelete }: Props) {
  const [imageUrl, setImageUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await onCreate({ imageUrl, caption, visible: true }); setImageUrl(''); setCaption(''); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-3xl border border-white/10 bg-[#111] p-6">
      <h2 className="text-xl font-black">Portfolio</h2><p className="mt-1 text-sm text-white/45">Vos éléments restent votre propriété. Toute publication publique passe par la modération.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><input aria-label="URL HTTPS de l’image" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm" placeholder="https://…" value={imageUrl} onChange={event => setImageUrl(event.currentTarget.value)} /><input aria-label="Légende" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm" placeholder="Légende" value={caption} onChange={event => setCaption(event.currentTarget.value)} /><button disabled={busy || !imageUrl.trim()} type="button" onClick={() => void submit()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-3 text-sm font-black text-black disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ajouter</button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(item => <article key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black"><img src={item.imageUrl} alt={item.caption || 'Portfolio'} className="h-40 w-full object-cover" /><div className="flex items-center justify-between gap-3 p-3"><div><p className="text-sm font-bold">{item.caption || 'Sans légende'}</p><p className="text-xs text-white/40">{item.moderationStatus === 'approved' ? 'Approuvé' : item.moderationStatus === 'rejected' ? 'Refusé' : 'En modération'}</p></div><button type="button" aria-label="Supprimer" onClick={() => void onDelete(item.id)} className="rounded-lg border border-red-400/20 p-2 text-red-300"><Trash2 className="h-4 w-4" /></button></div></article>)}</div>
      {items.length === 0 && <p className="mt-5 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/40">Ajoutez votre première réalisation.</p>}
    </section>
  );
}
