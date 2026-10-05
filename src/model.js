import { newId } from './utils.js';

export const Model = {
  currentDate: new Date(),
  selectedDateStr: null,
  activePinId: null,
  selectedEmoji: '📍',
  emojiOptions: ['📍', '🍻', '🎬', '🍔', '✈️', '🏀', '🎮', '☕', '🎉', '🚗', '🎂', '❤️'],
  pins: {},

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

  // `note` is optional. Pins saved before notes existed simply don't have the field,
  // so old data keeps working with no migration.
  addOrUpdatePin(dateStr, { title, emoji, note = '' }, pinId = null) {
    if (!this.pins[dateStr]) this.pins[dateStr] = [];
    if (pinId) {
      const idx = this.pins[dateStr].findIndex(p => p.id === pinId);
      if (idx !== -1) {
        this.pins[dateStr][idx] = { ...this.pins[dateStr][idx], title, emoji, note };
      }
    } else {
      this.pins[dateStr].push({ id: newId(), title, emoji, note });
    }
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
  }
};