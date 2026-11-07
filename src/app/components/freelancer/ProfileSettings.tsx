import type { FreelancerProfileInput } from '../../lib/marketplace/freelancer';
import type { SocialPlatform } from '../../lib/marketplace/identity';
import type { IdentityErrors } from './workspace/freelancerWorkspacePresentation';

interface Props {
  value: FreelancerProfileInput;
  onChange: (value: FreelancerProfileInput) => void;
  errors?: IdentityErrors;
}

function list(value: string): string[] {
  return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
}

export default function ProfileSettings({ value, onChange, errors = {} }: Props) {
  const update = <K extends keyof FreelancerProfileInput>(key: K, next: FreelancerProfileInput[K]) => (
    onChange({ ...value, [key]: next })
  );
  const field = 'mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white outline-none focus:border-[#D4AF37]';
  const identityField = (name: 'publicSlug' | 'profileImageUrl' | SocialPlatform, label: string, current: string, change: (next: string) => void, placeholder: string, type = 'text') => <label key={name} className="text-xs font-bold uppercase tracking-wider text-white/50">{label}<input id={`freelancer-${name}`} name={name} className={field} type={type} value={current} placeholder={placeholder} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `freelancer-${name}-error` : undefined} onChange={event => change(event.currentTarget.value)} />{errors[name] && <span id={`freelancer-${name}-error`} role="alert" className="mt-2 block text-xs font-normal normal-case tracking-normal text-red-300">{errors[name]}</span>}</label>;
  const updateIdentity = (key: 'publicSlug' | 'profileImageUrl', next: string) => {
    const identity = { ...value.identity, [key]: next };
    if (key === 'profileImageUrl' && !next) delete identity.profileImageUrl;
    update('identity', identity);
  };
  return (
    <section className="rounded-3xl border border-white/10 bg-[#111] p-6">
      <div className="flex items-center justify-between gap-4">
        <div><h2 className="text-xl font-black">Profil public</h2><p className="mt-1 text-sm text-white/45">La visibilité reste soumise à l’approbation de la plateforme.</p></div>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={value.visible} onChange={event => update('visible', event.currentTarget.checked)} /> Visible</label>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold uppercase tracking-wider text-white/45">Nom affiché<input required className={field} value={value.displayName} maxLength={120} onChange={event => update('displayName', event.currentTarget.value)} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/45">Ville<select className={field} value={value.cityId} onChange={event => update('cityId', event.currentTarget.value as FreelancerProfileInput['cityId'])}><option value="fr-paris">Paris</option><option value="fr-grenoble">Grenoble</option><option value="fr-mulhouse">Mulhouse</option></select></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/45 sm:col-span-2">Bio<textarea className={field} rows={4} maxLength={1000} value={value.bio} onChange={event => update('bio', event.currentTarget.value)} /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/45 sm:col-span-2">Résumé des services<textarea className={field} rows={3} maxLength={500} value={value.serviceSummary} onChange={event => update('serviceSummary', event.currentTarget.value)} placeholder="Ex. Coupes modernes, barbe et finitions soignées." /></label>
        <label className="text-xs font-bold uppercase tracking-wider text-white/45">Langues (séparées par des virgules)<input className={field} value={value.languages.join(', ')} onChange={event => update('languages', list(event.currentTarget.value))} /></label>
        {identityField('publicSlug', 'Identifiant du lien public', value.identity.publicSlug, next => updateIdentity('publicSlug', next), 'amine-fade')}
        {identityField('profileImageUrl', 'Photo de profil (HTTPS)', value.identity.profileImageUrl || '', next => updateIdentity('profileImageUrl', next), 'https://…', 'url')}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-white/40">Le lien peut rester vide pour un brouillon masqué. Sa disponibilité est vérifiée à l’enregistrement.</p>
      <h3 className="mt-6 font-bold">Réseaux et contact public</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{([['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['website', 'Site web'], ['whatsapp', 'WhatsApp (numéro international)']] as const).map(([platform, label]) => identityField(platform, label, value.identity.socialLinks[platform] || '', next => {
        const socialLinks = { ...value.identity.socialLinks };
        if (next) socialLinks[platform] = next; else delete socialLinks[platform];
        update('identity', { ...value.identity, socialLinks });
      }, platform === 'whatsapp' ? '+33612345678' : 'https://…', platform === 'whatsapp' ? 'tel' : 'url'))}</div>
    </section>
  );
}
