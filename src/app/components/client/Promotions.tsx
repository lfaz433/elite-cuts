import React from 'react';
import { Copy, Percent } from 'lucide-react';
import type { ClientCampaign } from '../../lib/marketplace/campaignRecords';

export function Promotions({
  campaigns,
  loading,
  error,
  onCopy,
}: {
  campaigns: ClientCampaign[];
  loading: boolean;
  error: string | null;
  onCopy: (couponCode: string) => void;
}) {
  return <div className="space-y-4">
    <h2 className="text-2xl font-bold text-white">Offres &amp; Promotions</h2>
    {error && <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">{error} Les offres déjà chargées restent affichées.</p>}
    {loading && campaigns.length === 0 && <p className="text-white/60">Chargement des offres…</p>}
    {!loading && campaigns.length === 0 && !error && <div className="rounded-2xl border border-white/10 bg-white/5 py-16 text-center"><Percent className="mx-auto mb-4 h-12 w-12 text-[#D4AF37]/40" /><p className="text-white/60">Aucune offre promotionnelle disponible pour le moment.</p></div>}
    {campaigns.map(campaign => <article key={campaign.id} className="rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#141414] to-[#1a1a1a] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#D4AF37]">Offre ciblée</span>
          <h3 className="mt-3 text-lg font-bold text-white">{campaign.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/60">{campaign.description}</p>
        </div>
        {campaign.discountAmount !== undefined && <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-400">-{campaign.discountAmount}%</span>}
      </div>
      {campaign.couponCode && <div className="mt-4 flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-3.5">
        <div><p className="text-[9px] font-black uppercase tracking-wider text-white/30">Code promo</p><p className="select-all text-sm font-black tracking-wider text-[#D4AF37]">{campaign.couponCode}</p></div>
        <button type="button" onClick={() => onCopy(campaign.couponCode as string)} className="flex items-center gap-1 rounded-lg bg-[#D4AF37]/10 px-3 py-1.5 text-xs font-bold text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black"><Copy className="h-3.5 w-3.5" /> Copier</button>
      </div>}
    </article>)}
  </div>;
}
