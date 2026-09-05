import type { FreelancerProfileInput } from '../../lib/marketplace/freelancer';

interface Props {
  value: FreelancerProfileInput;
  onChange: (value: FreelancerProfileInput) => void;
}

function list(value: string): string[] {
  return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
}

export default function ProfileSettings({ value, onChange }: Props) {
  const update = <K extends keyof FreelancerProfileInput>(key: K, next: FreelancerProfileInput[K]) => (
    onChange({ ...value, [key]: next })
  );
  const field = 'mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white outline-none focus:border-[#D4AF37]';
  return (
    <section className="rounded-3xl border border-white/10 bg-[#111] p-6">
      <div className="flex items-center justify-between gap-4">
        <div><h2 className="text-xl font-black">Profil public</h2><p className="mt-1 text-sm text-white/45">La visibilité reste soumise à l’approbation de la plateforme.</p></div>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={value.visible} onChange={event => update('visible', event.currentTarget.checked)} /> Visible</label>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold uppercase tracking-wider text-white/45">Nom affiché<input className={field} value={value.displayName} maxLength={120} onChange={event => update('displayName', event.currentTarget.value)} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/45">Ville<select className={field} value={value.cityId} onChange={event => update('cityId', event.currentTarget.value as FreelancerProfileInput['cityId'])}><option value="fr-paris">Paris</option><option value="fr-grenoble">Grenoble</option><option value="fr-mulhouse">Mulhouse</option></select></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/45 sm:col-span-2">Bio<textarea className={field} rows={4} maxLength={1000} value={value.bio} onChange={event => update('bio', event.currentTarget.value)} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/45 sm:col-span-2">Résumé des services<textarea className={field} rows={3} maxLength={500} value={value.serviceSummary} onChange={event => update('serviceSummary', event.currentTarget.value)} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/45">Services (identifiants séparés par des virgules)<input className={field} value={value.serviceIds.join(', ')} onChange={event => update('serviceIds', list(event.currentTarget.value))} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/45">Langues (séparées par des virgules)<input className={field} value={value.languages.join(', ')} onChange={event => update('languages', list(event.currentTarget.value))} /></label>
      </div>
    </section>
  );
}
