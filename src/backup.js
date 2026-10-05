// Backup file format + safe import. Pure functions (no DOM, no storage) so they are easy to test.
//
// A backup is plain JSON:
//   { "app": "set-calendar", "version": 1, "exportedAt": "<ISO time>", "pins": { "2026-10-05": [ { id, title, emoji, note, time } ] } }
//
// A backup file is untrusted input (anyone can hand you any file), so parseBackup() rebuilds every
// set from scratch, keeping only known fields and clamping each one. Nothing from the file is ever
// used as-is.

import { isValidDateStr, isValidTime, lastEmoji, newId } from './utils.js';

export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 2_000_000;   // a few thousand sets is well under 1 MB; this just stops absurd files
const MAX_SETS = 20000;
const LIMITS = { title: 32, note: 120, id: 64 };   // title/note match the editor's maxlength

export function buildBackup(pins, now = new Date()) {
  return {
    app: 'set-calendar',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    pins: JSON.parse(JSON.stringify(pins))   // a detached copy
  };
}

export function backupFileName(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `set-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export const countSets = (pins) => Object.values(pins).reduce((n, list) => n + list.length, 0);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Rebuild one set from untrusted data, or return null if it is not usable.
function cleanPin(raw) {
  if (!isPlainObject(raw) || typeof raw.title !== 'string') return null;
  const title = raw.title.trim().slice(0, LIMITS.title);
  if (!title) return null;
  const safeId = typeof raw.id === 'string' && /^[\w-]{1,64}$/.test(raw.id) ? raw.id : newId();
  return {
    id: safeId,
    title,
    emoji: (typeof raw.emoji === 'string' && lastEmoji(raw.emoji)) || '📍',
    note: typeof raw.note === 'string' ? raw.note.trim().slice(0, LIMITS.note) : '',
    time: isValidTime(raw.time) ? raw.time : ''
  };
}

// text -> { ok: true, pins, count, skipped } or { ok: false, error }.
// `skipped` counts sets that were dropped because they were invalid.
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't a Set backup (it isn't valid JSON)." };
  }
  if (!isPlainObject(data)) return { ok: false, error: "That file isn't a Set backup." };
  if (typeof data.version === 'number' && data.version > BACKUP_VERSION) {
    return { ok: false, error: 'That backup was made by a newer version of Set. Update the app and try again.' };
  }

  // Normal backups keep sets under `pins`; also accept a bare { "YYYY-MM-DD": [...] } object.
  const source = isPlainObject(data.pins) ? data.pins : data;
  const dateKeys = Object.keys(source).filter(isValidDateStr);
  const looksLikeBackup = isPlainObject(data.pins) || data.app === 'set-calendar' || dateKeys.length > 0;
  if (!looksLikeBackup) return { ok: false, error: "That file doesn't look like a Set backup." };

  const pins = {};
  let count = 0;
  let skipped = 0;

  for (const key of Object.keys(source)) {
    const list = source[key];
    const size = Array.isArray(list) ? list.length : 1;
    if (!isValidDateStr(key) || !Array.isArray(list)) { skipped += size; continue; }
    for (const raw of list) {
      if (count >= MAX_SETS) { skipped += 1; continue; }
      const pin = cleanPin(raw);
      if (!pin) { skipped += 1; continue; }
      (pins[key] ??= []).push(pin);
      count += 1;
    }
  }

  if (count === 0) return { ok: false, error: skipped > 0 ? 'No usable sets were found in that file.' : 'That backup has no sets in it.' };
  return { ok: true, pins, count, skipped };
}

const fingerprint = (dateStr, pin) => [dateStr, pin.title, pin.emoji, pin.note ?? '', pin.time ?? ''].join('\u0000');

// Adds `incoming` sets to a copy of `existing`. A set is skipped as a duplicate if its id is already
// present anywhere, or an identical set (same day, title, emoji, note, time) already exists, so
// importing the same file twice does nothing. Never removes or changes existing sets.
export function mergePins(existing, incoming) {
  const merged = JSON.parse(JSON.stringify(existing));
  const ids = new Set();
  const seen = new Set();
  for (const [dateStr, list] of Object.entries(merged)) {
    for (const pin of list) { ids.add(pin.id); seen.add(fingerprint(dateStr, pin)); }
  }

  let added = 0;
  let duplicates = 0;
  for (const [dateStr, list] of Object.entries(incoming)) {
    for (const pin of list) {
      const print = fingerprint(dateStr, pin);
      if (ids.has(pin.id) || seen.has(print)) { duplicates += 1; continue; }
      (merged[dateStr] ??= []).push(pin);
      ids.add(pin.id);
      seen.add(print);
      added += 1;
    }
  }
  return { pins: merged, added, duplicates };
}
