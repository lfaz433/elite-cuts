import type { FreelancerProfileInput } from '../../lib/marketplace/freelancer';

interface Props {
  value: FreelancerProfileInput;
  onChange: (value: FreelancerProfileInput) => void;
}

function number(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

export default function TravelSettings({ value, onChange }: Props) {
  const update = <K extends keyof FreelancerProfileInput>(key: K, next: FreelancerProfileInput[K]) => onChange({ ...value, [key]: next });
  const field = 'mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white outline-none focus:border-[#D4AF37]';
  return (
    <section className="rounded-3xl border border-white/10 bg-[#111] p-6">
      <h2 className="text-xl font-black">Déplacements et disponibilité</h2>
      <p className="mt-1 text-sm text-white/45">Chaque visite à domicile restera en attente de votre approbation. L’adresse exacte n’est révélée qu’après acceptation.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <label className="text-xs font-bold uppercase tracking-wider text-white/45">Rayon simple (km)<input type="number" min={1} max={100} className={field} value={value.radiusKm} onChange={event => update('radiusKm', Math.max(1, number(event.currentTarget.value, 1)))} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/45">Frais fixes (€)<input type="number" min={0} step="0.01" className={field} value={(value.travelFeeMinor / 100).toFixed(2)} onChange={event => update('travelFeeMinor', number(String(Number(event.currentTarget.value) * 100)))} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/45">Annulation (heures)<input type="number" min={0} max={720} className={field} value={value.cancellationWindowHours} onChange={event => update('cancellationWindowHours', number(event.currentTarget.value))} /></label>
      </div>
      <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-white/45">Créneaux disponibles (un par ligne, AAAA-MM-JJTHH:MM)<textarea className={field} rows={5} value={value.availability.join('\n')} onChange={event => update('availability', [...new Set(event.currentTarget.value.split(/\s+/).map(item => item.trim()).filter(Boolean))])} /></label>
      <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
        <p className="text-sm font-bold text-amber-100">Préférence de dépôt — collecte en ligne indisponible</p>
        <p className="mt-1 text-xs text-amber-100/60">Ce réglage prépare votre politique future. Aucun paiement, lien de checkout ou dépôt ne peut être lancé actuellement.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase tracking-wider text-white/45">Mode<select className={field} value={value.deposit.mode} onChange={event => { const mode = event.currentTarget.value as FreelancerProfileInput['deposit']['mode']; update('deposit', { mode, value: mode === 'none' ? 0 : value.deposit.value }); }}><option value="none">Aucun</option><option value="fixed">Montant fixe (préférence)</option><option value="percentage">Pourcentage (préférence)</option></select></label>
          <label className="text-xs font-bold uppercase tracking-wider text-white/45">Valeur<input disabled={value.deposit.mode === 'none'} type="number" min={0} max={value.deposit.mode === 'percentage' ? 100 : undefined} className={field} value={value.deposit.value} onChange={event => update('deposit', { ...value.deposit, value: number(event.currentTarget.value) })} /></label>
        </div>
      </div>
    </section>
  );
}
