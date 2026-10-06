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

// If sign-in fails, Supabase sends the person back with `error` / `error_description` in the query
// string or the #fragment. We only use that to pick one of OUR fixed messages: the text itself is
// never shown, because anyone can craft a link with any text in it (a phishing trick like
// "Sign-in failed, go to evil-site.com").
export function readAuthError(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  const params = new URLSearchParams(url.search);
  new URLSearchParams(url.hash.replace(/^#/, '')).forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
  const code = `${params.get('error') ?? ''} ${params.get('error_code') ?? ''} ${params.get('error_description') ?? ''}`;
  if (!code.trim()) return null;
  if (/access_denied|cancel/i.test(code)) return 'Sign-in was cancelled.';
  return "Sign-in didn't complete. Please try again.";
}

// Remove the sign-in leftovers (error params) from a URL without touching anything else.
export function stripAuthParams(href, names = ['error', 'error_code', 'error_description', 'tab']) {
  const url = new URL(href);
  names.forEach(n => url.searchParams.delete(n));
  if (/error/.test(url.hash)) url.hash = '';
  return url.pathname + (url.search ? url.search : '') + url.hash;
}
