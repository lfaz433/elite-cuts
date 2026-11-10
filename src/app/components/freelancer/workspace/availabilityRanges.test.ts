import assert from 'node:assert/strict';
import test from 'node:test';
import { groupAvailabilitySlots, hasOverlappingAvailability, isHalfHourTime, rangeSlots } from './availabilityRanges.ts';

test('creates client booking slots every thirty minutes inside a selected range', () => {
  assert.deepEqual(rangeSlots('2099-01-15', '09:00', '10:30'), [
    '2099-01-15T09:00',
    '2099-01-15T09:30',
    '2099-01-15T10:00',
  ]);
});

test('recognizes times outside the standard thirty-minute booking grid', () => {
  assert.equal(isHalfHourTime('09:15'), false);
  assert.equal(isHalfHourTime('09:30'), true);
});

test('preserves a legacy off-grid range while it is being edited', () => {
  assert.deepEqual(rangeSlots('2099-01-15', '09:15', '10:15'), [
    '2099-01-15T09:15',
    '2099-01-15T09:45',
  ]);
});

test('detects a legacy slot that overlaps a new range in another mode', () => {
  assert.equal(hasOverlappingAvailability(
    ['2099-01-15T09:00', '2099-01-15T09:30'],
    ['2099-01-15T09:15'],
  ), true);
});

test('allows midnight as the closing time of the selected day', () => {
  assert.deepEqual(rangeSlots('2099-01-15', '23:30', '00:00'), [
    '2099-01-15T23:30',
  ]);
});

test('does not generate a booking start that does not exist in Paris time', () => {
  assert.deepEqual(rangeSlots('2026-03-29', '01:30', '03:00'), [
    '2026-03-29T01:30',
  ]);
});

test('groups consecutive slots into a single editable availability range', () => {
  assert.deepEqual(groupAvailabilitySlots([
    '2099-01-15T09:00',
    '2099-01-15T09:30',
    '2099-01-15T10:00',
    '2099-01-15T14:00',
  ]), [
    { id: '2099-01-15T09:00', date: '2099-01-15', start: '09:00', end: '10:30', slots: ['2099-01-15T09:00', '2099-01-15T09:30', '2099-01-15T10:00'] },
    { id: '2099-01-15T14:00', date: '2099-01-15', start: '14:00', end: '14:30', slots: ['2099-01-15T14:00'] },
  ]);
});

test('keeps slots on different dates as separate editable ranges', () => {
  assert.deepEqual(groupAvailabilitySlots([
    '2099-01-15T23:30',
    '2099-01-16T00:00',
  ]).map(range => [range.date, range.start, range.end]), [
    ['2099-01-15', '23:30', '00:00'],
    ['2099-01-16', '00:00', '00:30'],
  ]);
});
