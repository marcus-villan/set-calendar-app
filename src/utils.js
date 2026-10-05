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
