export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'website' | 'whatsapp';

export type SocialLinks = Partial<Record<SocialPlatform, string>>;

export interface Branding {
  displayName: string;
  logoUrl?: string;
  primaryColor?: string;
  socialLinks: SocialLinks;
  publicSlug: string;
}

export type LocationBranding = Branding;

export interface FreelancerIdentity {
  profileImageUrl?: string;
  socialLinks: SocialLinks;
  publicSlug: string;
}

const socialLinkKeys = new Set<SocialPlatform>([
  'instagram', 'tiktok', 'facebook', 'website', 'whatsapp',
]);

const socialHosts: Partial<Record<SocialPlatform, Set<string>>> = {
  instagram: new Set(['instagram.com', 'www.instagram.com']),
  tiktok: new Set(['tiktok.com', 'www.tiktok.com']),
  facebook: new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com']),
};

function httpsUrl(value: unknown, field: string, hosts?: Set<string>): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is invalid`);
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${field} is invalid`);
  }
  if (url.protocol !== 'https:' || !url.hostname || (hosts && !hosts.has(url.hostname))) {
    throw new Error(`${field} is invalid`);
  }
  return url.toString();
}

export function normalizePublicSlug(value: string): string {
  const slug = value.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) throw new Error('publicSlug is invalid');
  return slug;
}

export function sanitizeSocialLinks(value: unknown): SocialLinks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('socialLinks is invalid');
  const links = value as Record<string, unknown>;
  if (Object.keys(links).some(key => !socialLinkKeys.has(key as SocialPlatform))) {
    throw new Error('socialLinks is invalid');
  }
  return Object.fromEntries(Object.entries(links).map(([key, link]) => {
    if (key === 'whatsapp') {
      if (typeof link !== 'string' || !/^\+[1-9]\d{7,14}$/.test(link)) {
        throw new Error('socialLinks.whatsapp is invalid');
      }
      return [key, link];
    }
    return [key, httpsUrl(link, `socialLinks.${key}`, socialHosts[key as SocialPlatform])];
  })) as SocialLinks;
}
