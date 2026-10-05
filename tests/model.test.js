import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Model } from '../src/model.js';

// Model saves to localStorage; give Node a tiny in-memory one.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};

beforeEach(() => {
  store.clear();
  Model.pins = {};
  Model.settings = { mode: 'system', palette: 'mono' };
});

const add = (dateStr, title, extra = {}) => Model.savePin({ dateStr, title, emoji: '📍', ...extra });
const titles = (dateStr) => (Model.pins[dateStr] ?? []).map(p => p.title);

test('savePin creates sets with default note/time and persists', () => {
  add('2026-10-07', 'A');
  assert.deepEqual(Model.pins['2026-10-07'].map(({ title, note, time }) => ({ title, note, time })), [{ title: 'A', note: '', time: '' }]);
  assert.equal(JSON.parse(store.get('set_app_pins'))['2026-10-07'][0].title, 'A');
});

test('savePin ignores an invalid time instead of storing it', () => {
  add('2026-10-07', 'A', { time: '25:99' });
  assert.equal(Model.pins['2026-10-07'][0].time, '');
});

test('a day is sorted: timed sets first by time, untimed keep insertion order', () => {
  add('2026-10-07', 'untimed 1');
  add('2026-10-07', 'late', { time: '21:00' });
  add('2026-10-07', 'untimed 2');
  add('2026-10-07', 'early', { time: '08:15' });
  add('2026-10-07', 'also 21', { time: '21:00' });
  assert.deepEqual(titles('2026-10-07'), ['early', 'late', 'also 21', 'untimed 1', 'untimed 2']);
});

test('editing keeps id and position rules, and can add a time', () => {
  add('2026-10-07', 'A');
  add('2026-10-07', 'B');
  const idB = Model.pins['2026-10-07'][1].id;
  Model.savePin({ dateStr: '2026-10-07', title: 'B2', emoji: '🌮', note: 'n', time: '07:00' }, { pinId: idB });
  assert.deepEqual(titles('2026-10-07'), ['B2', 'A']);               // now timed, so first
  assert.equal(Model.pins['2026-10-07'][0].id, idB);                  // same id
  assert.equal(Model.pins['2026-10-07'].length, 2);                   // not duplicated
});

test('moving a set to another day keeps its id and cleans up the old day', () => {
  add('2026-10-07', 'Only');
  const id = Model.pins['2026-10-07'][0].id;
  Model.savePin({ dateStr: '2026-10-09', title: 'Only', emoji: '📍' }, { pinId: id, fromDateStr: '2026-10-07' });
  assert.equal('2026-10-07' in Model.pins, false);                    // empty day key removed
  assert.equal(Model.pins['2026-10-09'][0].id, id);
});

test('moving into a day that already has sets sorts it in', () => {
  add('2026-10-09', 'x', { time: '10:00' });
  add('2026-10-07', 'mover', { time: '09:00' });
  const id = Model.pins['2026-10-07'][0].id;
  Model.savePin({ dateStr: '2026-10-09', title: 'mover', emoji: '📍', time: '09:00' }, { pinId: id, fromDateStr: '2026-10-07' });
  assert.deepEqual(titles('2026-10-09'), ['mover', 'x']);
});

test('savePin with an unknown pinId creates a new set rather than losing the edit', () => {
  Model.savePin({ dateStr: '2026-10-07', title: 'ghost', emoji: '📍' }, { pinId: 'nope', fromDateStr: '2026-10-07' });
  assert.deepEqual(titles('2026-10-07'), ['ghost']);
});

test('deletePin returns pin + index; restorePin puts it back in place; empty days vanish', () => {
  add('2026-10-07', 'A');
  add('2026-10-07', 'B');
  const removed = Model.deletePin('2026-10-07', Model.pins['2026-10-07'][0].id);
  assert.deepEqual([removed.pin.title, removed.index], ['A', 0]);
  Model.restorePin('2026-10-07', removed.pin, removed.index);
  assert.deepEqual(titles('2026-10-07'), ['A', 'B']);

  add('2026-10-08', 'solo');
  const solo = Model.deletePin('2026-10-08', Model.pins['2026-10-08'][0].id);
  assert.equal('2026-10-08' in Model.pins, false);
  Model.restorePin('2026-10-08', solo.pin, solo.index);
  assert.deepEqual(titles('2026-10-08'), ['solo']);
  assert.equal(Model.deletePin('2026-10-08', 'nope'), null);
  assert.equal(Model.deletePin('1999-01-01', 'x'), null);
});

test('upcoming skips past days and is sorted by date then time', () => {
  add('2026-09-30', 'older');
  add('2026-10-01', 'past');
  add('2026-10-07', 'B', { time: '20:00' });
  add('2026-10-07', 'A', { time: '09:00' });
  add('2026-10-05', 'today');
  assert.deepEqual(Model.upcoming('2026-10-05').map(x => x.pin.title), ['today', 'A', 'B']);
});

test('search matches title, note and emoji; upcoming first, then past (newest first)', () => {
  add('2026-10-01', 'Gym old', { note: 'leg day' });
  add('2026-09-20', 'Gym older');
  add('2026-10-07', 'Gym soon');
  add('2026-10-09', 'Dinner', { note: 'after the GYM' });
  add('2026-10-10', 'Run', { emoji: '🏃' });
  const T = '2026-10-05';
  assert.deepEqual(Model.search('gym', T).map(x => x.pin.title), ['Gym soon', 'Dinner', 'Gym old', 'Gym older']);
  assert.deepEqual(Model.search('🏃', T).map(x => x.pin.title), ['Run']);
  assert.deepEqual(Model.search('   ', T), []);
  assert.deepEqual(Model.search('zzz', T), []);
});

test('stats: totals, days planned, busiest day (earliest wins a tie)', () => {
  add('2026-10-03', 'a');
  add('2026-10-10', 'b'); add('2026-10-10', 'c');
  add('2026-10-17', 'd'); add('2026-10-17', 'e');
  add('2026-11-01', 'next month');
  assert.deepEqual(Model.stats(2026, 9), { total: 5, daysPlanned: 3, busiest: { dateStr: '2026-10-10', count: 2 } });
  assert.deepEqual(Model.stats(2026, 11), { total: 0, daysPlanned: 0, busiest: null });
});

test('nextSet', () => {
  assert.equal(Model.nextSet('2026-10-05'), null);
  add('2026-10-08', 'x');
  assert.equal(Model.nextSet('2026-10-05').inDays, 3);
});

test('shiftMonth never skips a month (Jan 31 + 1 month)', () => {
  Model.currentDate = new Date(2026, 0, 31);
  const seen = [];
  for (let i = 0; i < 12; i++) { Model.shiftMonth(1); seen.push(Model.currentDate.getMonth() + 1); }
  assert.deepEqual(seen, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1]);
});

test('settings round-trip and ignore unknown values', () => {
  Model.settings = { mode: 'dark', palette: 'ocean' };
  Model.saveSettings();
  Model.settings = { mode: 'system', palette: 'mono' };
  Model.loadSettings();
  assert.deepEqual(Model.settings, { mode: 'dark', palette: 'ocean' });
  store.set('theme', 'sepia'); store.set('palette', 'neon');
  Model.settings = { mode: 'system', palette: 'mono' };
  Model.loadSettings();
  assert.deepEqual(Model.settings, { mode: 'system', palette: 'mono' });
});

test('init loads saved sets, upgrades the very old single-pin format, and sorts by time', () => {
  store.set('set_app_pins', JSON.stringify({
    '2026-10-01': { title: 'legacy', emoji: '🍔' },                       // oldest format: one object per day
    '2026-10-02': [{ id: 'b', title: 'late', emoji: '📍', time: '22:00' }, { id: 'a', title: 'early', emoji: '📍', time: '06:00' }]
  }));
  Model.init();
  assert.equal(Model.pins['2026-10-01'].length, 1);
  assert.ok(Model.pins['2026-10-01'][0].id);
  assert.deepEqual(titles('2026-10-02'), ['early', 'late']);
});
