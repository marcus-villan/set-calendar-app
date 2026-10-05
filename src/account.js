// Pure helpers for the Account section (no network, no DOM), so they are easy to test.

// What to show for a signed-in person. Google gives us a name and photo; fall back gracefully.
export function describeUser(user) {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const email = user.email ?? meta.email ?? '';
  const name = (meta.full_name ?? meta.name ?? '').trim() || email.split('@')[0] || 'Signed in';
  const avatar = typeof (meta.avatar_url ?? meta.picture) === 'string' && /^https:\/\//.test(meta.avatar_url ?? meta.picture)
    ? (meta.avatar_url ?? meta.picture)
    : '';
  return { name, email, avatar };
}

// If sign-in fails, Supabase sends the person back with `error_description` in the query string or the
// #fragment. Returns a short, human message (or null if there was no error).
export function readAuthError(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  const params = new URLSearchParams(url.search);
  new URLSearchParams(url.hash.replace(/^#/, '')).forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
  const description = params.get('error_description') ?? params.get('error');
  if (!description) return null;
  if (/access_denied/i.test(description) || /access_denied/i.test(params.get('error') ?? '')) return 'Sign-in was cancelled.';
  return description.replace(/\+/g, ' ').slice(0, 160);
}

// Remove the sign-in leftovers (error params) from a URL without touching anything else.
export function stripAuthParams(href, names = ['error', 'error_code', 'error_description', 'tab']) {
  const url = new URL(href);
  names.forEach(n => url.searchParams.delete(n));
  if (/error/.test(url.hash)) url.hash = '';
  return url.pathname + (url.search ? url.search : '') + url.hash;
}
