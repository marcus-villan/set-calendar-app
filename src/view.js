import { toDateStr, dateToStr } from './utils.js';

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const View = {
  elements: {},
  returnFocus: new Map(),

  bindElements() {
    this.elements = {
      calendarGrid: document.getElementById('calendarGrid'),
      currentMonthYear: document.getElementById('currentMonthYear'),
      prevMonthBtn: document.getElementById('prevMonth'),
      nextMonthBtn: document.getElementById('nextMonth'),
      todayBtn: document.getElementById('todayBtn'),
      navCalendarBtn: document.getElementById('navCalendarBtn'),
      navSettingsBtn: document.getElementById('navSettingsBtn'),
      calendarView: document.getElementById('calendarView'),
      settingsView: document.getElementById('settingsView'),
      settingsThemeToggle: document.getElementById('settingsThemeToggle'),
      dayDetailModal: document.getElementById('dayDetailModal'),
      dayDetailTitle: document.getElementById('dayDetailTitle'),
      dayPinsList: document.getElementById('dayPinsList'),
      closeDayDetailBtn: document.getElementById('closeDayDetailBtn'),
      addNewPinBtn: document.getElementById('addNewPinBtn'),
      pinModal: document.getElementById('pinModal'),
      pinForm: document.getElementById('pinForm'),
      modalDateTitle: document.getElementById('modalDateTitle'),
      pinTitleInput: document.getElementById('pinTitle'),
      emojiPresetsContainer: document.getElementById('emojiPresets'),
      selectedEmojiPreview: document.getElementById('selectedEmojiPreview'),
      closeModalBtn: document.getElementById('closeModalBtn'),
      savePinBtn: document.getElementById('savePinBtn'),
      deletePinBtn: document.getElementById('deletePinBtn'),
      upcomingList: document.getElementById('upcomingList'),
      pinCount: document.getElementById('pinCount')
    };
  },

  applyTheme(isDark) {
    document.documentElement.classList.toggle('dark', isDark);
    this.elements.settingsThemeToggle.setAttribute('aria-checked', String(isDark));
    // Keep the browser chrome (Safari toolbar tint) matching the page background.
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  },

  switchTab(tabName) {
    const { calendarView, settingsView, navCalendarBtn, navSettingsBtn } = this.elements;
    const showCalendar = tabName === 'calendar';

    calendarView.classList.toggle('hidden', !showCalendar);
    settingsView.classList.toggle('hidden', showCalendar);
    // The .nav-tab[aria-current="page"] rule in style.css does the visual styling.
    navCalendarBtn.setAttribute('aria-current', showCalendar ? 'page' : 'false');
    navSettingsBtn.setAttribute('aria-current', showCalendar ? 'false' : 'page');
  },

  // ---------- Modals ----------
  // Open/close just flips data-open; CSS transitions do the animation (both directions).

  openModal(modal, focusEl) {
    this.returnFocus.set(modal, document.activeElement);
    modal.dataset.open = 'true';
    modal.setAttribute('aria-hidden', 'false');
    document.body.dataset.modalOpen = 'true';
    // Must run synchronously inside the tap handler, or iOS won't show the keyboard.
    (focusEl || modal.querySelector(FOCUSABLE))?.focus({ preventScroll: true });
  },

  closeModal(modal) {
    if (modal.dataset.open !== 'true') return;
    modal.dataset.open = 'false';
    modal.setAttribute('aria-hidden', 'true');

    const stillOpen = this.topOpenModal();
    if (!stillOpen) delete document.body.dataset.modalOpen;

    // Give focus back to what opened the modal; if that element was re-rendered
    // (and so is detached), fall back to the modal underneath.
    const back = this.returnFocus.get(modal);
    this.returnFocus.delete(modal);
    if (back?.isConnected) back.focus({ preventScroll: true });
    else stillOpen?.querySelector(FOCUSABLE)?.focus({ preventScroll: true });
  },

  // Later in the DOM = higher z-index, so the last open one is on top.
  topOpenModal() {
    const open = document.querySelectorAll('.modal[data-open="true"]');
    return open[open.length - 1] || null;
  },

  // Keep Tab / Shift+Tab inside the open modal.
  trapFocus(e) {
    const modal = this.topOpenModal();
    if (!modal) return;
    const items = [...modal.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!modal.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  },

  focusDay(dateStr) {
    this.elements.calendarGrid.querySelector(`[data-date="${dateStr}"]`)?.focus({ preventScroll: true });
  },

  // ---------- Calendar ----------

  // direction: -1 (went back), 1 (went forward), 0 (no slide, e.g. after saving a pin)
  renderCalendar(currentDate, pins, onDateClick, direction = 0) {
    this.elements.calendarGrid.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    this.elements.currentMonthYear.textContent = `${MONTH_NAMES[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const todayStr = dateToStr(new Date());

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      this.elements.calendarGrid.appendChild(this.createDayBox(prevMonthDays - i, true));
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = toDateStr(year, month, day);
      const isToday = dateStr === todayStr;
      const datePins = pins[dateStr] || [];
      this.elements.calendarGrid.appendChild(this.createDayBox(day, false, isToday, dateStr, datePins, onDateClick));
    }

    const totalRendered = firstDayIndex + daysInMonth;
    const remainingGrid = (totalRendered > 35 ? 42 : 35) - totalRendered;
    for (let i = 1; i <= remainingGrid; i++) {
      this.elements.calendarGrid.appendChild(this.createDayBox(i, true));
    }

    this.renderUpcomingList(pins);
    this.animateGrid(direction);
  },

  // Slide the new month in from the side we navigated towards.
  animateGrid(direction) {
    if (!direction || prefersReducedMotion()) return;
    this.elements.calendarGrid.animate(
      [
        { opacity: 0, transform: `translateX(${direction * 28}px)` },
        { opacity: 1, transform: 'none' }
      ],
      { duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
    );
  },

  createDayBox(dayNum, isDisabled, isToday = false, dateStr = null, dayPins = [], onDateClick) {
    // Real <button>s so days are reachable and operable by keyboard / screen reader.
    const cell = document.createElement(isDisabled ? 'div' : 'button');
    cell.className = 'day-cell';

    if (isDisabled) {
      cell.classList.add('day-cell--outside');
      cell.setAttribute('aria-hidden', 'true');
    } else {
      cell.type = 'button';
      cell.dataset.date = dateStr;
      if (dayPins.length > 0) cell.classList.add('day-cell--has-pins');
      if (isToday) cell.setAttribute('aria-current', 'date');

      const [y, m, d] = dateStr.split('-').map(Number);
      let label = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      if (dayPins.length > 0) label += `, ${dayPins.length} ${dayPins.length === 1 ? 'plan' : 'plans'}: ${dayPins.map(p => p.title).join(', ')}`;
      cell.setAttribute('aria-label', label);
      cell.onclick = () => onDateClick(dateStr);
    }

    const numSpan = document.createElement('span');
    numSpan.className = `day-num ${isToday ? 'day-num--today' : ''}`;
    numSpan.textContent = dayNum;
    cell.appendChild(numSpan);

    if (dayPins.length > 0 && !isDisabled) {
      const pinContainer = document.createElement('div');
      pinContainer.className = "mt-1 flex items-center justify-start gap-0.5 overflow-hidden whitespace-nowrap sm:gap-1";
      pinContainer.setAttribute('aria-hidden', 'true');
      // Cells are narrow on phones: fit 2 slots there, 3 on wider screens. When pins
      // overflow, the last slot becomes a "+N" badge so nothing is silently clipped.
      const slots = window.matchMedia('(min-width: 640px)').matches ? 3 : 2;
      const shown = dayPins.length > slots ? slots - 1 : dayPins.length;
      dayPins.slice(0, shown).forEach(pin => {
        const emojiSpan = document.createElement('span');
        emojiSpan.className = "inline-block text-xs sm:text-sm";
        emojiSpan.textContent = pin.emoji || '📍';
        pinContainer.appendChild(emojiSpan);
      });
      if (dayPins.length > shown) {
        const moreSpan = document.createElement('span');
        moreSpan.className = "text-[10px] font-bold leading-none text-accent";
        moreSpan.textContent = `+${dayPins.length - shown}`;
        pinContainer.appendChild(moreSpan);
      }
      cell.appendChild(pinContainer);
    }

    return cell;
  },

  renderDayPinsList(pins, dateStr, onEditPin) {
    this.elements.dayPinsList.innerHTML = '';
    const dayPins = pins[dateStr] || [];

    if (dayPins.length === 0) {
      this.elements.dayPinsList.innerHTML = `
        <div class="py-6 text-center text-muted">
          <i class="fa-regular fa-calendar-xmark mb-2 text-2xl" aria-hidden="true"></i>
          <p class="text-xs">No plans pinned for this day yet.</p>
        </div>`;
      return;
    }

    dayPins.forEach((pin, i) => {
      const item = document.createElement('div');
      item.className = "pin-row animate-slideUp";
      item.style.animationDelay = `${i * 40}ms`; // gentle stagger

      const content = document.createElement('div');
      content.className = "flex items-center gap-2.5 overflow-hidden";

      const emojiSpan = document.createElement('span');
      emojiSpan.className = "text-xl";
      emojiSpan.setAttribute('aria-hidden', 'true');
      emojiSpan.textContent = pin.emoji;

      const titleSpan = document.createElement('span');
      titleSpan.className = "truncate text-sm font-semibold text-ink";
      titleSpan.textContent = pin.title;

      content.appendChild(emojiSpan);
      content.appendChild(titleSpan);

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = "p-2 text-muted transition-colors hover:text-accent";
      editBtn.setAttribute('aria-label', `Edit ${pin.title}`);
      editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square text-xs" aria-hidden="true"></i>';
      editBtn.onclick = () => onEditPin(pin.id);

      item.appendChild(content);
      item.appendChild(editBtn);
      this.elements.dayPinsList.appendChild(item);
    });
  },

  renderUpcomingList(pins) {
    this.elements.upcomingList.innerHTML = '';
    let totalCount = 0;
    const sortedDates = Object.keys(pins).sort();

    sortedDates.forEach(date => {
      pins[date].forEach(pin => {
        totalCount++;
        const chip = document.createElement('div');
        chip.className = "chip";

        const emoji = document.createElement('span');
        emoji.textContent = pin.emoji;

        const title = document.createElement('span');
        title.className = "font-medium text-ink";
        title.textContent = pin.title;

        chip.appendChild(emoji);
        chip.appendChild(title);
        this.elements.upcomingList.appendChild(chip);
      });
    });

    this.elements.pinCount.textContent = `${totalCount} active`;
  },

  renderEmojiPresets(options, currentEmoji, onSelect) {
    this.elements.emojiPresetsContainer.innerHTML = '';
    options.forEach(emoji => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const active = emoji === currentEmoji;
      btn.className = `emoji-btn ${active ? 'emoji-btn--active animate-pop' : ''}`;
      btn.setAttribute('aria-pressed', String(active));
      btn.setAttribute('aria-label', `Pin emoji ${emoji}`);
      btn.textContent = emoji;
      btn.onclick = () => onSelect(emoji);
      this.elements.emojiPresetsContainer.appendChild(btn);
    });
  }
};
