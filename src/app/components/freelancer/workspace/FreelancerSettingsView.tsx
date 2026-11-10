import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Loader2, Save } from 'lucide-react';
import type { FreelancerProfileInput } from '../../../lib/marketplace/freelancerRecords';
import ProfileSettings from '../ProfileSettings';
import TravelSettings from '../TravelSettings';
import type { IdentityErrors } from './freelancerWorkspacePresentation';
import { ViewHeading, primaryButton } from './WorkspaceUI';

export default function FreelancerSettingsView({ profile, onChange, onSave, saving, errors, saveError }: {
  profile: FreelancerProfileInput; onChange: (value: FreelancerProfileInput) => void; onSave: () => void; saving: boolean; errors: IdentityErrors; saveError: string | null;
}) {
  const { hash } = useLocation();
  useEffect(() => { if (hash === '#availability') document.getElementById('availability')?.focus(); }, [hash]);
  return <form onSubmit={event => { event.preventDefault(); onSave(); }}>
    <ViewHeading eyebrow="Votre configuration" title="Paramètres" description="Complétez votre identité publique, vos disponibilités et les conditions de vos rendez-vous." action={null} />
    {saveError && <p role="alert" className="mb-6 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{saveError} Vos modifications sont conservées. Corrigez les champs puis réessayez.</p>}
    <fieldset disabled={saving} className="min-w-0 space-y-6"><ProfileSettings value={profile} onChange={onChange} errors={errors} /><TravelSettings value={profile} onChange={onChange} /></fieldset>
    <div className="mt-8 flex justify-stretch border-t border-white/10 pt-6 sm:justify-end"><button type="submit" disabled={saving} className={primaryButton + ' w-full sm:w-auto'}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</button></div>
  </form>;
}
