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

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return error;
}
