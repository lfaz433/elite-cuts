import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  sanitizeBarberCreate,
  sanitizeBarberUpdate,
  sanitizeBusinessInfo,
} from './publicStaff';

test('public staff write payloads discard every legacy credential field', () => {
  const source = {
    name: 'Samira',
    email: ' SAMIRA@EXAMPLE.COM ',
    password: 'plaintext',
    adminPassword: 'also-plaintext',
    credentials: { temporaryPassword: 'plaintext' },
    metadata: { passwordHint: 'also-private', publicNote: 'visible' },
  };

  assert.deepEqual(sanitizeBarberCreate(source), {
    name: 'Samira',
    email: 'samira@example.com',
    metadata: { publicNote: 'visible' },
    publicCredentialSafe: true,
  });
  assert.deepEqual(sanitizeBarberUpdate(source), {
    name: 'Samira',
    email: 'samira@example.com',
    metadata: { publicNote: 'visible' },
    publicCredentialSafe: true,
  });
  assert.deepEqual(sanitizeBusinessInfo(source), {
    name: 'Samira',
    email: ' SAMIRA@EXAMPLE.COM ',
    publicCredentialSafe: true,
  });
});

test('business info payload keeps only the exact public schema at every nesting level', () => {
  const source = {
    name: 'Salon sûr',
    bookingPolicy: 'automatic',
    branding: { credentials: { secret: 'plaintext' } },
    hours: {
      weekdays: '09:00 - 19:00',
      weekends: 'Fermé',
      displayHint: 'legacy-only',
    },
    weeklyHours: {
      monday: {
        isOpen: true,
        open: '09:00',
        close: '19:00',
        workerCredential: 'plaintext',
        note: 'legacy-only',
      },
      holiday: { isOpen: false, open: '', close: '' },
    },
    stats: [{
      id: 'rating',
      label: 'Note',
      value: '4.9',
      enabled: true,
      temporaryPassword: 'plaintext',
      style: 'legacy-only',
    }],
  };

  assert.deepEqual(sanitizeBusinessInfo(source), {
    name: 'Salon sûr',
    bookingPolicy: 'automatic',
    hours: { weekdays: '09:00 - 19:00', weekends: 'Fermé' },
    weeklyHours: {
      monday: { isOpen: true, open: '09:00', close: '19:00' },
    },
    stats: [{ id: 'rating', label: 'Note', value: '4.9', enabled: true }],
    publicCredentialSafe: true,
  });
});
