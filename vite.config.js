import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Where the app is published. Social cards (og:image) and the canonical link need an ABSOLUTE
// URL, so it lives here, in one place. Override per deploy:  SITE_URL=https://example.com/ npm run build
const SITE_URL = process.env.SITE_URL ?? 'https://marcus-villan.github.io/set-calendar-app/';

// Keep in sync with src/config.js.
const SUPABASE_HOST = 'zxlmbvokkokgjwhafdan.supabase.co';

// Content-Security-Policy: a list of what the page is ALLOWED to load or run. Anything not listed
// is blocked by the browser, so even if an attacker found a way to inject markup, their script
// would not run and data could not be sent to their server.
//   default-src 'none'   start from "nothing is allowed"
//   script-src 'self'    only our own script files; no inline scripts, no eval, no other sites
//   style-src 'self'     only our own stylesheet
//   img-src              our images, inline SVG icons (data:), and the Google profile photo
//   connect-src          the app may only talk to itself and our Supabase project
//   base-uri / form-action / object-src   close older injection tricks
// It is a <meta> tag because GitHub Pages cannot send custom headers. Two things a meta tag
// cannot do: frame-ancestors (so public/boot.js blocks framing instead) and reporting.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: https://*.googleusercontent.com",
  "font-src 'self'",
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests'
].join('; ');

export default defineConfig(({ command }) => ({
  base: '/set-calendar-app/',
  plugins: [
    tailwindcss(),
    {
      // Fills in __SITE_URL__ and the security policy in index.html.
      // order: 'pre' = run BEFORE Vite's own HTML processing. Otherwise the dev server sees the
      // placeholder as a relative path and glues the base ('/set-calendar-app/') in front of it.
      name: 'html-placeholders',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => html
          .replaceAll('__SITE_URL__', SITE_URL)
          // Dev needs inline scripts + a websocket for hot reload, so the policy is build-only.
          .replace('<!--CSP-->', command === 'build' ? `<meta http-equiv="Content-Security-Policy" content="${CSP}">` : '')
      }
    }
  ]
}));
