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

// ---------- Dates ----------

function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}

// True only for real calendar dates in "YYYY-MM-DD" form ("2026-02-31" is rejected).
export function isValidDateStr(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const { y, m, d } = parseDateStr(dateStr);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// Whole days from `fromStr` to `toStr` (negative if `toStr` is earlier).
// Date.UTC avoids daylight-saving off-by-one-hour errors when counting days.
export function daysBetween(fromStr, toStr) {
  const a = parseDateStr(fromStr);
  const b = parseDateStr(toStr);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

// "Oct 24"
export function shortDate(dateStr) {
  const { y, m, d } = parseDateStr(dateStr);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "Sat, Oct 24"
export function weekdayDate(dateStr) {
  const { y, m, d } = parseDateStr(dateStr);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// "Monday, October 5"
export function longDate(dateStr) {
  const { y, m, d } = parseDateStr(dateStr);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// "Sat, Oct 10", plus the year when it isn't the current year ("Sat, Oct 10, 2025").
export function dateLabelWithYear(dateStr, todayStr) {
  const { y, m, d } = parseDateStr(dateStr);
  const options = { weekday: 'short', month: 'short', day: 'numeric' };
  if (y !== parseDateStr(todayStr).y) options.year = 'numeric';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', options);
}

// "Today", "Tomorrow", "Fri" (within the next week), otherwise "Oct 24".
export function relativeDayLabel(dateStr, todayStr) {
  const diff = daysBetween(todayStr, dateStr);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) {
    const { y, m, d } = parseDateStr(dateStr);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
  }
  return shortDate(dateStr);
}

// Splits upcoming items ([{ dateStr, pin }], already sorted by date) into display groups.
// Empty groups are left out.
export function groupByRange(items, todayStr) {
  const groups = [
    { key: 'today', label: 'Today', items: [] },
    { key: 'tomorrow', label: 'Tomorrow', items: [] },
    { key: 'week', label: 'This week', items: [] },
    { key: 'later', label: 'Later', items: [] }
  ];
  for (const item of items) {
    const diff = daysBetween(todayStr, item.dateStr);
    if (diff <= 0) groups[0].items.push(item);
    else if (diff === 1) groups[1].items.push(item);
    else if (diff < 7) groups[2].items.push(item);
    else groups[3].items.push(item);
  }
  return groups.filter(g => g.items.length > 0);
}

// ---------- Time ----------
// Stored as 24-hour "HH:MM" (what <input type="time"> gives us); shown as "7:30 PM".

export function isValidTime(time) {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function formatTime(time) {
  if (!isValidTime(time)) return '';
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

// The earliest set time later than `nowTime` ("HH:MM") among `pins`, or null. "HH:MM" strings
// compare correctly as plain text.
export function nextTimeAfter(pins, nowTime) {
  const later = pins.map(p => p.time).filter(t => isValidTime(t) && t > nowTime).sort();
  return later[0] ?? null;
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
