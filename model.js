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
            this.pins[date] = [{ id: Date.now().toString(), ...parsed[date] }];
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

  save() {
    try {
      localStorage.setItem('set_app_pins', JSON.stringify(this.pins));
    } catch (err) {
      console.error("Failed to save pins", err);
    }
  },

  addOrUpdatePin(dateStr, title, emoji, pinId = null) {
    if (!this.pins[dateStr]) this.pins[dateStr] = [];
    if (pinId) {
      const idx = this.pins[dateStr].findIndex(p => p.id === pinId);
      if (idx !== -1) {
        this.pins[dateStr][idx] = { id: pinId, title, emoji };
      }
    } else {
      this.pins[dateStr].push({ id: Date.now().toString(), title, emoji });
    }
    this.save();
  },

  deletePin(dateStr, pinId) {
    if (!this.pins[dateStr]) return;
    this.pins[dateStr] = this.pins[dateStr].filter(p => p.id !== pinId);
    if (this.pins[dateStr].length === 0) delete this.pins[dateStr];
    this.save();
  }
};