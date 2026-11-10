export const LEGACY_PRODUCTION_PATHS = [
  'freelancer-preview',
  'client-preview',
  'brand-preview',
  'landing-v2-preview',
  'book',
] as const;

export type LegacyProductionPath = typeof LEGACY_PRODUCTION_PATHS[number];

export function legacyProductionRedirect(path: LegacyProductionPath): '/freelancer' | '/' {
  return path === 'freelancer-preview' ? '/freelancer' : '/';
}
