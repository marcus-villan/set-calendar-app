// Checks every theme in src/style.css against WCAG AA (4.5:1 for text).
// Run:  node scripts/check-contrast.mjs
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

// Pull each "selector { --token: value; ... }" block that defines tokens.
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*--bg:[^{}]*)\}/g)].map(([, selector, body]) => ({
  // Drop comments, and anything before the last ';' (a previous at-rule can be glued to the selector).
  selector: selector.replace(/\/\*[\s\S]*?\*\//g, '').split(';').pop().trim(),
  tokens: Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map(m => [m[1], m[2]])),
}));

const channel = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map(i => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground token, background token, where it is used]
const PAIRS = [
  ['ink', 'bg', 'body text on page'],
  ['ink', 'surface', 'text on cards'],
  ['ink', 'surface-2', 'text on chips / inputs'],
  ['muted', 'bg', 'secondary text on page'],
  ['muted', 'surface', 'secondary text on cards'],
  ['muted', 'surface-2', 'secondary text on chips / inputs'],
  ['primary-ink', 'primary', 'main button + logo'],
  ['accent-ink', 'accent', 'today marker'],
  ['accent', 'surface', 'accent text on cards (+N)'],
  ['accent', 'accent-soft', 'badge text'],
  ['accent-on-primary', 'primary', 'toast action'],
  ['danger', 'danger-soft', 'delete button'],
];

// Group light/dark by theme id from the selector text.
const themes = {};
for (const { selector, tokens } of blocks) {
  const id = (selector.match(/data-theme="(\w+)"/) ?? [, 'mono'])[1];
  const mode = /\.dark/.test(selector) ? 'dark' : 'light';
  (themes[id] ??= {})[mode] = tokens;
}

let failures = 0;
for (const [id, modes] of Object.entries(themes)) {
  for (const mode of ['light', 'dark']) {
    const t = modes[mode];
    if (!t) { console.log(`MISSING ${id} ${mode}`); failures++; continue; }
    for (const [fg, bg, use] of PAIRS) {
      const r = ratio(t[fg], t[bg]);
      if (r < 4.5) { failures++; console.log(`FAIL ${id}/${mode}  ${fg} on ${bg}  ${r.toFixed(2)}:1  (${use})`); }
    }
  }
}
console.log(`${Object.keys(themes).length} themes x 2 modes x ${PAIRS.length} pairs checked`);
console.log(failures ? `${failures} below 4.5:1` : 'ALL PASS (AA)');
process.exit(failures ? 1 : 0);
