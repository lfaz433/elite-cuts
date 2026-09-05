const MAIN_DOMAIN = import.meta.env.VITE_MAIN_DOMAIN?.trim().toLowerCase() || '';

export const PLATFORM_TENANT = {
  tenantId: 'platform',
  subdomain: 'elite-cuts-default',
  name: 'Barberboard Platform',
  branding: { primaryColor: '#D4AF37', logoUrl: '', businessName: 'Barberboard' },
  subscription: {
    status: 'active' as const,
    planId: 'pro',
    trialEndsAt: 0,
    currentPeriodEnd: 0,
  },
  settings: { maxBarbersLimit: 100, allowOnlineBooking: true },
  onboardingComplete: true,
};

export function extractSubdomain(hostname: string): string {
  const normalizedHost = hostname.trim().toLowerCase();
  if (
    normalizedHost === 'localhost' ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost.endsWith('.vercel.app') ||
    (MAIN_DOMAIN !== '' && (
      normalizedHost === MAIN_DOMAIN || normalizedHost === `www.${MAIN_DOMAIN}`
    ))
  ) {
    return 'elite-cuts-default';
  }
  if (MAIN_DOMAIN !== '' && normalizedHost.endsWith(`.${MAIN_DOMAIN}`)) {
    return normalizedHost.slice(0, -(MAIN_DOMAIN.length + 1)).split('.').pop() || 'elite-cuts-default';
  }
  return 'elite-cuts-default';
}

export async function loadTenantForHost<T>(
  hostname: string,
  findTenant: (subdomain: string) => Promise<T | null>,
  isDevelopment = import.meta.env.DEV,
): Promise<T | typeof PLATFORM_TENANT | null> {
  const normalizedHost = hostname.trim().toLowerCase();
  if (isDevelopment && (normalizedHost === 'localhost' || normalizedHost === '127.0.0.1')) {
    return PLATFORM_TENANT;
  }

  return findTenant(extractSubdomain(normalizedHost));
}
