import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/set-calendar-app/',
  plugins: [
    tailwindcss(),
  ],
});