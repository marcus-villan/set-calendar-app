import './style.css';
import { Model } from './model.js';
import { View } from './view.js';

document.addEventListener('DOMContentLoaded', () => {
  Model.init();
  View.bindElements();

  function refreshCalendar() {
    View.renderCalendar(Model.currentDate, Model.pins, openDayDetail);
  }

  function openDayDetail(dateStr) {
    Model.selectedDateStr = dateStr;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    View.elements.dayDetailTitle.textContent = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    View.renderDayPinsList(Model.pins, dateStr, openPinModal);

    View.elements.dayDetailModal.classList.remove('opacity-0', 'pointer-events-none');
    View.elements.dayDetailCard.classList.remove('scale-95');
    View.elements.dayDetailCard.classList.add('scale-100', 'animate-pop');
  }

  function closeDayDetail() {
    View.elements.dayDetailModal.classList.add('opacity-0', 'pointer-events-none');
    View.elements.dayDetailCard.classList.remove('scale-100', 'animate-pop');
    View.elements.dayDetailCard.classList.add('scale-95');
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

    View.elements.pinModal.classList.remove('opacity-0', 'pointer-events-none');
    View.elements.modalCard.classList.remove('translate-y-full', 'sm:translate-y-4');
    setTimeout(() => View.elements.pinTitleInput.focus(), 150);
  }

  function closePinModal() {
    View.elements.pinModal.classList.add('opacity-0', 'pointer-events-none');
    View.elements.modalCard.classList.add('translate-y-full', 'sm:translate-y-4');
  }

  // Event Listeners
  View.elements.navCalendarBtn.addEventListener('click', () => View.switchTab('calendar'));
  View.elements.navSettingsBtn.addEventListener('click', () => View.switchTab('settings'));

  View.elements.prevMonthBtn.addEventListener('click', () => {
    Model.currentDate.setMonth(Model.currentDate.getMonth() - 1);
    refreshCalendar();
  });

  View.elements.nextMonthBtn.addEventListener('click', () => {
    Model.currentDate.setMonth(Model.currentDate.getMonth() + 1);
    refreshCalendar();
  });

  View.elements.todayBtn.addEventListener('click', () => {
    Model.currentDate = new Date();
    refreshCalendar();
  });

  View.elements.closeDayDetailBtn.addEventListener('click', closeDayDetail);
  View.elements.addNewPinBtn.addEventListener('click', () => openPinModal(null));
  View.elements.closeModalBtn.addEventListener('click', closePinModal);

  View.elements.savePinBtn.addEventListener('click', () => {
    const title = View.elements.pinTitleInput.value.trim();
    if (!title) return;
    Model.addOrUpdatePin(Model.selectedDateStr, title, Model.selectedEmoji, Model.activePinId);
    closePinModal();
    View.renderDayPinsList(Model.pins, Model.selectedDateStr, openPinModal);
    refreshCalendar();
  });

  View.elements.deletePinBtn.addEventListener('click', () => {
    if (Model.activePinId) {
      Model.deletePin(Model.selectedDateStr, Model.activePinId);
      closePinModal();
      View.renderDayPinsList(Model.pins, Model.selectedDateStr, openPinModal);
      refreshCalendar();
    }
  });

// Direct Theme Toggle Handler
  const themeToggleBtn = document.getElementById('settingsThemeToggle');
  const toggleKnob = document.getElementById('toggleKnob');

  function updateThemeUI(isDark) {
    if (isDark) {
      document.documentElement.classList.add('dark');
      if (toggleKnob) {
        toggleKnob.classList.remove('translate-x-0');
        toggleKnob.classList.add('translate-x-6');
      }
    } else {
      document.documentElement.classList.remove('dark');
      if (toggleKnob) {
        toggleKnob.classList.remove('translate-x-6');
        toggleKnob.classList.add('translate-x-0');
      }
    }
  }

  // Load initial theme state
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialDark = savedTheme ? savedTheme === 'dark' : prefersDark;

  updateThemeUI(initialDark);

  // Attach listener directly to the DOM node
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isDark = !document.documentElement.classList.contains('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      updateThemeUI(isDark);
    });
  }

  refreshCalendar();
});