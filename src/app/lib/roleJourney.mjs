const COMING_SOON_LABELS = {
  en: {
    freelancer: 'Freelance barber profiles are launching soon.',
    client: 'Nearby barber discovery is launching soon.',
  },
  fr: {
    freelancer: 'Les profils de barbiers indépendants arrivent bientôt.',
    client: 'La découverte des barbiers proches arrive bientôt.',
  },
  ar: {
    freelancer: 'ملفات الحلاقين المستقلين ستتوفر قريباً.',
    client: 'اكتشاف الحلاقين القريبين سيتوفر قريباً.',
  },
};

export function getRoleJourney(role, language = 'en') {
  const labels = COMING_SOON_LABELS[language] ?? COMING_SOON_LABELS.en;
  switch (role) {
    case 'brand':
      return { kind: 'navigate', path: '/register?mode=brand' };
    case 'invitation':
      return { kind: 'login' };
    case 'freelancer':
      return { kind: 'navigate', path: '/?login=true&returnTo=%2Ffreelancer&signup=freelancer' };
    case 'client':
      return { kind: 'coming-soon', label: labels.client };
    default:
      throw new Error(`Unknown role journey: ${role}`);
  }
}
