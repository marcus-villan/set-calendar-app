import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isUuid, indexById, samePin, toRow, fromRow, normalizeIds, dropLocalDuplicates,
  diff, hasChanges, applyPushed, applyRemote, nextCursor, cursorWithMargin
} from '../src/sync.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const pin = (id, over = {}) => ({ id, title: 'Gym', emoji: '🏀', note: '', time: '', ...over });
const row = (id, over = {}) => ({ id, date: '2026-10-05', title: 'Gym', emoji: '🏀', note: '', time: null, updated_at: '2026-10-05T10:00:00.000Z', deleted_at: null, ...over });
const titles = (pins) => Object.fromEntries(Object.entries(pins).map(([d, list]) => [d, list.map(p => p.title)]));

// A tiny fake server + two devices, to test whole conversations between them.
function makeServer() {
  const rows = new Map();
  let clock = Date.parse('2026-10-05T10:00:00.000Z');
  return {
    rows,
    push(d) {
      for (const { dateStr, pin: p } of d.upserts) rows.set(p.id, { ...toRow(dateStr, p, USER), updated_at: new Date(clock += 1000).toISOString() });
      for (const id of d.deletes) if (rows.has(id)) rows.set(id, { ...rows.get(id), deleted_at: new Date(clock).toISOString(), updated_at: new Date(clock += 1000).toISOString() });
    },
    since(cursor) {
      return [...rows.values()].filter(r => !cursor || new Date(r.updated_at) > new Date(cursor)).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    }
  };
}
function makeDevice(pins = {}) { return { shadow: {}, current: pins, cursor: null, first: true }; }
function sync(device, server) {
  const rows = server.since(cursorWithMargin(device.cursor));
  if (device.first) { device.current = dropLocalDuplicates(device.shadow, device.current, rows).current; device.first = false; }
  ({ shadow: device.shadow, current: device.current } = applyRemote(device.shadow, device.current, rows));
  const d = diff(device.shadow, device.current);
  server.push(d);
  device.shadow = applyPushed(device.shadow, d);
  device.cursor = nextCursor(device.cursor, rows);
}

test('isUuid', () => {
  assert.equal(isUuid(A), true);
  assert.equal(isUuid('mgk3f2a1-x9z8'), false);   // the fallback id made on http:// pages
  assert.equal(isUuid(''), false);
  assert.equal(isUuid(undefined), false);
});

test('toRow / fromRow round-trip, including the time format and empty time', () => {
  const r = toRow('2026-10-09', pin(A, { title: 'Movie', emoji: '🎬', note: 'Row F', time: '19:30' }), USER);
  assert.deepEqual(r, { id: A, user_id: USER, date: '2026-10-09', title: 'Movie', emoji: '🎬', note: 'Row F', time: '19:30', deleted_at: null });
  assert.equal(toRow('2026-10-09', pin(A), USER).time, null);                       // '' -> NULL
  assert.deepEqual(fromRow({ ...r, time: '19:30:00' }), { dateStr: '2026-10-09', pin: { id: A, title: 'Movie', emoji: '🎬', note: 'Row F', time: '19:30' } });
  assert.equal(fromRow({ ...r, time: null }).pin.time, '');
});

test('toRow clamps to the database limits so one odd value cannot block every upload', () => {
  const r = toRow('2026-10-09', pin(A, { title: 'x'.repeat(50), note: 'n'.repeat(300), emoji: '' }), USER);
  assert.equal(r.title.length, 32);
  assert.equal(r.note.length, 120);
  assert.equal(r.emoji, '📍');
  assert.equal(toRow('2026-10-09', pin(A, { title: '   ' }), USER).title, 'Untitled');
  assert.equal(toRow('2026-10-09', pin(A, { emoji: '👨‍👩‍👧' }), USER).emoji, '👨‍👩‍👧');   // multi-part emoji is fine
});

test('normalizeIds gives non-UUID ids a real UUID and leaves the rest alone', () => {
  const { pins, renamed } = normalizeIds({ '2026-10-05': [pin(A), pin('mgk3f2a1-x9z8', { title: 'Old id' })] });
  assert.equal(renamed, 1);
  assert.equal(pins['2026-10-05'][0].id, A);
  assert.equal(isUuid(pins['2026-10-05'][1].id), true);
  assert.equal(pins['2026-10-05'][1].title, 'Old id');
});

test('diff: new, edited, moved and deleted sets', () => {
  const shadow = { '2026-10-05': [pin(A), pin(B, { title: 'Dinner' })], '2026-10-06': [pin(C, { title: 'Run' })] };
  assert.equal(hasChanges(diff(shadow, shadow)), false);

  const current = { '2026-10-05': [pin(A, { title: 'Gym edited' })], '2026-10-07': [pin(C, { title: 'Run' })] };   // A edited, B deleted, C moved
  const d = diff(shadow, current);
  assert.deepEqual(d.upserts.map(u => [u.dateStr, u.pin.id]).sort(), [['2026-10-05', A], ['2026-10-07', C]]);
  assert.deepEqual(d.deletes, [B]);
  assert.equal(hasChanges(d), true);
});

test('diff ignores things the server does not store (array order, missing note/time fields)', () => {
  const shadow = { '2026-10-05': [pin(A), pin(B)] };
  const current = { '2026-10-05': [{ id: B, title: 'Gym', emoji: '🏀' }, pin(A)] };   // reordered, old pin without note/time
  assert.equal(hasChanges(diff(shadow, current)), false);
});

test('applyPushed makes the shadow match what was sent', () => {
  const shadow = { '2026-10-05': [pin(A), pin(B)] };
  const current = { '2026-10-05': [pin(A, { title: 'New' })], '2026-10-08': [pin(C)] };
  const next = applyPushed(shadow, diff(shadow, current));
  assert.equal(hasChanges(diff(next, current)), false);
  assert.deepEqual(shadow, { '2026-10-05': [pin(A), pin(B)] });   // input not mutated
});

test('applyRemote: new, changed, moved and deleted rows update both copies', () => {
  const start = { '2026-10-05': [pin(A), pin(B)] };
  const { shadow, current, changed } = applyRemote(start, start, [
    row(A, { title: 'Gym v2' }),                 // changed
    row(B, { deleted_at: '2026-10-05T11:00:00Z' }),   // deleted elsewhere
    row(C, { date: '2026-10-09', title: 'New one', time: '07:15:00' })   // new
  ]);
  assert.deepEqual(titles(current), { '2026-10-05': ['Gym v2'], '2026-10-09': ['New one'] });
  assert.deepEqual(current, shadow);
  assert.equal(current['2026-10-09'][0].time, '07:15');
  assert.equal(changed, 3);
  assert.deepEqual(titles(start), { '2026-10-05': ['Gym', 'Gym'] });   // inputs not mutated
});

test('applyRemote is idempotent: the same rows twice change nothing the second time', () => {
  const rows = [row(A, { title: 'Gym v2' }), row(C, { date: '2026-10-09' })];
  const once = applyRemote({}, {}, rows);
  const twice = applyRemote(once.shadow, once.current, rows);
  assert.equal(twice.changed, 0);
  assert.deepEqual(twice.current, once.current);
});

test('applyRemote moves a set between days without duplicating it', () => {
  const start = { '2026-10-05': [pin(A)] };
  const { current } = applyRemote(start, start, [row(A, { date: '2026-10-12' })]);
  assert.deepEqual(titles(current), { '2026-10-12': ['Gym'] });
});

test('a local change that has not uploaded yet is NOT overwritten by a download', () => {
  const shadow = { '2026-10-05': [pin(A)] };
  const current = { '2026-10-05': [pin(A, { title: 'My offline edit' })] };
  const r = applyRemote(shadow, current, [row(A, { title: 'Edited on other device' })]);
  assert.equal(r.current['2026-10-05'][0].title, 'My offline edit');      // kept on screen
  assert.equal(r.shadow['2026-10-05'][0].title, 'Edited on other device'); // shadow = what the server has
  assert.equal(r.changed, 0);
  assert.deepEqual(diff(r.shadow, r.current).upserts.map(u => u.pin.title), ['My offline edit']);   // and it will upload
});

test('local delete vs remote edit: the local delete is kept and still uploads', () => {
  const shadow = { '2026-10-05': [pin(A)] };
  const r = applyRemote(shadow, {}, [row(A, { title: 'Edited elsewhere' })]);
  assert.deepEqual(r.current, {});
  assert.deepEqual(diff(r.shadow, r.current).deletes, [A]);
});

test('local edit vs remote delete: the edit is kept and re-uploads (which revives it)', () => {
  const shadow = { '2026-10-05': [pin(A)] };
  const current = { '2026-10-05': [pin(A, { title: 'Still want this' })] };
  const r = applyRemote(shadow, current, [row(A, { deleted_at: '2026-10-05T11:00:00Z' })]);
  assert.equal(r.current['2026-10-05'][0].title, 'Still want this');
  const d = diff(r.shadow, r.current);
  assert.deepEqual(d.upserts.map(u => u.pin.id), [A]);
  assert.equal(toRow(d.upserts[0].dateStr, d.upserts[0].pin, USER).deleted_at, null);
});

test('a deleted row we never had is simply ignored', () => {
  const r = applyRemote({}, {}, [row(A, { deleted_at: '2026-10-05T11:00:00Z' })]);
  assert.deepEqual(r.current, {});
  assert.equal(r.changed, 0);
});

test('dropLocalDuplicates: identical content under a different id is dropped; real differences are kept', () => {
  const current = { '2026-10-05': [pin(B), pin(C, { title: 'Only here' })] };       // B looks exactly like the account's A
  const r = dropLocalDuplicates({}, current, [row(A)]);
  assert.equal(r.dropped, 1);
  assert.deepEqual(titles(r.current), { '2026-10-05': ['Only here'] });
  // a deleted row in the account does not count as a duplicate
  assert.equal(dropLocalDuplicates({}, { '2026-10-05': [pin(B)] }, [row(A, { deleted_at: '2026-10-05T11:00:00Z' })]).dropped, 0);
  // same title on another day is a different set
  assert.equal(dropLocalDuplicates({}, { '2026-10-06': [pin(B)] }, [row(A)]).dropped, 0);
});

test('nextCursor / cursorWithMargin', () => {
  assert.equal(nextCursor(null, []), null);
  assert.equal(nextCursor(null, [row(A, { updated_at: '2026-10-05T10:00:05Z' }), row(B, { updated_at: '2026-10-05T10:00:02Z' })]), '2026-10-05T10:00:05Z');
  assert.equal(nextCursor('2026-10-05T12:00:00Z', [row(A, { updated_at: '2026-10-05T10:00:05Z' })]), '2026-10-05T12:00:00Z');   // never goes backwards
  assert.equal(cursorWithMargin(null), null);
  assert.equal(cursorWithMargin('2026-10-05T10:00:10.000Z', 5000), '2026-10-05T10:00:05.000Z');
});

// ---------- whole conversations between two devices ----------

test('SCENARIO phone -> laptop: add, edit, move, delete all arrive', () => {
  const server = makeServer();
  const phone = makeDevice({ '2026-10-05': [pin(A), pin(B, { title: 'Dinner' })] });
  const laptop = makeDevice();
  sync(phone, server); sync(laptop, server);
  assert.deepEqual(titles(laptop.current), { '2026-10-05': ['Gym', 'Dinner'] });

  phone.current = { '2026-10-09': [pin(A, { title: 'Gym moved+edited', time: '18:00' })] };   // A moved+edited, B deleted
  sync(phone, server); sync(laptop, server);
  assert.deepEqual(titles(laptop.current), { '2026-10-09': ['Gym moved+edited'] });
  assert.equal(laptop.current['2026-10-09'][0].time, '18:00');
  assert.equal(server.rows.get(B).deleted_at !== null, true);
});

test('SCENARIO both devices already have sets when they first sign in: union, no duplicates', () => {
  const server = makeServer();
  const phone = makeDevice({ '2026-10-05': [pin(A, { title: 'From phone' })] });
  const laptop = makeDevice({ '2026-10-06': [pin(B, { title: 'From laptop' })] });
  sync(phone, server); sync(laptop, server); sync(phone, server);
  assert.deepEqual(titles(phone.current), { '2026-10-05': ['From phone'], '2026-10-06': ['From laptop'] });
  assert.deepEqual(titles(laptop.current), titles(phone.current));
});

test('SCENARIO the same set typed separately on two devices does not double after sign-in', () => {
  const server = makeServer();
  const safari = makeDevice({ '2026-10-05': [pin(A, { title: 'Dentist', time: '14:00' })] });
  const homeScreenApp = makeDevice({ '2026-10-05': [pin(B, { title: 'Dentist', time: '14:00' })] });   // same thing, different id
  sync(safari, server); sync(homeScreenApp, server); sync(safari, server);
  assert.deepEqual(titles(safari.current), { '2026-10-05': ['Dentist'] });
  assert.deepEqual(titles(homeScreenApp.current), { '2026-10-05': ['Dentist'] });
  assert.equal([...server.rows.values()].filter(r => !r.deleted_at).length, 1);
});

test('SCENARIO offline edits on both devices: the last one to sync wins, and both end up equal', () => {
  const server = makeServer();
  const phone = makeDevice({ '2026-10-05': [pin(A)] });
  const laptop = makeDevice();
  sync(phone, server); sync(laptop, server);

  phone.current = { '2026-10-05': [pin(A, { title: 'Phone version' })] };
  laptop.current = { '2026-10-05': [pin(A, { title: 'Laptop version' })] };
  sync(phone, server);     // phone reaches the server first
  sync(laptop, server);    // laptop reaches it last -> laptop wins
  sync(phone, server);
  assert.equal(phone.current['2026-10-05'][0].title, 'Laptop version');
  assert.equal(laptop.current['2026-10-05'][0].title, 'Laptop version');
});

test('SCENARIO delete then Undo after it already synced: the set comes back everywhere', () => {
  const server = makeServer();
  const phone = makeDevice({ '2026-10-05': [pin(A)] });
  const laptop = makeDevice();
  sync(phone, server); sync(laptop, server);

  phone.current = {};
  sync(phone, server); sync(laptop, server);
  assert.deepEqual(laptop.current, {});

  phone.current = { '2026-10-05': [pin(A)] };      // Undo
  sync(phone, server); sync(laptop, server);
  assert.deepEqual(titles(laptop.current), { '2026-10-05': ['Gym'] });
  assert.equal(server.rows.get(A).deleted_at, null);
});

test('SCENARIO syncing again with nothing new sends nothing', () => {
  const server = makeServer();
  const phone = makeDevice({ '2026-10-05': [pin(A)] });
  sync(phone, server);
  const before = JSON.stringify([...server.rows.values()]);
  sync(phone, server); sync(phone, server);
  assert.equal(JSON.stringify([...server.rows.values()]), before);
});
