import { newId, isValidTime, daysBetween } from './utils.js';

export const Model = {
  currentDate: new Date(),
  selectedDateStr: null,   // the day whose sheet is open (or the day a new set will default to)
  activePinId: null,       // the set being edited (null = creating a new one)
  activePinDateStr: null,  // the date that set currently lives on (it can be moved in the editor)
  selectedEmoji: '📍',
  emojiOptions: ['📍', '🍻', '🎬', '🍔', '✈️', '🏀', '🎮', '☕', '🎉', '🚗', '🎂', '❤️'],
  pins: {},

  // Themes. Colors live in style.css (data-theme="<id>"); this list just names them.
  // To add a theme: add a block in style.css and an entry here.
  palettes: [
    { id: 'mono', name: 'Mono Ink' },
    { id: 'forest', name: 'Forest' },
    { id: 'paper', name: 'Paper' },
    { id: 'ocean', name: 'Ocean' }
  ],
  modes: ['system', 'light', 'dark'],
  // mode: follow the device, or force light/dark. palette: which theme.
  // (Stored under the existing 'theme' key, so values saved by older versions still work.)
  settings: { mode: 'system', palette: 'mono' },

  loadSettings() {
    try {
      const mode = localStorage.getItem('theme');
      const palette = localStorage.getItem('palette');
      if (this.modes.includes(mode)) this.settings.mode = mode;
      if (this.palettes.some(p => p.id === palette)) this.settings.palette = palette;
    } catch (err) {
      console.error('Failed to load settings', err);
    }
  },

  saveSettings() {
    try {
      localStorage.setItem('theme', this.settings.mode);
      localStorage.setItem('palette', this.settings.palette);
    } catch (err) {
      console.error('Failed to save settings', err);
    }
  },

  init() {
    try {
      const saved = localStorage.getItem('set_app_pins');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(date => {
          if (parsed[date] && !Array.isArray(parsed[date])) {
            this.pins[date] = [{ id: newId(), ...parsed[date] }];
          } else {
            this.pins[date] = parsed[date];
          }
          this.sortDay(date);
        });
      }
    } catch (err) {
      console.error("Failed to load pins", err);
      this.pins = {};
    }
  },

  // Always land on the 1st: setMonth() on the 31st overflows (Jan 31 + 1 month = Mar 3).
  shiftMonth(delta) {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + delta, 1);
  },

  save() {
    try {
      localStorage.setItem('set_app_pins', JSON.stringify(this.pins));
    } catch (err) {
      console.error("Failed to save pins", err);
    }
  },

  // Within a day: sets with a time first (earliest first), then the rest in the order they
  // were added. Array.prototype.sort is stable, so equal times keep their order.
  sortDay(dateStr) {
    const list = this.pins[dateStr];
    if (!list) return;
    const rank = (p) => (isValidTime(p.time) ? p.time : '99:99');
    list.sort((a, b) => (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0));
  },

  // Create a set, or update one. `note` and `time` are optional; sets saved before those
  // fields existed simply don't have them, so old data keeps working with no migration.
  //
  // To MOVE a set to another day, pass its current day as `fromDateStr` and the new day as
  // `dateStr`; it keeps its id.
  savePin({ dateStr, title, emoji, note = '', time = '' }, { pinId = null, fromDateStr = null } = {}) {
    const fields = { title, emoji, note, time: isValidTime(time) ? time : '' };
    let existing = null;

    if (pinId) {
      const source = fromDateStr ?? dateStr;
      const list = this.pins[source] || [];
      const idx = list.findIndex(p => p.id === pinId);
      if (idx !== -1) {
        [existing] = list.splice(idx, 1);
        if (list.length === 0) delete this.pins[source];
      }
    }

    if (!this.pins[dateStr]) this.pins[dateStr] = [];
    this.pins[dateStr].push({ ...existing, id: existing?.id ?? newId(), ...fields });
    this.sortDay(dateStr);
    this.save();
  },

  // Returns what was removed (and where), so the caller can offer "Undo".
  deletePin(dateStr, pinId) {
    const list = this.pins[dateStr];
    if (!list) return null;
    const index = list.findIndex(p => p.id === pinId);
    if (index === -1) return null;
    const [pin] = list.splice(index, 1);
    if (list.length === 0) delete this.pins[dateStr];
    this.save();
    return { pin, index };
  },

  restorePin(dateStr, pin, index) {
    if (!this.pins[dateStr]) this.pins[dateStr] = [];
    this.pins[dateStr].splice(Math.min(index, this.pins[dateStr].length), 0, pin);
    this.save();
  },

  // Every pin from `todayStr` onward, soonest first. "YYYY-MM-DD" strings sort
  // correctly as plain text, so no Date parsing is needed.
  upcoming(todayStr) {
    return Object.keys(this.pins)
      .filter(dateStr => dateStr >= todayStr)
      .sort()
      .flatMap(dateStr => this.pins[dateStr].map(pin => ({ dateStr, pin })));
  },

  // Case-insensitive search over title, note and emoji. Upcoming matches come first
  // (soonest first), then past matches (most recent first).
  search(query, todayStr) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matches = Object.keys(this.pins).flatMap(dateStr =>
      this.pins[dateStr]
        .filter(pin => `${pin.title} ${pin.note ?? ''} ${pin.emoji}`.toLowerCase().includes(q))
        .map(pin => ({ dateStr, pin }))
    );
    const upcoming = matches.filter(m => m.dateStr >= todayStr).sort((a, b) => (a.dateStr < b.dateStr ? -1 : a.dateStr > b.dateStr ? 1 : 0));
    const past = matches.filter(m => m.dateStr < todayStr).sort((a, b) => (a.dateStr < b.dateStr ? 1 : a.dateStr > b.dateStr ? -1 : 0));
    return [...upcoming, ...past];
  },

  // "Month at a glance". `month` is 0-based. Busiest day = most sets (earliest wins a tie).
  stats(year, month) {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    const days = Object.keys(this.pins).filter(d => d.startsWith(prefix) && this.pins[d].length > 0).sort();
    const total = days.reduce((sum, d) => sum + this.pins[d].length, 0);
    let busiest = null;
    for (const d of days) {
      if (!busiest || this.pins[d].length > busiest.count) busiest = { dateStr: d, count: this.pins[d].length };
    }
    return { total, daysPlanned: days.length, busiest };
  },

  // Days from today until the next set (0 = today); null if nothing is coming up.
  nextSet(todayStr) {
    const first = this.upcoming(todayStr)[0];
    return first ? { ...first, inDays: daysBetween(todayStr, first.dateStr) } : null;
  }
};
