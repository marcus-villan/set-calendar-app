import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine } from '../src/syncEngine.js';

// ---- a tiny in-memory localStorage ----
const disk = new Map();
globalThis.localStorage = {
  getItem: (k) => (disk.has(k) ? disk.get(k) : null),
  setItem: (k, v) => disk.set(k, String(v)),
  removeItem: (k) => disk.delete(k),
  clear: () => disk.clear()
};
const setOnline = (value) => Object.defineProperty(globalThis.navigator, 'onLine', { value, configurable: true });

const ALICE = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
const BOB = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pin = (id, over = {}) => ({ id, title: 'Gym', emoji: '🏀', note: '', time: '', ...over });
const titles = (pins) => Object.values(pins).flat().map(p => p.title).sort();

// ---- a fake Supabase: same call shapes the engine uses, backed by a Map ----
function makeServer() {
  const rows = new Map();                       // "user:id" -> row
  let clock = Date.parse('2026-10-05T10:00:00.000Z');
  const stamp = () => new Date(clock += 1000).toISOString();
  const server = {
    rows, calls: [], failNext: null, gate: null,
    live: (userId) => [...rows.values()].filter(r => r.user_id === userId && !r.deleted_at),
    seed(userId, id, over = {}) { rows.set(`${userId}:${id}`, { id, user_id: userId, date: '2026-10-05', title: 'Gym', emoji: '🏀', note: '', time: null, deleted_at: null, updated_at: stamp(), ...over }); },
    async exec(q) {
      server.calls.push(q);
      if (q.op === 'select' && server.gate) await server.gate;        // lets a test act "mid-download"
      if (server.failNext) { const message = server.failNext; server.failNext = null; return { data: null, error: { message } }; }
      if (q.op === 'select') {
        let out = [...rows.values()].filter(r => r.user_id === q.eq.user_id);
        if (q.gt) out = out.filter(r => new Date(r.updated_at) > new Date(q.gt));
        out.sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id));
        return { data: out.slice(q.range[0], q.range[1] + 1).map(r => ({ ...r })), error: null };
      }
      if (q.op === 'upsert') {
        for (const r of q.rows) rows.set(`${r.user_id}:${r.id}`, { ...r, updated_at: stamp() });   // server stamps the time
        return { data: null, error: null };
      }
      if (q.op === 'update') {
        for (const id of q.in) {
          const key = `${q.eq.user_id}:${id}`;
          if (rows.has(key)) rows.set(key, { ...rows.get(key), ...q.patch, updated_at: stamp() });
        }
        return { data: null, error: null };
      }
      throw new Error('unexpected query');
    }
  };
  server.client = {
    from(table) {
      const q = { table, op: null, eq: {} };
      const b = {
        select() { q.op = 'select'; return b; },
        eq(col, val) { q.eq[col] = val; return b; },
        order() { return b; },
        range(from, to) { q.range = [from, to]; return b; },
        gt(_col, val) { q.gt = val; return b; },
        upsert(list) { q.op = 'upsert'; q.rows = list; return b; },
        update(patch) { q.op = 'update'; q.patch = patch; return b; },
        in(_col, vals) { q.in = vals; return b; },
        then(resolve, reject) { return server.exec(q).then(resolve, reject); }
      };
      return b;
    }
  };
  return server;
}

// A "device": its own sets + its own storage, talking to the shared server.
function makeDevice(server, pins = {}) {
  const device = { pins, statuses: [], setPinsCalls: 0 };
  device.engine = createSyncEngine({
    client: server.client,
    getPins: () => device.pins,
    setPins: (next) => { device.pins = next; device.setPinsCalls += 1; device.engine.notifyLocalChange(); },   // the app re-renders, which notifies sync
    onStatus: (s) => device.statuses.push(s.state)
  });
  return device;
}
// Each device needs its own localStorage; swap the shared fake in and out.
async function onDevice(store, fn) { disk.clear(); for (const [k, v] of store) disk.set(k, v); try { return await fn(); } finally { store.clear(); for (const [k, v] of disk) store.set(k, v); } }

beforeEach(() => { disk.clear(); setOnline(true); });

test('first sync uploads the sets already on the device and reports "synced"', async () => {
  const server = makeServer();
  const phone = makeDevice(server, { '2026-10-05': [pin(A), pin(B, { title: 'Dinner', time: '19:30' })] });
  phone.engine.setUser(ALICE);
  await phone.engine.syncNow();
  assert.deepEqual(server.live(ALICE.id).map(r => r.title).sort(), ['Dinner', 'Gym']);
  assert.equal(server.rows.get(`${ALICE.id}:${B}`).time, '19:30');
  assert.equal(phone.statuses.at(-1), 'synced');
  assert.equal(phone.engine.hasPending(), false);
  phone.engine.reset();
});

test('every query is scoped to the signed-in user', async () => {
  const server = makeServer();
  const phone = makeDevice(server, { '2026-10-05': [pin(A)] });
  phone.engine.setUser(ALICE);
  await phone.engine.syncNow();
  phone.pins = {};
  await phone.engine.syncNow();
  for (const q of server.calls) {
    if (q.op === 'upsert') assert.ok(q.rows.every(r => r.user_id === ALICE.id));
    else assert.equal(q.eq.user_id, ALICE.id, `${q.op} must filter by user_id`);
  }
  phone.engine.reset();
});

test('a second device downloads the account, and later changes travel both ways', async () => {
  const server = makeServer();
  const phoneDisk = new Map(), laptopDisk = new Map();
  const phone = makeDevice(server, { '2026-10-05': [pin(A)] });
  const laptop = makeDevice(server);

  await onDevice(phoneDisk, async () => { phone.engine.setUser(ALICE); await phone.engine.syncNow(); });
  await onDevice(laptopDisk, async () => { laptop.engine.setUser(ALICE); await laptop.engine.syncNow(); });
  assert.deepEqual(titles(laptop.pins), ['Gym']);

  laptop.pins = { '2026-10-09': [pin(A, { title: 'Gym (moved on laptop)' })], '2026-10-06': [pin(B, { title: 'New on laptop' })] };
  await onDevice(laptopDisk, () => laptop.engine.syncNow());
  await onDevice(phoneDisk, () => phone.engine.syncNow());
  assert.deepEqual(titles(phone.pins), ['Gym (moved on laptop)', 'New on laptop']);
  assert.deepEqual(Object.keys(phone.pins).sort(), ['2026-10-06', '2026-10-09']);
});

test('deleting marks the row deleted (not erased) and the other device removes it', async () => {
  const server = makeServer();
  const phoneDisk = new Map(), laptopDisk = new Map();
  const phone = makeDevice(server, { '2026-10-05': [pin(A)] });
  const laptop = makeDevice(server);
  await onDevice(phoneDisk, async () => { phone.engine.setUser(ALICE); await phone.engine.syncNow(); });
  await onDevice(laptopDisk, async () => { laptop.engine.setUser(ALICE); await laptop.engine.syncNow(); });

  phone.pins = {};
  await onDevice(phoneDisk, () => phone.engine.syncNow());
  const row = server.rows.get(`${ALICE.id}:${A}`);
  assert.ok(row, 'row still exists');
  assert.ok(row.deleted_at, 'and is marked deleted');
  await onDevice(laptopDisk, () => laptop.engine.syncNow());
  assert.deepEqual(laptop.pins, {});
});

test('an edit made WHILE a download is in flight is not lost', async () => {
  const server = makeServer();
  server.seed(ALICE.id, B, { title: 'From the cloud' });
  const phone = makeDevice(server, { '2026-10-05': [pin(A)] });
  phone.engine.setUser(ALICE);          // starts a sync
  await Promise.resolve();

  let release;
  server.gate = new Promise(r => { release = r; });
  const running = phone.engine.syncNow();   // joins/queues behind the first one
  phone.pins = { '2026-10-05': [pin(A, { title: 'Edited mid-sync' })] };   // user edits during the request
  phone.engine.notifyLocalChange();
  server.gate = null; release();
  await running;
  await phone.engine.syncNow();
  await phone.engine.syncNow();

  assert.deepEqual(titles(phone.pins), ['Edited mid-sync', 'From the cloud']);
  assert.equal(server.rows.get(`${ALICE.id}:${A}`).title, 'Edited mid-sync');
  phone.engine.reset();
});

test('downloads more than one page of rows', async () => {
  const server = makeServer();
  for (let i = 0; i < 2300; i++) server.seed(ALICE.id, uuid(i), { title: `Set ${i}`, date: '2026-11-01' });
  const phone = makeDevice(server);
  phone.engine.setUser(ALICE);
  await phone.engine.syncNow();
  assert.equal(Object.values(phone.pins).flat().length, 2300);
  assert.equal(server.calls.filter(q => q.op === 'select').length >= 3, true);   // 1000 + 1000 + 300
  phone.engine.reset();
});

test('uploads in batches', async () => {
  const server = makeServer();
  const list = Array.from({ length: 1200 }, (_, i) => pin(uuid(i), { title: `Set ${i}` }));
  const phone = makeDevice(server, { '2026-11-01': list });
  phone.engine.setUser(ALICE);
  await phone.engine.syncNow();
  assert.equal(server.live(ALICE.id).length, 1200);
  assert.deepEqual(server.calls.filter(q => q.op === 'upsert').map(q => q.rows.length), [500, 500, 200]);
  phone.engine.reset();
});

test('a failed upload reports an error, loses nothing, and succeeds on the next try', async () => {
  const server = makeServer();
  const phone = makeDevice(server);
  phone.engine.setUser(ALICE);
  await phone.engine.syncNow();

  phone.pins = { '2026-10-05': [pin(A)] };
  const originalExec = server.exec;
  server.exec = async (q) => (q.op === 'upsert' ? { data: null, error: { message: 'network down' } } : originalExec(q));
  await phone.engine.syncNow();
  assert.equal(phone.statuses.at(-1), 'error');
  assert.equal(phone.engine.hasPending(), true);
  assert.deepEqual(titles(phone.pins), ['Gym']);          // still on the device
  assert.equal(server.live(ALICE.id).length, 0);

  server.exec = originalExec;
  await phone.engine.syncNow();
  assert.equal(phone.statuses.at(-1), 'synced');
  assert.equal(server.live(ALICE.id).length, 1);
  assert.equal(phone.engine.hasPending(), false);
  phone.engine.reset();
});

test('offline: does not call the server and says so', async () => {
  const server = makeServer();
  const phone = makeDevice(server, { '2026-10-05': [pin(A)] });
  setOnline(false);
  phone.engine.setUser(ALICE);
  await phone.engine.syncNow();
  assert.equal(server.calls.length, 0);
  assert.equal(phone.statuses.at(-1), 'offline');
  setOnline(true);
  await phone.engine.syncNow();
  assert.equal(server.live(ALICE.id).length, 1);
  phone.engine.reset();
});

test("another account's leftover sets are cleared, never uploaded into the new account", async () => {
  const server = makeServer();
  const phone = makeDevice(server, { '2026-10-05': [pin(A, { title: "Alice's private plan" })] });
  phone.engine.setUser(ALICE);
  await phone.engine.syncNow();

  phone.engine.setUser(null);            // session ended without the Sign out button (sets stay on device)
  phone.engine.setUser(BOB);
  await phone.engine.syncNow();
  assert.deepEqual(phone.pins, {});
  assert.equal(server.live(BOB.id).length, 0);
  assert.equal(server.live(ALICE.id).length, 1);   // Alice's data untouched
  phone.engine.reset();
});

test('signing out mid-sync stops it from writing anything afterwards', async () => {
  const server = makeServer();
  server.seed(ALICE.id, A, { title: 'Cloud set' });
  const phone = makeDevice(server);
  let release;
  server.gate = new Promise(r => { release = r; });
  phone.engine.setUser(ALICE);            // sync starts and waits at the gate
  await Promise.resolve();
  phone.engine.setUser(null);             // signs out while waiting
  server.gate = null; release();
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(phone.pins, {});
  assert.equal(phone.setPinsCalls, 0);
  phone.engine.reset();
});

test('signed out: nothing is pending and nothing is sent', async () => {
  const server = makeServer();
  const phone = makeDevice(server, { '2026-10-05': [pin(A)] });
  assert.equal(phone.engine.hasPending(), false);
  phone.engine.notifyLocalChange();
  await phone.engine.syncNow();
  assert.equal(server.calls.length, 0);
});

test('reset() forgets sync state so the next sign-in starts clean', async () => {
  const server = makeServer();
  const phone = makeDevice(server, { '2026-10-05': [pin(A)] });
  phone.engine.setUser(ALICE);
  await phone.engine.syncNow();
  assert.ok(disk.get('set_app_shadow'));
  phone.engine.reset();
  assert.equal(disk.has('set_app_shadow'), false);
  assert.equal(disk.has('set_app_sync'), false);
});
