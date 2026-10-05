// Sync rules. Pure functions only (no network, no storage, no DOM) so every rule is unit-tested.
// The part that talks to Supabase lives in syncEngine.js.
//
// THE IDEA: we keep two copies of the sets on the device.
//   current = what the person sees and edits (the app's normal data)
//   shadow  = what the server last confirmed it has
// Comparing them tells us exactly what still needs uploading:
//   in current but not (or different) in shadow -> upload it
//   in shadow but gone from current             -> it was deleted here, tell the server
// Because it is a comparison, EVERY kind of change syncs (edit, delete, undo, import, move to
// another day) without each feature having to remember to "mark something dirty".
//
// Both copies use the app's shape: { "YYYY-MM-DD": [ { id, title, emoji, note, time } ] }

import { newId } from './utils.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id) => typeof id === 'string' && UUID_RE.test(id);

export const clone = (pins) => JSON.parse(JSON.stringify(pins ?? {}));

// id -> { dateStr, pin } for quick lookups.
export function indexById(pins) {
  const map = new Map();
  for (const [dateStr, list] of Object.entries(pins ?? {})) {
    for (const pin of list) map.set(pin.id, { dateStr, pin });
  }
  return map;
}

// Two entries are "the same" when everything the server stores matches.
export function samePin(a, b) {
  return a.dateStr === b.dateStr && a.pin.title === b.pin.title && a.pin.emoji === b.pin.emoji &&
    (a.pin.note ?? '') === (b.pin.note ?? '') && (a.pin.time ?? '') === (b.pin.time ?? '');
}

function removeId(pins, id) {
  for (const dateStr of Object.keys(pins)) {
    const kept = pins[dateStr].filter(p => p.id !== id);
    if (kept.length === 0) delete pins[dateStr];
    else if (kept.length !== pins[dateStr].length) pins[dateStr] = kept;
  }
}

// Put a set on a day, removing it from wherever it was (so a moved set never appears twice).
function putPin(pins, dateStr, pin) {
  removeId(pins, pin.id);
  (pins[dateStr] ??= []).push({ ...pin });
}

// ---------- app shape <-> database row ----------

// The database enforces these limits (see the `sets` table); clamp here so one odd local value
// can never make a whole upload fail forever.
export function toRow(dateStr, pin, userId) {
  const title = String(pin.title ?? '').trim().slice(0, 32) || 'Untitled';
  const emoji = typeof pin.emoji === 'string' && pin.emoji && [...pin.emoji].length <= 32 ? pin.emoji : '📍';
  return {
    id: pin.id,
    user_id: userId,
    date: dateStr,
    title,
    emoji,
    note: String(pin.note ?? '').slice(0, 120),
    time: pin.time ? pin.time : null,   // '' -> NULL
    deleted_at: null                    // uploading a set always (re)activates it, which is how Undo works
  };
}

// Postgres returns time as "HH:MM:SS"; the app uses "HH:MM".
export function fromRow(row) {
  return {
    dateStr: row.date,
    pin: { id: row.id, title: row.title, emoji: row.emoji, note: row.note ?? '', time: row.time ? String(row.time).slice(0, 5) : '' }
  };
}

// ---------- preparing local data ----------

// The database id column is a UUID. Sets created on a non-secure page (http://<lan-ip>) got a
// fallback id that is not one, so give those a real UUID before the first upload.
export function normalizeIds(pins) {
  let renamed = 0;
  const out = {};
  for (const [dateStr, list] of Object.entries(pins ?? {})) {
    out[dateStr] = list.map(pin => {
      if (isUuid(pin.id)) return { ...pin };
      renamed += 1;
      return { ...pin, id: makeUuid() };
    });
  }
  return { pins: out, renamed };
}

function makeUuid() {
  const id = newId();
  if (isUuid(id)) return id;
  // No crypto.randomUUID (non-secure origin): build a valid v4 UUID by hand.
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

const fingerprint = (entry) => [entry.dateStr, entry.pin.title, entry.pin.emoji, entry.pin.note ?? '', entry.pin.time ?? ''].join('\u0000');

// First sync on a device: a set that was never uploaded from here, but is identical to one already
// in the account (same day, title, emoji, note, time), is the same set under a different id. Drop
// the local copy so signing in on a second device does not double everything.
export function dropLocalDuplicates(shadow, current, rows) {
  const out = clone(current);
  const shadowIds = indexById(shadow);
  const remoteIds = new Set(rows.map(r => r.id));
  const remotePrints = new Set(rows.filter(r => !r.deleted_at).map(r => fingerprint(fromRow(r))));
  let dropped = 0;
  for (const [id, entry] of indexById(current)) {
    if (shadowIds.has(id) || remoteIds.has(id)) continue;      // already known to the server under this id
    if (remotePrints.has(fingerprint(entry))) { removeId(out, id); dropped += 1; }
  }
  return { current: out, dropped };
}

// ---------- the two directions ----------

// What must be uploaded: { upserts: [{ dateStr, pin }], deletes: [id] }.
export function diff(shadow, current) {
  const s = indexById(shadow);
  const c = indexById(current);
  const upserts = [];
  const deletes = [];
  for (const [id, entry] of c) {
    const known = s.get(id);
    if (!known || !samePin(known, entry)) upserts.push({ dateStr: entry.dateStr, pin: { ...entry.pin } });
  }
  for (const id of s.keys()) {
    if (!c.has(id)) deletes.push(id);
  }
  return { upserts, deletes };
}

export const hasChanges = (d) => d.upserts.length > 0 || d.deletes.length > 0;

// After a successful upload, the shadow now matches what we sent.
export function applyPushed(shadow, pushed) {
  const out = clone(shadow);
  for (const { dateStr, pin } of pushed.upserts) putPin(out, dateStr, pin);
  for (const id of pushed.deletes) removeId(out, id);
  return out;
}

// Apply rows downloaded from the server.
//   - The shadow always takes the server's version (that IS what the server has).
//   - The visible copy takes it too, UNLESS that set has a local change still waiting to upload.
//     Then the local change is kept and wins when it uploads ("last one to reach the server wins").
// Returns new copies plus `changed` = how many sets changed on screen.
export function applyRemote(shadow, current, rows) {
  const nextShadow = clone(shadow);
  const nextCurrent = clone(current);
  let changed = 0;

  for (const row of rows) {
    const s = indexById(nextShadow).get(row.id);
    const c = indexById(nextCurrent).get(row.id);
    // Pending = the visible copy differs from what the server last confirmed for this set.
    const pending = s && c ? !samePin(s, c) : Boolean(s) !== Boolean(c);

    if (row.deleted_at) {
      removeId(nextShadow, row.id);
      if (!pending && c) { removeId(nextCurrent, row.id); changed += 1; }
    } else {
      const remote = fromRow(row);
      putPin(nextShadow, remote.dateStr, remote.pin);
      if (!pending && (!c || !samePin(c, remote))) { putPin(nextCurrent, remote.dateStr, remote.pin); changed += 1; }
    }
  }
  return { shadow: nextShadow, current: nextCurrent, changed };
}

// ---------- "what changed since I last looked?" ----------

// The newest server timestamp we have seen; the next download asks for anything after it.
export function nextCursor(cursor, rows) {
  let max = cursor ?? null;
  for (const row of rows) {
    if (!max || new Date(row.updated_at) > new Date(max)) max = row.updated_at;
  }
  return max;
}

// Ask from slightly BEFORE the cursor. The server stamps a row when its request starts, and two
// requests can finish in the opposite order they started, so a row could carry a stamp just older
// than one we already saw. Re-downloading a few seconds is harmless (applying a row twice changes nothing).
export function cursorWithMargin(cursor, marginMs = 5000) {
  if (!cursor) return null;
  return new Date(new Date(cursor).getTime() - marginMs).toISOString();
}
