// Logic for the "Add to Home Screen" prompt. Pure functions: every input is passed in, so they
// can be tested without a browser.
//
// Why this is more than one button: browsers disagree.
//   - Chrome / Edge / Android: the page gets a `beforeinstallprompt` event and can open the
//     browser's own install dialog.
//   - iPhone / iPad (Safari, and every other iOS browser): there is NO API. The only way is for the
//     user to tap Share > Add to Home Screen, so all we can do is show them how.

// iPadOS 13+ reports itself as a Mac, so a "Mac" with a touch screen is really an iPad.
export function isIOSDevice({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

// True when the page is already running as an installed app (no browser bars).
// `navigator.standalone` is iOS-only; `(display-mode: standalone)` covers everything else.
export function isStandalone({ navigatorStandalone = false, displayModeStandalone = false } = {}) {
  return navigatorStandalone === true || displayModeStandalone === true;
}

export const DISMISS_MS = 30 * 24 * 60 * 60 * 1000; // after "x", stay quiet for 30 days

export function wasRecentlyDismissed(dismissedAt, now) {
  const time = Number(dismissedAt);
  return Number.isFinite(time) && time > 0 && now - time < DISMISS_MS;
}

// How can we help this visitor install?
//   'installed' = nothing to do      'prompt' = the browser can show its own dialog
//   'ios'       = show the Share steps  'manual' = no API, give generic directions
export function installMode({ installed = false, canPrompt = false, ios = false } = {}) {
  if (installed) return 'installed';
  if (canPrompt) return 'prompt';
  if (ios) return 'ios';
  return 'manual';
}

// The banner is a nudge, so it only appears when we can really help (prompt / ios), after the
// person has made at least one set (they have something worth keeping), and not right after
// they said no.
export function shouldShowBanner({ mode, setCount = 0, dismissedAt = null, now = Date.now() } = {}) {
  return (mode === 'prompt' || mode === 'ios') && setCount >= 1 && !wasRecentlyDismissed(dismissedAt, now);
}
