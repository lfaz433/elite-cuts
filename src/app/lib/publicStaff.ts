const CREDENTIAL_FIELD = /password|credential/i;
const PUBLIC_BUSINESS_INFO_FIELDS = new Set([
  'name', 'address', 'phone', 'email', 'adminEmail', 'hours', 'weeklyHours',
  'socials', 'instagram', 'tiktok', 'facebook', 'website', 'mapUrl', 'latitude',
  'longitude', 'logo', 'heroImage', 'heroTitle', 'heroSubtitle', 'heroButtonText',
  'showStatsSection', 'stats', 'timezone', 'bookingPolicy',
]);
const WEEK_DAYS = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key === 'publicCredentialSafe' || !CREDENTIAL_FIELD.test(key))
      .map(([key, child]) => [key, scrubValue(child)]),
  );
}

function withoutCredentialFields<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return scrubValue(value) as Record<string, unknown>;
}

export function sanitizeBarberCreate<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  const safe = withoutCredentialFields(value);
  return {
    ...safe,
    ...(typeof safe.email === 'string'
      ? { email: safe.email.trim().toLowerCase() }
      : {}),
    publicCredentialSafe: true,
  };
}

export function sanitizeBarberUpdate<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return sanitizeBarberCreate(value);
}

export function sanitizeBusinessInfo<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  const safe = withoutCredentialFields(value);
  const output = Object.fromEntries(
    Object.entries(safe).filter(([key]) => PUBLIC_BUSINESS_INFO_FIELDS.has(key)),
  );

  function pickObjectFields(raw: unknown, allowed: Set<string>): unknown {
    if (!isPlainRecord(raw)) return raw;
    return Object.fromEntries(Object.entries(raw).filter(([key]) => allowed.has(key)));
  }

  if ('hours' in output) {
    output.hours = pickObjectFields(output.hours, new Set(['weekdays', 'weekends']));
  }
  if ('socials' in output) {
    output.socials = pickObjectFields(output.socials, new Set(['instagram', 'facebook']));
  }
  if ('weeklyHours' in output) {
    const weeklyHours = pickObjectFields(output.weeklyHours, WEEK_DAYS);
    output.weeklyHours = isPlainRecord(weeklyHours)
      ? Object.fromEntries(Object.entries(weeklyHours).map(([day, hours]) => [
        day,
        pickObjectFields(hours, new Set(['isOpen', 'open', 'close'])),
      ]))
      : weeklyHours;
  }
  if (Array.isArray(output.stats)) {
    output.stats = output.stats.map(stat => (
      pickObjectFields(stat, new Set(['id', 'label', 'value', 'enabled']))
    ));
  }

  return { ...output, publicCredentialSafe: true };
}
