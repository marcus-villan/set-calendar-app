import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeUser, readAuthError, stripAuthParams } from '../src/account.js';

test('describeUser prefers the Google name, falls back to the email name, and only trusts https avatars', () => {
  assert.equal(describeUser(null), null);
  assert.deepEqual(describeUser({ email: 'a@b.com', user_metadata: { full_name: 'Marcus V', avatar_url: 'https://lh3.googleusercontent.com/x' } }),
    { name: 'Marcus V', email: 'a@b.com', avatar: 'https://lh3.googleusercontent.com/x' });
  assert.equal(describeUser({ email: 'marcus@gmail.com', user_metadata: {} }).name, 'marcus');
  assert.equal(describeUser({ email: 'a@b.com', user_metadata: { name: '  ', picture: 'https://x/y.png' } }).name, 'a');
  assert.equal(describeUser({ email: 'a@b.com', user_metadata: { avatar_url: 'javascript:alert(1)' } }).avatar, '');   // never an unsafe URL
  assert.equal(describeUser({ email: 'a@b.com', user_metadata: { avatar_url: 'http://insecure/x.png' } }).avatar, '');
  assert.equal(describeUser({}).name, 'Signed in');
});

test('readAuthError reads errors from the query string or the #fragment, and ignores clean URLs', () => {
  const base = 'https://marcus-villan.github.io/set-calendar-app/';
  assert.equal(readAuthError(base), null);
  assert.equal(readAuthError(base + '?tab=settings&code=abc'), null);
  assert.equal(readAuthError(base + '?error=server_error&error_description=Unable+to+exchange+external+code'), 'Unable to exchange external code');
  assert.equal(readAuthError(base + '#error=access_denied&error_description=User+denied+access'), 'Sign-in was cancelled.');
  assert.equal(readAuthError(base + '?error=access_denied'), 'Sign-in was cancelled.');
  assert.equal(readAuthError('not a url'), null);
  assert.ok(readAuthError(base + '?error_description=' + 'x'.repeat(500)).length <= 160);
});

test('stripAuthParams removes only the sign-in leftovers and keeps the rest (including a pending ?code)', () => {
  const href = 'https://x.github.io/set-calendar-app/?tab=settings&code=abc&error=bad&error_description=oops';
  assert.equal(stripAuthParams(href), '/set-calendar-app/?code=abc');
  assert.equal(stripAuthParams('https://x.github.io/set-calendar-app/'), '/set-calendar-app/');
  assert.equal(stripAuthParams('https://x.github.io/set-calendar-app/#error=x&error_description=y'), '/set-calendar-app/');
  assert.equal(stripAuthParams('https://x.github.io/set-calendar-app/#section'), '/set-calendar-app/#section');
});
