import './style.css';
import { Model } from './model.js';
import { View } from './view.js';
import { dateToStr, lastEmoji, isValidDateStr, shortDate, weekdayDate, groupByRange, nextTimeAfter, formatTime } from './utils.js';
import { parseBackup, backupFileName, countSets, MAX_BACKUP_BYTES } from './backup.js';

// iOS Safari ignores user-scalable=no. Its pinch-zoom (and macOS Safari's trackpad pinch) fires
// non-standard gesture* events, which we can cancel. Double-tap zoom is handled in CSS (touch-action).
['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
});

const MAX_NEXT_UP = 12;   // Home shows this many upcoming sets; the rest live in Calendar
const MAX_SEARCH = 50;

document.addEventListener('DOMContentLoaded', () => {
  Model.init();
  View.bindElements();

  const todayStr = () => dateToStr(new Date());
  const isDaySheetOpen = () => View.elements.dayDetailModal.dataset.open === 'true';

  // ---------- Rendering ----------
  // direction: -1 / 1 slides the grid in from that side, 0 re-renders in place.
  function refreshCalendar(direction = 0) {
    View.renderCalendar(Model.currentDate, Model.pins, openDayDetail, direction);
    const today = todayStr();
    View.renderUpcomingList(Model.upcoming(today), today, openPinFromList);
  }

  function todaySummary(pins) {
    if (pins.length === 0) return 'Nothing set for today.';
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const next = nextTimeAfter(pins, nowTime);
    return `${pins.length} ${pins.length === 1 ? 'set' : 'sets'} today${next ? ` · next at ${formatTime(next)}` : ''}`;
  }

  function refreshHome() {
    const today = todayStr();
    const todayPins = Model.pins[today] ?? [];
    View.renderToday(today, todayPins, todaySummary(todayPins), {
      onEdit: (id) => openPinModal(id, today),
      onDelete: (id) => deleteWithUndo(today, id)
    });

    // While the search box has text it replaces "Next up" with the matches.
    const query = View.elements.searchInput.value;
    if (query.trim()) {
      View.renderSearchResults(query, Model.search(query, today).slice(0, MAX_SEARCH), today, openPinFromList);
    } else {
      const items = Model.upcoming(today).filter(item => item.dateStr !== today); // today has its own card
      const shown = items.slice(0, MAX_NEXT_UP);
      View.renderNextUp(groupByRange(shown, today), today, items.length - shown.length, openPinFromList);
    }

    const now = new Date();
    View.renderStats(now.toLocaleDateString('en-US', { month: 'long' }), Model.stats(now.getFullYear(), now.getMonth()), Model.nextSet(today), today);
  }

  function renderDayList() {
    View.renderDayPinsList(Model.pins, Model.selectedDateStr, openPinModal, (id) => deleteWithUndo(Model.selectedDateStr, id));
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function refreshDataSummary() {
    const total = countSets(Model.pins);
    const days = Object.keys(Model.pins).length;
    View.elements.dataSummary.textContent = total === 0
      ? 'No sets yet. Everything you add is stored on this device only.'
      : `${plural(total, 'set')} across ${plural(days, 'day')}, stored on this device only.`;
  }

  // Anything that changes sets calls this, so every screen stays in sync.
  function refreshAll() {
    refreshCalendar();
    refreshHome();
    refreshDataSummary();
    if (isDaySheetOpen()) renderDayList();
  }

  // Month index lets us pick the slide direction for any jump (prev/next/Today).
  const monthIndex = (d) => d.getFullYear() * 12 + d.getMonth();
  function goToMonth(change) {
    const before = monthIndex(Model.currentDate);
    change();
    refreshCalendar(Math.sign(monthIndex(Model.currentDate) - before));
  }

  // ---------- Day sheet ----------
  function openDayDetail(dateStr) {
    Model.selectedDateStr = dateStr;
    View.elements.dayDetailTitle.textContent = weekdayDate(dateStr);
    renderDayList();
    View.openModal(View.elements.dayDetailModal);
  }

  function closeDayDetail() {
    const dateStr = Model.selectedDateStr;
    View.closeModal(View.elements.dayDetailModal);
    // The grid was re-rendered while the sheet was open, so re-find the day cell.
    View.focusDay(dateStr);
  }

  // ---------- Editor ----------
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

  function updateClearTimeButton() {
    View.elements.clearTimeBtn.classList.toggle('hidden', !View.elements.pinTimeInput.value);
  }

  // Open the editor. With a pinId it edits that set (found on `dateStr`); without one it
  // starts a new set on `dateStr` (defaults to the open day sheet's day, else today).
  function openPinModal(pinId = null, dateStr = Model.selectedDateStr ?? todayStr()) {
    const existing = pinId ? (Model.pins[dateStr] ?? []).find(p => p.id === pinId) : null;
    Model.activePinId = existing ? pinId : null;
    Model.activePinDateStr = existing ? dateStr : null;

    View.elements.modalDateTitle.textContent = shortDate(dateStr);
    View.elements.pinDateInput.value = dateStr;
    View.elements.pinTimeInput.value = existing?.time ?? '';
    View.elements.pinTitleInput.value = existing?.title ?? '';
    View.elements.pinNoteInput.value = existing?.note ?? '';
    View.elements.deletePinBtn.classList.toggle('hidden', !existing);
    View.elements.savePinBtn.textContent = existing ? 'Update Set' : 'Set';
    updateClearTimeButton();
    setEmoji(existing?.emoji || '📍');

    View.openModal(View.elements.pinModal, View.elements.pinTitleInput);
  }

  // Tapping a row on Home, or an "Upcoming" chip in Calendar, edits that set directly.
  function openPinFromList(dateStr, pinId) {
    openPinModal(pinId, dateStr);
  }

  function closePinModal() {
    View.closeModal(View.elements.pinModal);
  }

  // Delete immediately, but keep the set around for an "Undo" toast so a mis-tap isn't permanent.
  function deleteWithUndo(dateStr, pinId) {
    const removed = Model.deletePin(dateStr, pinId);
    if (!removed) return;
    refreshAll();
    View.showToast(`Deleted “${removed.pin.title}”`, 'Undo', () => {
      Model.restorePin(dateStr, removed.pin, removed.index);
      refreshAll();
    });
  }

  // ---------- Event listeners ----------
  const tabs = { navHomeBtn: 'home', navCalendarBtn: 'calendar', navSettingsBtn: 'settings' };
  Object.entries(tabs).forEach(([buttonKey, tabName]) => {
    View.elements[buttonKey].addEventListener('click', () => {
      View.switchTab(tabName);
      if (tabName === 'home') refreshHome(); // "today" may have rolled over while the app was open
    });
  });

  View.elements.prevMonthBtn.addEventListener('click', () => goToMonth(() => Model.shiftMonth(-1)));
  View.elements.nextMonthBtn.addEventListener('click', () => goToMonth(() => Model.shiftMonth(1)));
  View.elements.todayBtn.addEventListener('click', () => goToMonth(() => { Model.currentDate = new Date(); }));

  View.elements.closeDayDetailBtn.addEventListener('click', closeDayDetail);
  View.elements.addNewPinBtn.addEventListener('click', () => openPinModal(null));
  View.elements.closeModalBtn.addEventListener('click', closePinModal);
  View.elements.fabAdd.addEventListener('click', () => openPinModal(null, todayStr()));
  View.elements.todayAddBtn.addEventListener('click', () => openPinModal(null, todayStr()));
  View.elements.searchInput.addEventListener('input', refreshHome);

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

  // Date + time fields. (iOS has no "clear" button on a time input, so we add one.)
  View.elements.pinDateInput.addEventListener('change', (e) => {
    if (isValidDateStr(e.target.value)) View.elements.modalDateTitle.textContent = shortDate(e.target.value);
  });
  View.elements.pinTimeInput.addEventListener('input', updateClearTimeButton);
  View.elements.clearTimeBtn.addEventListener('click', () => {
    View.elements.pinTimeInput.value = '';
    updateClearTimeButton();
    View.elements.pinTimeInput.focus();
  });

  // A <form> submit covers both the Set button and the keyboard's Enter / Done key.
  View.elements.pinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = View.elements.pinTitleInput.value.trim();
    if (!title) return;

    const fromDateStr = Model.activePinDateStr;
    // If the date field was cleared or is invalid, keep the set where it was.
    const dateStr = isValidDateStr(View.elements.pinDateInput.value)
      ? View.elements.pinDateInput.value
      : (fromDateStr ?? Model.selectedDateStr ?? todayStr());

    Model.savePin(
      { dateStr, title, emoji: Model.selectedEmoji, note: View.elements.pinNoteInput.value.trim(), time: View.elements.pinTimeInput.value },
      { pinId: Model.activePinId, fromDateStr }
    );
    refreshAll();
    closePinModal();
    if (fromDateStr && dateStr !== fromDateStr) View.showToast(`Moved to ${weekdayDate(dateStr)}`);
  });

  View.elements.deletePinBtn.addEventListener('click', () => {
    if (Model.activePinId) {
      deleteWithUndo(Model.activePinDateStr, Model.activePinId);
      closePinModal();
    }
  });

  // ---------- Backup: export / import ----------
  View.elements.exportBtn.addEventListener('click', () => {
    const total = countSets(Model.pins);
    if (total === 0) return View.showToast('Nothing to export yet. Add a set first.');
    const blob = new Blob([JSON.stringify(Model.exportBackup(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    View.showToast(`Backup saved: ${plural(total, 'set')}`);
  });

  View.elements.importBtn.addEventListener('click', () => View.elements.importFile.click());

  View.elements.importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // so choosing the same file again still fires "change"
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) return View.showToast('That file is too large to be a Set backup.');

    const result = parseBackup(await file.text());
    if (!result.ok) return View.showToast(result.error);

    const snapshot = JSON.parse(JSON.stringify(Model.pins)); // for Undo
    const { added, duplicates } = Model.importPins(result.pins);
    refreshAll();

    if (added === 0) return View.showToast(`Nothing new: all ${plural(duplicates, 'set')} are already here.`);
    const notes = [duplicates && `${duplicates} already here`, result.skipped && `${result.skipped} skipped`].filter(Boolean);
    View.showToast(`Imported ${plural(added, 'set')}${notes.length ? ` · ${notes.join(' · ')}` : ''}`, 'Undo', () => {
      Model.replaceAll(snapshot);
      refreshAll();
    }, 9000);
  });

  // Coming back to the app (e.g. the next morning) should show the right "today".
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshAll();
  });

  // ---------- Appearance ----------
  // The inline script in index.html already applied the saved theme before first paint
  // (no flash); here we load the same settings into the model and wire up the controls.
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

  View.switchTab('home');
  refreshAll();
});
