import './style.css';
import { Model } from './model.js';
import { View } from './view.js';

document.addEventListener('DOMContentLoaded', () => {
  Model.init();
  View.bindElements();

  // direction: -1 / 1 slides the grid in from that side, 0 re-renders in place.
  function refreshCalendar(direction = 0) {
    View.renderCalendar(Model.currentDate, Model.pins, openDayDetail, direction);
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
    View.renderDayPinsList(Model.pins, dateStr, openPinModal);
    View.openModal(View.elements.dayDetailModal);
  }

  function closeDayDetail() {
    const dateStr = Model.selectedDateStr;
    View.closeModal(View.elements.dayDetailModal);
    // The grid was re-rendered while the sheet was open, so re-find the day cell.
    View.focusDay(dateStr);
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
      Model.selectedEmoji = existingPin.emoji || '📍';
      View.elements.deletePinBtn.classList.remove('hidden');
      View.elements.savePinBtn.textContent = 'Update Set';
    } else {
      View.elements.pinTitleInput.value = '';
      Model.selectedEmoji = '📍';
      View.elements.deletePinBtn.classList.add('hidden');
      View.elements.savePinBtn.textContent = 'Set';
    }

    View.elements.selectedEmojiPreview.textContent = Model.selectedEmoji;
    View.renderEmojiPresets(Model.emojiOptions, Model.selectedEmoji, function handleEmojiSelect(emoji) {
      Model.selectedEmoji = emoji;
      View.elements.selectedEmojiPreview.textContent = emoji;
      View.renderEmojiPresets(Model.emojiOptions, Model.selectedEmoji, handleEmojiSelect);
    });

    View.openModal(View.elements.pinModal, View.elements.pinTitleInput);
  }

  function closePinModal() {
    View.closeModal(View.elements.pinModal);
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

  // A <form> submit covers both the Set button and the keyboard's Enter / Done key.
  View.elements.pinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = View.elements.pinTitleInput.value.trim();
    if (!title) return;
    Model.addOrUpdatePin(Model.selectedDateStr, title, Model.selectedEmoji, Model.activePinId);
    View.renderDayPinsList(Model.pins, Model.selectedDateStr, openPinModal);
    refreshCalendar();
    closePinModal();
  });

  View.elements.deletePinBtn.addEventListener('click', () => {
    if (Model.activePinId) {
      Model.deletePin(Model.selectedDateStr, Model.activePinId);
      View.renderDayPinsList(Model.pins, Model.selectedDateStr, openPinModal);
      refreshCalendar();
      closePinModal();
    }
  });

  // Theme: the inline script in index.html applies the saved/system theme before first
  // paint (no white flash). Here we sync the switch + browser chrome, and handle the toggle.
  View.applyTheme(document.documentElement.classList.contains('dark'));
  View.elements.settingsThemeToggle.addEventListener('click', () => {
    const isDark = !document.documentElement.classList.contains('dark');
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch (err) {
      console.error('Failed to save theme', err);
    }
    View.applyTheme(isDark);
  });

  refreshCalendar();
});
