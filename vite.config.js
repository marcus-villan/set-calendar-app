import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Where the app is published. Social cards (og:image) and the canonical link need an ABSOLUTE
// URL, so it lives here, in one place. Override per deploy:  SITE_URL=https://example.com/ npm run build
const SITE_URL = process.env.SITE_URL ?? 'https://marcus-villan.github.io/set-calendar-app/';

export default defineConfig({
  base: '/set-calendar-app/',
  plugins: [
    tailwindcss(),
    {
      // Replaces __SITE_URL__ in index.html at dev + build time.
      // order: 'pre' = run BEFORE Vite's own HTML processing. Otherwise the dev server sees the
      // placeholder as a relative path and glues the base ('/set-calendar-app/') in front of it.
      name: 'site-url',
      transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('__SITE_URL__', SITE_URL) },
    },
  ],
});
