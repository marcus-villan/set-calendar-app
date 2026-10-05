import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIOSDevice, isStandalone, wasRecentlyDismissed, installMode, shouldShowBanner, DISMISS_MS } from '../src/install.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

test('isIOSDevice: iPhone, iPad in desktop mode, and not a real Mac or Android', () => {
  assert.equal(isIOSDevice({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 }), true);
  assert.equal(isIOSDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 }), true);
  assert.equal(isIOSDevice({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5 }), true);    // iPadOS pretending to be a Mac
  assert.equal(isIOSDevice({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 }), false);   // a real Mac
  assert.equal(isIOSDevice({ userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 }), false);
  assert.equal(isIOSDevice(), false);
});

test('isStandalone', () => {
  assert.equal(isStandalone({ navigatorStandalone: true }), true);       // iOS home-screen app
  assert.equal(isStandalone({ displayModeStandalone: true }), true);     // Android / desktop installed app
  assert.equal(isStandalone({ navigatorStandalone: undefined, displayModeStandalone: false }), false);
  assert.equal(isStandalone(), false);
});

test('wasRecentlyDismissed uses a 30 day window and survives garbage values', () => {
  const now = 1_000_000_000_000;
  assert.equal(wasRecentlyDismissed(String(now - 1000), now), true);
  assert.equal(wasRecentlyDismissed(String(now - DISMISS_MS + 1), now), true);
  assert.equal(wasRecentlyDismissed(String(now - DISMISS_MS - 1), now), false);
  for (const junk of [null, undefined, '', 'abc', '0', '-5', NaN]) assert.equal(wasRecentlyDismissed(junk, now), false, String(junk));
});

test('installMode precedence: installed > prompt > ios > manual', () => {
  assert.equal(installMode({ installed: true, canPrompt: true, ios: true }), 'installed');
  assert.equal(installMode({ canPrompt: true, ios: true }), 'prompt');
  assert.equal(installMode({ ios: true }), 'ios');
  assert.equal(installMode({}), 'manual');
});

test('shouldShowBanner: only when we can help, there is data worth keeping, and not dismissed', () => {
  const now = 1_000_000_000_000;
  const ok = { mode: 'ios', setCount: 1, dismissedAt: null, now };
  assert.equal(shouldShowBanner(ok), true);
  assert.equal(shouldShowBanner({ ...ok, mode: 'prompt' }), true);
  assert.equal(shouldShowBanner({ ...ok, mode: 'manual' }), false);       // we have nothing useful to offer
  assert.equal(shouldShowBanner({ ...ok, mode: 'installed' }), false);
  assert.equal(shouldShowBanner({ ...ok, setCount: 0 }), false);           // brand-new user: don't nag yet
  assert.equal(shouldShowBanner({ ...ok, dismissedAt: String(now - 1000) }), false);
  assert.equal(shouldShowBanner({ ...ok, dismissedAt: String(now - DISMISS_MS - 1) }), true);   // reminder after 30 days
});
