'use strict';

const CREDENTIAL_FIELD = /password|credential/i;
const PUBLIC_BARBER_FIELDS = new Set([
  'name', 'specialty', 'experience', 'rating', 'image', 'shiftStart', 'shiftEnd',
  'workingDays', 'phone', 'email', 'mainServiceId', 'secondaryServiceId', 'archived',
  'commission', 'commissionRate', 'status', 'tenantId', 'locationId', 'brandId',
  'userId', 'uid', 'createdAt', 'updatedAt', 'publicCredentialSafe',
]);

function scrubValue(value) {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (!value || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key === 'publicCredentialSafe' || !CREDENTIAL_FIELD.test(key))
    .map(([key, child]) => [key, scrubValue(child)]));
}

function containsCredentialField(value) {
  if (Array.isArray(value)) return value.some(containsCredentialField);
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.entries(value).some(([key, child]) => (
    (key !== 'publicCredentialSafe' && CREDENTIAL_FIELD.test(key)) || containsCredentialField(child)
  ));
}

function sanitizePublicDocument(value) {
  return { ...scrubValue(value), publicCredentialSafe: true };
}

function sanitizeBarberDocument(value) {
  const safe = sanitizePublicDocument(value);
  return Object.fromEntries(Object.entries(safe).filter(([key]) => PUBLIC_BARBER_FIELDS.has(key)));
}

function needsPublicDocumentScrub(value) {
  return value?.publicCredentialSafe !== true || containsCredentialField(value);
}

module.exports = {
  containsCredentialField,
  needsPublicDocumentScrub,
  sanitizeBarberDocument,
  sanitizePublicDocument,
};
