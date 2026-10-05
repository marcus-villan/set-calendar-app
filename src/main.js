import './style.css';
import { Model } from './model.js';
import { View } from './view.js';
import { dateToStr, lastEmoji } from './utils.js';

// iOS Safari ignores user-scalable=no. Its pinch-zoom (and macOS Safari's trackpad pinch) fires
// non-standard gesture* events, which we can cancel. Double-tap zoom is handled in CSS (touch-action).
['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
});

document.addEventListener('DOMContentLoaded', () => {
  Model.init();
  View.bindElements();

  // direction: -1 / 1 slides the grid in from that side, 0 re-renders in place.
  function refreshCalendar(direction = 0) {
    View.renderCalendar(Model.currentDate, Model.pins, openDayDetail, direction);
    refreshUpcoming();
  }

  function refreshUpcoming() {
    const today = dateToStr(new Date());
    View.renderUpcomingList(Model.upcoming(today), today, openPinFromUpcoming);
  }

  function renderDayList() {
    View.renderDayPinsList(Model.pins, Model.selectedDateStr, openPinModal, deleteWithUndo);
  }

  // Month index lets us pick the slide direction for any jump (prev/next/Today).
  const monthIndex = (d) => d.getFullYear() * 12 + d.getMonth();
  function goToMonth(change) {
    const before = monthIndex(Model.currentDate);
    change();
    refreshCalendar(Math.sign(monthIndex(Model.currentDate) - before));
  }

  function openDayDetail(dateStr) {
    Model.selectedDateStr = dateStr;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    View.elements.dayDetailTitle.textContent = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    renderDayList();
    View.openModal(View.elements.dayDetailModal);
  }

  function closeDayDetail() {
    const dateStr = Model.selectedDateStr;
    View.closeModal(View.elements.dayDetailModal);
    // The grid was re-rendered while the sheet was open, so re-find the day cell.
    View.focusDay(dateStr);
  }

  // Selecting an emoji updates the model, the big preview, and which quick-pick is highlighted.
  // `typed` = it came from the custom input, so we must not overwrite what the user is typing.
  function setEmoji(emoji, { typed = false } = {}) {
    Model.selectedEmoji = emoji;
    View.elements.selectedEmojiPreview.textContent = emoji;
    if (!typed) {
      // A quick-pick clears the custom box; a custom emoji (from an existing pin) fills it.
      View.elements.customEmojiInput.value = Model.emojiOptions.includes(emoji) ? '' : emoji;
    }
    View.renderEmojiPresets(Model.emojiOptions, emoji, (picked) => setEmoji(picked));
  }

  function openPinModal(pinId = null) {
    Model.activePinId = pinId;
    const [y, m, d] = Model.selectedDateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    View.elements.modalDateTitle.textContent = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const dayPins = Model.pins[Model.selectedDateStr] || [];
    const existingPin = dayPins.find(p => p.id === pinId);

    if (existingPin) {
      View.elements.pinTitleInput.value = existingPin.title || '';
      View.elements.pinNoteInput.value = existingPin.note || '';
      View.elements.deletePinBtn.classList.remove('hidden');
      View.elements.savePinBtn.textContent = 'Update Set';
      setEmoji(existingPin.emoji || '📍');
    } else {
      View.elements.pinTitleInput.value = '';
      View.elements.pinNoteInput.value = '';
      View.elements.deletePinBtn.classList.add('hidden');
      View.elements.savePinBtn.textContent = 'Set';
      setEmoji('📍');
    }

    View.openModal(View.elements.pinModal, View.elements.pinTitleInput);
  }

  // Tapping an "Upcoming" chip edits that pin directly, without going through the day sheet.
  function openPinFromUpcoming(dateStr, pinId) {
    Model.selectedDateStr = dateStr;
    openPinModal(pinId);
  }

  function closePinModal() {
    View.closeModal(View.elements.pinModal);
  }

  // Delete immediately, but keep the pin around for an "Undo" toast so a mis-tap isn't permanent.
  function deleteWithUndo(pinId) {
    const dateStr = Model.selectedDateStr;
    const removed = Model.deletePin(dateStr, pinId);
    if (!removed) return;
    renderDayList();
    refreshCalendar();
    View.showToast(`Deleted “${removed.pin.title}”`, 'Undo', () => {
      Model.restorePin(dateStr, removed.pin, removed.index);
      renderDayList();
      refreshCalendar();
    });
  }

  // Event Listeners
  View.elements.navCalendarBtn.addEventListener('click', () => View.switchTab('calendar'));
  View.elements.navSettingsBtn.addEventListener('click', () => View.switchTab('settings'));

  View.elements.prevMonthBtn.addEventListener('click', () => goToMonth(() => Model.shiftMonth(-1)));
  View.elements.nextMonthBtn.addEventListener('click', () => goToMonth(() => Model.shiftMonth(1)));
  View.elements.todayBtn.addEventListener('click', () => goToMonth(() => { Model.currentDate = new Date(); }));

  View.elements.closeDayDetailBtn.addEventListener('click', closeDayDetail);
  View.elements.addNewPinBtn.addEventListener('click', () => openPinModal(null));
  View.elements.closeModalBtn.addEventListener('click', closePinModal);

  // Tapping the dimmed backdrop (not the card) closes that modal.
  View.elements.dayDetailModal.addEventListener('click', (e) => {
    if (e.target === View.elements.dayDetailModal) closeDayDetail();
  });
  View.elements.pinModal.addEventListener('click', (e) => {
    if (e.target === View.elements.pinModal) closePinModal();
  });

  // Escape closes the top-most modal; Tab stays inside it.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      View.trapFocus(e);
    } else if (e.key === 'Escape') {
      const top = View.topOpenModal();
      if (top === View.elements.pinModal) closePinModal();
      else if (top === View.elements.dayDetailModal) closeDayDetail();
    }
  });

  // Any emoji: whatever the user types or pastes, keep only the newest emoji.
  // Letters and other characters are dropped, so the box always holds one emoji (or nothing).
  View.elements.customEmojiInput.addEventListener('input', (e) => {
    const emoji = lastEmoji(e.target.value);
    e.target.value = emoji ?? '';
    if (emoji) setEmoji(emoji, { typed: true });
  });

  // A <form> submit covers both the Set button and the keyboard's Enter / Done key.
  View.elements.pinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = View.elements.pinTitleInput.value.trim();
    if (!title) return;
    const note = View.elements.pinNoteInput.value.trim();
    Model.addOrUpdatePin(Model.selectedDateStr, { title, emoji: Model.selectedEmoji, note }, Model.activePinId);
    renderDayList();
    refreshCalendar();
    closePinModal();
  });

  View.elements.deletePinBtn.addEventListener('click', () => {
    if (Model.activePinId) {
      deleteWithUndo(Model.activePinId);
      closePinModal();
    }
  });

  // Appearance. The inline script in index.html already applied the saved theme before first
  // paint (no flash); here we load the same settings into the model and wire up the controls.
  Model.loadSettings();
  const applyAppearance = () => View.applyAppearance(Model.settings.mode, Model.settings.palette);

  View.renderPaletteOptions(Model.palettes, (id) => {
    Model.settings.palette = id;
    Model.saveSettings();
    applyAppearance();
  });
  View.elements.modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      Model.settings.mode = btn.dataset.mode;
      Model.saveSettings();
      applyAppearance();
    });
  });
  // In "System" mode, follow the device live (e.g. iOS switching to dark at sunset).
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (Model.settings.mode === 'system') applyAppearance();
  });
  applyAppearance();

  refreshCalendar();
});
