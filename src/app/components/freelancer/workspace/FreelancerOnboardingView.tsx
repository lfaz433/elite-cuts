import { ArrowRight, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import type { FreelancerProfileInput } from '../../../lib/marketplace/freelancerRecords';
import { freelancerOnboardingSteps } from './freelancerOnboarding';
import { panelClass, primaryButton, secondaryButton, ViewHeading } from './WorkspaceUI';

export default function FreelancerOnboardingView({ profile }: { profile: FreelancerProfileInput }) {
  const steps = freelancerOnboardingSteps(profile);
  const completeCount = steps.filter(step => step.complete).length;
  const nextStep = steps.find(step => !step.complete);

  return <>
    <ViewHeading
      eyebrow="Votre lancement"
      title="Préparez votre page de réservation"
      description="Créez une expérience fiable avant de partager votre lien : vos clients ne verront votre page que lorsque vous l’aurez réellement publiée."
      action={nextStep ? <Link to={nextStep.to} className={primaryButton}>Continuer la configuration <ArrowRight className="h-4 w-4" /></Link> : null}
    />

    <section className={`${panelClass} border-[#D4AF37]/25 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,.12),transparent_45%)]`} aria-label="Progression de votre lancement">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#E4C76B]">Configuration en cours</p>
          <h2 className="mt-2 text-xl font-semibold">{completeCount} étape{completeCount > 1 ? 's' : ''} sur {steps.length} terminée{completeCount > 1 ? 's' : ''}</h2>
        </div>
        <span className="inline-flex min-h-10 items-center rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-4 text-sm font-semibold text-[#E4C76B]">{Math.round((completeCount / steps.length) * 100)} % prêt</span>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#D4AF37] transition-all" style={{ width: `${(completeCount / steps.length) * 100}%` }} /></div>
    </section>

    <section className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="Étapes de configuration">
      {steps.map((step, index) => <article key={step.id} className={`${panelClass} flex items-start gap-4 ${step.complete ? 'border-emerald-400/20' : ''}`}>
        <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${step.complete ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-white/45'}`} aria-hidden="true">
          {step.complete ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-white/40">Étape {index + 1}</p>
          <h2 className="mt-1 font-semibold">{step.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/50">{step.description}</p>
          <Link to={step.to} className={`${step.complete ? secondaryButton : 'text-[#E4C76B]'} mt-4 inline-flex items-center gap-2 text-sm font-semibold`}>
            {step.complete ? 'Modifier' : 'Configurer'} {!step.complete && <ArrowRight className="h-4 w-4" />}
          </Link>
        </div>
      </article>)}
    </section>

    <section className={`${panelClass} mt-6 border-dashed text-center`}>
      <Sparkles aria-hidden="true" className="mx-auto h-5 w-5 text-[#D4AF37]" />
      <h2 className="mt-3 font-semibold">Commencez avec une base réelle</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/50">Aucun client ni rendez-vous n’est créé automatiquement. Une fois vos créneaux publiés, vos premières demandes arriveront dans l’onglet Réservations.</p>
      <Link to="/freelancer/settings#availability" className={`${secondaryButton} mt-5`}>Définir mes disponibilités <ArrowRight className="h-4 w-4" /></Link>
    </section>
  </>;
}
