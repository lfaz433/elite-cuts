import type { FreelancerProfileInput } from '../../../lib/marketplace/freelancerRecords';

export type FreelancerOnboardingStepId = 'identity' | 'services' | 'availability' | 'publication';

export type FreelancerOnboardingStep = {
  id: FreelancerOnboardingStepId;
  title: string;
  description: string;
  to: string;
  complete: boolean;
};

export function freelancerOnboardingSteps(profile: FreelancerProfileInput): FreelancerOnboardingStep[] {
  const identityComplete = Boolean(profile.displayName.trim() && profile.serviceSummary.trim());
  const servicesComplete = profile.serviceIds.length > 0;
  const enabledModes = (['home', 'chair'] as const).filter(mode => profile.workModes[mode]);
  const availabilityComplete = enabledModes.length > 0
    && enabledModes.every(mode => profile.availabilityByMode[mode].length > 0);
  const publicationComplete = profile.visible && profile.identity.publicSlug.trim().length > 0;

  return [
    { id: 'identity', title: 'Présentez votre activité', description: 'Nom public, ville et résumé des prestations.', to: '/freelancer/settings', complete: identityComplete },
    { id: 'services', title: 'Ajoutez vos services', description: 'Tarifs et durées affichés à vos clients.', to: '/freelancer/services', complete: servicesComplete },
    { id: 'availability', title: 'Ouvrez vos créneaux', description: 'Choisissez les jours, heures et lieux disponibles.', to: '/freelancer/settings#availability', complete: availabilityComplete },
    { id: 'publication', title: 'Publiez votre lien', description: 'Activez la visibilité et choisissez votre identifiant public.', to: '/freelancer/settings', complete: publicationComplete },
  ];
}

export function needsFreelancerOnboarding(profile: FreelancerProfileInput): boolean {
  return freelancerOnboardingSteps(profile).some(step => !step.complete);
}
