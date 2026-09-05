import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  BOOKING_DRAFT_STORAGE_KEY,
  clearBookingDraft,
  loadBookingDraft,
  saveBookingDraft,
} from './bookingDraft';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const draft = {
  selectedServiceId: 'service-a',
  selectedBarberId: 'any',
  selectedDate: '2099-09-05',
  selectedTime: '10:30',
  clientInfo: { name: 'Ada Client', email: 'ada@example.test', phone: '+213555000000' },
};

test('booking draft survives login only for the salon that created it', () => {
  const storage = new MemoryStorage();
  saveBookingDraft(storage, 'location-a', draft);

  assert.deepEqual(loadBookingDraft(storage, 'location-a'), draft);
  assert.equal(loadBookingDraft(storage, 'location-b'), null);
  clearBookingDraft(storage);
  assert.equal(loadBookingDraft(storage, 'location-a'), null);
});

test('invalid or credential-bearing stored booking data is discarded', () => {
  const storage = new MemoryStorage();
  storage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify({
    tenantId: 'location-a',
    ...draft,
    password: 'must-not-survive',
  }));

  assert.equal(loadBookingDraft(storage, 'location-a'), null);
  assert.equal(storage.getItem(BOOKING_DRAFT_STORAGE_KEY), null);
});
