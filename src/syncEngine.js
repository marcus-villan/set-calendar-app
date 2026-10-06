// The part of sync that touches the network and storage. All the decisions live in sync.js
// (pure + tested); this file only fetches, saves, and calls those functions in the right order.

import {
  normalizeIds, dropLocalDuplicates, diff, hasChanges, applyPushed, applyRemote,
  nextCursor, cursorWithMargin, toRow
} from './sync.js';

const SHADOW_KEY = 'set_app_shadow';   // what the server last confirmed (see sync.js)
const STATE_KEY = 'set_app_sync';      // { userId, cursor, lastSyncedAt }
const COLUMNS = 'id,date,title,emoji,note,time,updated_at,deleted_at';
const PAGE = 1000;                     // rows per download request
const BATCH = 500;                     // rows per upload request
const RETRY_MS = 30000;

const EMPTY_STATE = { userId: null, cursor: null, lastSyncedAt: null };

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { console.error('Failed to save sync state', err); }
}

// client: the Supabase client (passed in, so tests can use a fake one).
// getPins(): the app's current sets.  setPins(pins): replace them and re-render.
// onStatus({ state: 'idle'|'syncing'|'synced'|'offline'|'error', at, message })
export function createSyncEngine({ client, getPins, setPins, onStatus }) {
  const supabase = client;
  let user = null;
  let running = false;
  let again = false;       // a change arrived while a sync was running: go once more afterwards
  let applying = false;    // we are writing downloaded sets into the app (not a user change)
  let timer = null;

  const setStatus = (status) => onStatus({ at: load(STATE_KEY, EMPTY_STATE).lastSyncedAt, message: '', ...status });

  async function pull(since) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabase.from('sets').select(COLUMNS).eq('user_id', user.id)
        .order('updated_at', { ascending: true }).order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (since) query = query.gt('updated_at', since);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      rows.push(...data);
      if (data.length < PAGE) return rows;
    }
  }

  async function push(changes, userId) {
    const rows = changes.upserts.map(({ dateStr, pin }) => toRow(dateStr, pin, userId));
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from('sets').upsert(rows.slice(i, i + BATCH), { onConflict: 'user_id,id' });
      if (error) throw new Error(error.message);
    }
    // Deletes are marked, not erased, so the other devices learn about them.
    for (let i = 0; i < changes.deletes.length; i += BATCH) {
      const { error } = await supabase.from('sets').update({ deleted_at: new Date().toISOString() })
        .eq('user_id', userId).in('id', changes.deletes.slice(i, i + BATCH));
      if (error) throw new Error(error.message);
    }
  }

  async function runOnce() {
    const me = user;
    let state = load(STATE_KEY, EMPTY_STATE);
    let shadow = load(SHADOW_KEY, {});

    // Sets left on this device by a DIFFERENT account must never be uploaded into this one.
    if (state.userId && state.userId !== me.id) {
      applying = true;
      try { setPins({}); } finally { applying = false; }
      state = EMPTY_STATE;
    }
    const first = !state.userId;   // first sync for this account on this device
    if (first) shadow = {};

    // 1) Download what changed since last time.
    const rows = await pull(cursorWithMargin(state.cursor));
    if (user !== me) return;       // signed out (or switched) while waiting

    // 2) Merge into the LIVE sets in one go (no awaits here), so an edit made while the download
    //    was in flight is never lost.
    let { pins: current, renamed } = normalizeIds(getPins());
    let dropped = 0;
    if (first) ({ current, dropped } = dropLocalDuplicates(shadow, current, rows));
    const merged = applyRemote(shadow, current, rows);
    shadow = merged.shadow;
    current = merged.current;
    if (merged.changed || renamed || dropped) {
      applying = true;
      try { setPins(current); } finally { applying = false; }
    }
    state = { userId: me.id, cursor: nextCursor(state.cursor, rows), lastSyncedAt: state.lastSyncedAt };
    store(SHADOW_KEY, shadow);
    store(STATE_KEY, state);

    // 3) Upload what this device has that the server does not.
    const changes = diff(shadow, current);
    if (hasChanges(changes)) {
      await push(changes, me.id);
      if (user !== me) return;
      shadow = applyPushed(shadow, changes);
      store(SHADOW_KEY, shadow);
    }
    store(STATE_KEY, { ...state, lastSyncedAt: Date.now() });
  }

  // Runs a sync and resolves when it has finished. If one is already running, this asks it to go
  // once more afterwards and returns THAT promise, so "await syncNow()" always means "everything
  // known at the time of the call has been synced (or failed)".
  let inFlight = null;
  function syncNow() {
    clearTimeout(timer);
    if (!user) return Promise.resolve();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus({ state: 'offline' });
      return Promise.resolve();
    }
    if (running) { again = true; return inFlight; }

    running = true;
    inFlight = (async () => {
      setStatus({ state: 'syncing' });
      try {
        do {
          again = false;
          await runOnce();
        } while (again && user);
        if (user) setStatus({ state: 'synced' });
      } catch (err) {
        console.error('Sync failed', err);
        if (user) setStatus({ state: 'error', message: err.message });
        schedule(RETRY_MS);
      } finally {
        running = false;
        again = false;
      }
    })();
    return inFlight;
  }

  function schedule(delay = 1500) {
    clearTimeout(timer);
    timer = setTimeout(syncNow, delay);
    timer.unref?.();   // (Node only) a pending retry must not keep the test process alive
  }

  // True when this device has changes the server has not confirmed.
  function hasPending() {
    if (!user) return false;
    const state = load(STATE_KEY, EMPTY_STATE);
    if (state.userId !== user.id) return Object.keys(getPins()).length > 0;
    return hasChanges(diff(load(SHADOW_KEY, {}), getPins()));
  }

  return {
    syncNow,
    schedule,
    hasPending,
    isSignedIn: () => user !== null,

    // Call when the signed-in person changes (null = signed out).
    setUser(next) {
      if ((next?.id ?? null) === (user?.id ?? null)) return;   // e.g. a token refresh: same person
      user = next;
      again = false;
      clearTimeout(timer);
      if (user) syncNow();
      else setStatus({ state: 'idle' });
    },

    // Call after any change to the sets. Ignores our own writes of downloaded data.
    notifyLocalChange() {
      if (!user || applying) return;
      if (running) { again = true; return; }
      if (hasPending()) schedule();
    },

    // Forget everything about sync on this device (used when signing out).
    reset() {
      clearTimeout(timer);
      again = false;
      try { localStorage.removeItem(SHADOW_KEY); localStorage.removeItem(STATE_KEY); } catch { /* nothing to clear */ }
    }
  };
}
