const pad = (n) => String(n).padStart(2, '0');

// Builds the "YYYY-MM-DD" key that pins are stored under. `month` is 0-based, like Date.
export function toDateStr(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function dateToStr(date) {
  return toDateStr(date.getFullYear(), date.getMonth(), date.getDate());
}

// crypto.randomUUID only exists on secure origins (https / localhost), so testing
// over http://<lan-ip> on a phone would crash without a fallback.
export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}

// "Oct 24"
export function shortDate(dateStr) {
  const { y, m, d } = parseDateStr(dateStr);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "Today", "Tomorrow", "Fri" (within the next week), otherwise "Oct 24".
export function relativeDayLabel(dateStr, todayStr) {
  const a = parseDateStr(dateStr);
  const b = parseDateStr(todayStr);
  // Date.UTC avoids daylight-saving off-by-one-hour errors when counting days.
  const diff = Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return new Date(a.y, a.m - 1, a.d).toLocaleDateString('en-US', { weekday: 'short' });
  return shortDate(dateStr);
}

// ---------- Emoji ----------
// One visible emoji can be many code points (flags, skin tones, 👨‍👩‍👧 = 5 joined emoji),
// so we split text into "graphemes" (what a human sees as one character) instead of
// using string length or Array.from.
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const EMOJI_RE = /\p{Extended_Pictographic}|^\p{Regional_Indicator}{2}$|^[0-9#*]️?⃣$/u; // emoji | flags | keycaps (1️⃣)

// Returns the LAST emoji in `text` (the newest one the user typed), or null if there is none.
export function lastEmoji(text) {
  const graphemes = segmenter ? [...segmenter.segment(text)].map(s => s.segment) : Array.from(text);
  for (let i = graphemes.length - 1; i >= 0; i--) {
    if (EMOJI_RE.test(graphemes[i])) return graphemes[i];
  }
  return null;
}
