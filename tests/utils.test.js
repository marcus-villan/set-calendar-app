import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toDateStr, dateToStr, isValidDateStr, daysBetween, relativeDayLabel, weekdayDate,
  groupByRange, isValidTime, formatTime, lastEmoji, longDate, dateLabelWithYear, nextTimeAfter
} from '../src/utils.js';

test('toDateStr / dateToStr zero-pad and use 0-based months', () => {
  assert.equal(toDateStr(2026, 0, 5), '2026-01-05');
  assert.equal(dateToStr(new Date(2026, 9, 5)), '2026-10-05');
});

test('isValidDateStr accepts real dates only', () => {
  assert.equal(isValidDateStr('2026-10-05'), true);
  assert.equal(isValidDateStr('2024-02-29'), true);   // leap day
  assert.equal(isValidDateStr('2026-02-29'), false);  // not a leap year
  assert.equal(isValidDateStr('2026-02-31'), false);
  assert.equal(isValidDateStr('2026-13-01'), false);
  assert.equal(isValidDateStr('2026-1-5'), false);
  assert.equal(isValidDateStr('__proto__'), false);
  assert.equal(isValidDateStr(20261005), false);
});

test('daysBetween counts whole days, across months and years', () => {
  assert.equal(daysBetween('2026-10-05', '2026-10-05'), 0);
  assert.equal(daysBetween('2026-10-05', '2026-10-06'), 1);
  assert.equal(daysBetween('2026-10-05', '2026-11-02'), 28);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(daysBetween('2026-10-05', '2026-10-01'), -4);
});

test('relativeDayLabel', () => {
  const T = '2026-10-05'; // a Monday
  assert.equal(relativeDayLabel('2026-10-05', T), 'Today');
  assert.equal(relativeDayLabel('2026-10-06', T), 'Tomorrow');
  assert.equal(relativeDayLabel('2026-10-09', T), 'Fri');
  assert.equal(relativeDayLabel('2026-10-12', T), 'Oct 12');
  assert.equal(relativeDayLabel('2026-11-02', T), 'Nov 2');
});

test('weekdayDate', () => {
  assert.equal(weekdayDate('2026-10-10'), 'Sat, Oct 10');
});

test('groupByRange buckets items and drops empty groups', () => {
  const T = '2026-10-05';
  const item = (dateStr) => ({ dateStr, pin: { id: dateStr } });
  const groups = groupByRange([item('2026-10-05'), item('2026-10-06'), item('2026-10-08'), item('2026-10-11'), item('2026-10-12'), item('2026-11-30')], T);
  assert.deepEqual(groups.map(g => [g.key, g.items.length]), [['today', 1], ['tomorrow', 1], ['week', 2], ['later', 2]]);
  assert.deepEqual(groupByRange([item('2026-10-20')], T).map(g => g.key), ['later']);
  assert.deepEqual(groupByRange([], T), []);
});

test('isValidTime / formatTime', () => {
  for (const ok of ['00:00', '09:05', '12:00', '23:59']) assert.equal(isValidTime(ok), true, ok);
  for (const bad of ['', '24:00', '9:05', '12:60', 'noon', null, undefined, 1230]) assert.equal(isValidTime(bad), false, String(bad));
  assert.equal(formatTime('00:00'), '12:00 AM');
  assert.equal(formatTime('00:30'), '12:30 AM');
  assert.equal(formatTime('09:05'), '9:05 AM');
  assert.equal(formatTime('12:00'), '12:00 PM');
  assert.equal(formatTime('19:30'), '7:30 PM');
  assert.equal(formatTime('23:59'), '11:59 PM');
  assert.equal(formatTime('nope'), '');
});

test('lastEmoji keeps multi-part emoji whole and the newest one wins', () => {
  assert.equal(lastEmoji('😎'), '😎');
  assert.equal(lastEmoji('😎🍜'), '🍜');
  assert.equal(lastEmoji('hi 🔥'), '🔥');
  assert.equal(lastEmoji('👨‍👩‍👧'), '👨‍👩‍👧');   // ZWJ family stays one emoji
  assert.equal(lastEmoji('👍🏽'), '👍🏽');          // skin tone
  assert.equal(lastEmoji('🇵🇭'), '🇵🇭');          // flag
  assert.equal(lastEmoji('1️⃣'), '1️⃣');           // keycap
  assert.equal(lastEmoji('❤️'), '❤️');
  assert.equal(lastEmoji('abc'), null);
  assert.equal(lastEmoji('123'), null);            // plain digits are not emoji
  assert.equal(lastEmoji(''), null);
});

test('longDate and dateLabelWithYear', () => {
  assert.equal(longDate('2026-10-05'), 'Monday, October 5');
  assert.equal(dateLabelWithYear('2026-10-10', '2026-10-05'), 'Sat, Oct 10');
  assert.equal(dateLabelWithYear('2025-10-10', '2026-10-05'), 'Fri, Oct 10, 2025');   // other year shows the year
});

test('nextTimeAfter finds the next timed set later today', () => {
  const pins = [{ time: '09:00' }, { time: '' }, { time: '18:30' }, { time: '14:00' }];
  assert.equal(nextTimeAfter(pins, '08:00'), '09:00');
  assert.equal(nextTimeAfter(pins, '09:00'), '14:00');   // strictly later
  assert.equal(nextTimeAfter(pins, '15:00'), '18:30');
  assert.equal(nextTimeAfter(pins, '19:00'), null);
  assert.equal(nextTimeAfter([{ time: '' }], '00:00'), null);
  assert.equal(nextTimeAfter([], '00:00'), null);
});
