import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, backupFileName, parseBackup, mergePins, countSets, BACKUP_VERSION } from '../src/backup.js';

const pin = (over = {}) => ({ id: 'a1', title: 'Gym', emoji: '🏀', note: '', time: '', ...over });
const file = (pins, extra = {}) => JSON.stringify({ app: 'set-calendar', version: 1, pins, ...extra });

test('buildBackup is versioned, dated, and a detached copy', () => {
  const pins = { '2026-10-05': [pin()] };
  const backup = buildBackup(pins, new Date('2026-10-05T10:00:00Z'));
  assert.equal(backup.app, 'set-calendar');
  assert.equal(backup.version, BACKUP_VERSION);
  assert.equal(backup.exportedAt, '2026-10-05T10:00:00.000Z');
  backup.pins['2026-10-05'][0].title = 'changed';
  assert.equal(pins['2026-10-05'][0].title, 'Gym');          // original untouched
});

test('backupFileName', () => {
  assert.equal(backupFileName(new Date(2026, 9, 5)), 'set-backup-2026-10-05.json');
  assert.equal(backupFileName(new Date(2026, 0, 9)), 'set-backup-2026-01-09.json');
});

test('export then parse round-trips exactly', () => {
  const pins = { '2026-10-05': [pin({ time: '08:00', note: 'leg day' })], '2026-10-06': [pin({ id: 'b2', title: 'Dinner', emoji: '👨‍👩‍👧' })] };
  const parsed = parseBackup(JSON.stringify(buildBackup(pins)));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.pins, pins);
  assert.equal(parsed.count, 2);
  assert.equal(parsed.skipped, 0);
  assert.equal(countSets(parsed.pins), 2);
});

test('rejects things that are not backups, with a clear message', () => {
  for (const bad of ['not json at all', '', '[1,2,3]', '"hello"', 'null', '42', '{"hello":"world"}', '{}']) {
    const result = parseBackup(bad);
    assert.equal(result.ok, false, `should reject ${JSON.stringify(bad)}`);
    assert.ok(result.error.length > 10);
  }
});

test('rejects a backup from a newer version of the app', () => {
  const result = parseBackup(file({ '2026-10-05': [pin()] }, { version: BACKUP_VERSION + 1 }));
  assert.equal(result.ok, false);
  assert.match(result.error, /newer version/);
});

test('rejects a backup that is valid but empty or all-garbage', () => {
  assert.equal(parseBackup(file({})).ok, false);
  const garbage = parseBackup(file({ '2026-10-05': [null, 5, 'x', {}, { title: '' }, { title: '   ' }, { title: 7 }] }));
  assert.equal(garbage.ok, false);
  assert.match(garbage.error, /No usable sets/);
});

test('skips invalid dates and bad sets but keeps the good ones, and counts what it dropped', () => {
  const result = parseBackup(file({
    '2026-10-05': [pin(), null, { title: 123 }],           // 1 good, 2 bad
    '2026-02-31': [pin({ id: 'x' })],                       // not a real date
    'tomorrow': [pin({ id: 'y' })],                          // not a date at all
    '2026-10-06': 'not an array'                             // wrong shape
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.pins), ['2026-10-05']);
  assert.equal(result.count, 1);
  assert.equal(result.skipped, 5);
});

test('every field is rebuilt and clamped: no unknown fields survive, long text is cut', () => {
  const result = parseBackup(file({ '2026-10-05': [{
    id: 'ok-id_1', title: '  ' + 'T'.repeat(100) + '  ', emoji: 'not an emoji', note: 'N'.repeat(500), time: '25:99',
    admin: true, __proto__: { polluted: true }, constructor: 'x', extra: { deep: 1 }
  }] }));
  const [p] = result.pins['2026-10-05'];
  assert.deepEqual(Object.keys(p).sort(), ['emoji', 'id', 'note', 'time', 'title']);
  assert.equal(p.title.length, 32);
  assert.equal(p.note.length, 120);
  assert.equal(p.emoji, '📍');     // fallback
  assert.equal(p.time, '');        // invalid time dropped
  assert.equal(p.id, 'ok-id_1');
  assert.equal({}.polluted, undefined);   // prototype not polluted
});

test('keeps a real emoji, valid time, and replaces unsafe or missing ids', () => {
  const result = parseBackup(file({ '2026-10-05': [
    { id: 'a/../b', title: 'one', emoji: '🇵🇭', time: '19:30' },
    { title: 'two' },
    { id: 'x'.repeat(200), title: 'three' }
  ] }));
  const [one, two, three] = result.pins['2026-10-05'];
  assert.equal(one.emoji, '🇵🇭');
  assert.equal(one.time, '19:30');
  for (const p of [one, two, three]) assert.match(p.id, /^[\w-]{1,64}$/);   // all got safe ids
  assert.equal(new Set([one.id, two.id, three.id]).size, 3);
});

test('HTML in text is kept as plain text (the UI renders it with textContent)', () => {
  const result = parseBackup(file({ '2026-10-05': [pin({ title: '<img src=x onerror=1>', note: '<script>alert(1)</script>' })] }));
  assert.equal(result.pins['2026-10-05'][0].title, '<img src=x onerror=1>');
});

test('a hostile "__proto__" or "constructor" date key is ignored', () => {
  const result = parseBackup('{"pins":{"__proto__":[{"title":"evil"}],"2026-10-05":[{"title":"fine"}]}}');
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.pins), ['2026-10-05']);
  assert.equal({}.title, undefined);
});

test('accepts a bare { date: [...] } object (older exports)', () => {
  const result = parseBackup(JSON.stringify({ '2026-10-05': [pin()] }));
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
});

test('mergePins adds new sets and never touches existing ones', () => {
  const existing = { '2026-10-05': [pin({ id: 'keep', title: 'Mine' })] };
  const incoming = { '2026-10-05': [pin({ id: 'new1', title: 'Other' })], '2026-10-07': [pin({ id: 'new2', title: 'Far' })] };
  const { pins, added, duplicates } = mergePins(existing, incoming);
  assert.equal(added, 2);
  assert.equal(duplicates, 0);
  assert.deepEqual(pins['2026-10-05'].map(p => p.title), ['Mine', 'Other']);
  assert.deepEqual(existing['2026-10-05'].map(p => p.title), ['Mine']);   // input not mutated
});

test('importing the same file twice does nothing (dedupe by id and by identical content)', () => {
  const incoming = { '2026-10-05': [pin({ id: 'a1' })] };
  const once = mergePins({}, incoming);
  const twice = mergePins(once.pins, incoming);
  assert.equal(twice.added, 0);
  assert.equal(twice.duplicates, 1);
  assert.equal(countSets(twice.pins), 1);

  // same content but a fresh id (e.g. a file with no ids) is still recognized as the same set
  const noIds = parseBackup(file({ '2026-10-05': [{ title: 'Gym', emoji: '🏀' }] }));
  const again = mergePins(once.pins, noIds.pins);
  assert.equal(again.added, 0);

  // same title on a DIFFERENT day is a genuinely different set
  const otherDay = mergePins(once.pins, { '2026-10-06': [pin({ id: 'zz' })] });
  assert.equal(otherDay.added, 1);
});

test('duplicates inside the incoming file itself are collapsed', () => {
  const { added, duplicates } = mergePins({}, { '2026-10-05': [pin({ id: 'd1' }), pin({ id: 'd1' }), pin({ id: 'd2', title: 'Different' })] });
  assert.equal(added, 2);
  assert.equal(duplicates, 1);
});
