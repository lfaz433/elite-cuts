import { useState } from 'react';
import { Plus, Scissors, Trash2 } from 'lucide-react';
import type { FreelancerProfileInput } from '../../lib/marketplace/freelancer';
import {
  addFreelancerService,
  displayFreelancerService,
  removeFreelancerService,
  setFreelancerServicePrice,
} from '../../lib/marketplace/freelancerServices.mjs';

interface Props {
  value: FreelancerProfileInput;
  onChange: (value: FreelancerProfileInput) => void;
}

const SUGGESTED_SERVICES = ['Coupe classique', 'Dégradé', 'Barbe', 'Coupe et barbe'];

export default function ServiceCatalog({ value, onChange }: Props) {
  const [customService, setCustomService] = useState('');
  const field = 'w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white outline-none focus:border-[#D4AF37]';
  const change = (next: { serviceIds: string[]; servicePricesMinor: Record<string, number> } | null) => {
    if (next) onChange({ ...value, ...next });
  };
  const add = (name: string) => {
    change(addFreelancerService(value, name));
    setCustomService('');
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-[#111] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#D4AF37]">Votre carte de services</p>
          <h2 className="mt-2 text-xl font-black">Services et tarifs</h2>
          <p className="mt-1 text-sm text-white/45">Ajoutez ce que vous proposez. Chaque prix sera utilisé pour les demandes de réservation.</p>
        </div>
        <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1 text-xs font-bold text-[#D4AF37]">{value.serviceIds.length} service{value.serviceIds.length === 1 ? '' : 's'}</span>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {SUGGESTED_SERVICES.filter(name => !value.serviceIds.includes(name.toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))).map(name => (
          <button key={name} type="button" onClick={() => add(name)} className="rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-white/70 transition hover:border-[#D4AF37]/60 hover:text-[#D4AF37]">+ {name}</button>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <input className={field} value={customService} maxLength={64} onChange={event => setCustomService(event.currentTarget.value)} placeholder="Ajouter un service personnalisé" />
        <button type="button" disabled={!customService.trim()} onClick={() => add(customService)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-3 text-sm font-black text-black disabled:opacity-40"><Plus className="h-4 w-4" /> Ajouter</button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {value.serviceIds.map(serviceId => (
          <article key={serviceId} className="rounded-2xl border border-white/10 bg-black p-4">
            <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#D4AF37]/10 text-[#D4AF37]"><Scissors className="h-4 w-4" /></span><h3 className="font-bold">{displayFreelancerService(serviceId)}</h3></div><button type="button" aria-label={`Supprimer ${displayFreelancerService(serviceId)}`} onClick={() => change(removeFreelancerService(value, serviceId))} className="rounded-lg p-2 text-white/40 transition hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button></div>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-white/40">Prix du service (€)<input className={`mt-2 ${field}`} type="number" min="0" max="10000" step="0.01" value={((value.servicePricesMinor[serviceId] ?? 0) / 100).toFixed(2)} onChange={event => change(setFreelancerServicePrice(value, serviceId, Math.max(0, Math.round(Number(event.currentTarget.value || 0) * 100))))} /></label>
          </article>
        ))}
      </div>
      {value.serviceIds.length === 0 && <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-black/50 px-5 py-8 text-center text-sm text-white/45">Ajoutez votre premier service pour commencer à recevoir des réservations.</div>}
    </section>
  );
}
