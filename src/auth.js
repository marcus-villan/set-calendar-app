import { supabase } from './supabase.js';

export async function getUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

// cb(user | null) runs once at start and again whenever someone signs in, out, or the session refreshes.
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

// Sends the browser to Google and back. `?tab=settings` makes the app reopen on the Settings screen afterwards.
export async function signInWithGoogle() {
  const redirectTo = new URL(`${import.meta.env.BASE_URL}?tab=settings`, location.origin).href;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  return error;
}

// Clears the session on THIS device only, without asking the server (used after the account itself
// was deleted, when the server no longer knows the session).
export async function signOutLocal() {
  await supabase.auth.signOut({ scope: 'local' });
}

// Asks the server function to delete the signed-in account and all of its sets. The function reads
// WHO to delete from the verified login token, never from what we send (see
// supabase/functions/delete-account/index.ts).
export async function deleteAccount() {
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
  return error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return error;
}
