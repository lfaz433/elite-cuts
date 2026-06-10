export const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'superadmin', 'super-admin', 
  'dashboard', 'billing', 'register', 'login', 'auth', 'mail', 
  'ftp', 'cdn', 'assets', 'static', 'demo', 'barberboard-demo', 
  'status', 'docs', 'support', 'help', 'blog', 'staging', 'test',
  'localhost', 'barberboard', 'elite-cuts'
]);

/**
 * Validates a requested subdomain format and checks against reserved words.
 * Returns an error string if invalid, or null if valid.
 */
export function validateSubdomain(subdomain: string): string | null {
  if (!subdomain) {
    return 'Veuillez entrer un sous-domaine.';
  }

  // Format: lowercase, 3-63 chars, no leading/trailing/double hyphens, no uppercase, no spaces
  const regex = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;
  
  if (subdomain.length < 3 || subdomain.length > 63) {
    return 'Le sous-domaine doit comporter entre 3 et 63 caractères.';
  }

  if (subdomain !== subdomain.toLowerCase()) {
    return 'Le sous-domaine doit être en minuscules.';
  }

  if (subdomain.includes('--')) {
    return 'Le sous-domaine ne peut pas contenir de tirets consécutifs (--).';
  }

  if (!regex.test(subdomain)) {
    return 'Format invalide : uniquement des lettres minuscules, chiffres et tirets (pas de tiret au début ou à la fin).';
  }

  if (RESERVED_SUBDOMAINS.has(subdomain)) {
    return 'Ce sous-domaine est réservé et ne peut pas être utilisé.';
  }

  return null;
}
