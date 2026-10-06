import { toDateStr, dateToStr, relativeDayLabel, formatTime, longDate, dateLabelWithYear, shortDate, weekdayDate } from './utils.js';

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
      navHomeBtn: document.getElementById('navHomeBtn'),
      navCalendarBtn: document.getElementById('navCalendarBtn'),
      navSettingsBtn: document.getElementById('navSettingsBtn'),
      homeView: document.getElementById('homeView'),
      calendarView: document.getElementById('calendarView'),
      todayHeading: document.getElementById('todayHeading'),
      todaySummary: document.getElementById('todaySummary'),
      todayList: document.getElementById('todayList'),
      todayAddBtn: document.getElementById('todayAddBtn'),
      searchInput: document.getElementById('searchInput'),
      nextUpTitle: document.getElementById('nextUpTitle'),
      nextUpCount: document.getElementById('nextUpCount'),
      nextUpList: document.getElementById('nextUpList'),
      statsTitle: document.getElementById('statsTitle'),
      statTotal: document.getElementById('statTotal'),
      statDays: document.getElementById('statDays'),
      statBusiest: document.getElementById('statBusiest'),
      statBusiestLabel: document.getElementById('statBusiestLabel'),
      statNext: document.getElementById('statNext'),
      statNextLabel: document.getElementById('statNextLabel'),
      accountText: document.getElementById('accountText'),
      accountError: document.getElementById('accountError'),
      accountSignedOut: document.getElementById('accountSignedOut'),
      accountSignedIn: document.getElementById('accountSignedIn'),
      googleSignInBtn: document.getElementById('googleSignInBtn'),
      googleSignInLabel: document.getElementById('googleSignInLabel'),
      accountAvatar: document.getElementById('accountAvatar'),
      accountName: document.getElementById('accountName'),
      accountEmail: document.getElementById('accountEmail'),
      signOutBtn: document.getElementById('signOutBtn'),
      syncStatus: document.getElementById('syncStatus'),
      syncNowBtn: document.getElementById('syncNowBtn'),
      installBanner: document.getElementById('installBanner'),
      installBtn: document.getElementById('installBtn'),
      installDismissBtn: document.getElementById('installDismissBtn'),
      installSettingsRow: document.getElementById('installSettingsRow'),
      installSettingsText: document.getElementById('installSettingsText'),
      installSettingsBtn: document.getElementById('installSettingsBtn'),
      installSettingsLabel: document.getElementById('installSettingsLabel'),
      installModal: document.getElementById('installModal'),
      installStepsIOS: document.getElementById('installStepsIOS'),
      installStepsManual: document.getElementById('installStepsManual'),
      closeInstallBtn: document.getElementById('closeInstallBtn'),
      installDoneBtn: document.getElementById('installDoneBtn'),
      installExportBtn: document.getElementById('installExportBtn'),
      dataSummary: document.getElementById('dataSummary'),
      exportBtn: document.getElementById('exportBtn'),
      importBtn: document.getElementById('importBtn'),
      importFile: document.getElementById('importFile'),
      fabWrap: document.getElementById('fabWrap'),
      fabAdd: document.getElementById('fabAdd'),
      settingsView: document.getElementById('settingsView'),
      modeButtons: [...document.querySelectorAll('[data-mode]')],
      paletteGroup: document.getElementById('paletteGroup'),
      dayDetailModal: document.getElementById('dayDetailModal'),
      dayDetailTitle: document.getElementById('dayDetailTitle'),
      dayPinsList: document.getElementById('dayPinsList'),
      closeDayDetailBtn: document.getElementById('closeDayDetailBtn'),
      addNewPinBtn: document.getElementById('addNewPinBtn'),
      pinModal: document.getElementById('pinModal'),
      pinForm: document.getElementById('pinForm'),
      modalDateTitle: document.getElementById('modalDateTitle'),
      pinTitleInput: document.getElementById('pinTitle'),
      pinNoteInput: document.getElementById('pinNote'),
      pinDateInput: document.getElementById('pinDate'),
      pinTimeInput: document.getElementById('pinTime'),
      clearTimeBtn: document.getElementById('clearTimeBtn'),
      customEmojiInput: document.getElementById('customEmoji'),
      toast: document.getElementById('toast'),
      toastMessage: document.getElementById('toastMessage'),
      toastAction: document.getElementById('toastAction'),
      emojiPresetsContainer: document.getElementById('emojiPresets'),
      selectedEmojiPreview: document.getElementById('selectedEmojiPreview'),
      closeModalBtn: document.getElementById('closeModalBtn'),
      savePinBtn: document.getElementById('savePinBtn'),
      deletePinBtn: document.getElementById('deletePinBtn'),
      upcomingList: document.getElementById('upcomingList'),
      pinCount: document.getElementById('pinCount')
    };
  },

  // mode: 'system' | 'light' | 'dark'.  palette: a theme id (see Model.palettes).
  // The page is styled by <html data-theme="..." class="dark?">; see the tokens in style.css.
  applyAppearance(mode, palette) {
    const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.dataset.theme = palette;

    this.elements.modeButtons.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode)));
    this.elements.paletteGroup.querySelectorAll('[data-palette]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.palette === palette));
    });

    // Keep the browser chrome (Safari toolbar tint) matching the page background.
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  },

  // Each card carries data-theme itself, so it previews ITS palette no matter which one is active.
  renderPaletteOptions(palettes, onSelect) {
    this.elements.paletteGroup.innerHTML = '';
    palettes.forEach(({ id, name }) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'theme-card';
      card.dataset.theme = id;
      card.dataset.palette = id;
      card.setAttribute('aria-label', `${name} theme`);

      const swatch = document.createElement('div');
      swatch.className = 'theme-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      ['bg-bg', 'bg-surface-2', 'bg-primary', 'bg-accent'].forEach(colorClass => {
        const chip = document.createElement('span');
        chip.className = `flex-1 ${colorClass}`;
        swatch.appendChild(chip);
      });

      const label = document.createElement('span');
      label.className = 'text-xs font-bold';
      label.textContent = name;

      card.appendChild(swatch);
      card.appendChild(label);
      card.onclick = () => onSelect(id);
      this.elements.paletteGroup.appendChild(card);
    });
  },

  // tabName: 'home' | 'calendar' | 'settings'
  switchTab(tabName) {
    const views = { home: this.elements.homeView, calendar: this.elements.calendarView, settings: this.elements.settingsView };
    const buttons = { home: this.elements.navHomeBtn, calendar: this.elements.navCalendarBtn, settings: this.elements.navSettingsBtn };
    for (const name of Object.keys(views)) {
      views[name].classList.toggle('hidden', name !== tabName);
      // The .nav-tab[aria-current="page"] rule in style.css does the visual styling.
      buttons[name].setAttribute('aria-current', name === tabName ? 'page' : 'false');
    }
    // "Today" jumps the month grid, so it only makes sense on the calendar; the add button isn't needed in Settings.
    this.elements.todayBtn.classList.toggle('hidden', tabName !== 'calendar');
    this.elements.fabWrap.classList.toggle('hidden', tabName === 'settings');
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
    // The toast lives outside the modal; keep its Undo button keyboard-reachable.
    if (this.elements.toast.dataset.open === 'true' && !this.elements.toastAction.classList.contains('hidden')) items.push(this.elements.toastAction);
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
      pinContainer.className = "mt-0.5 flex items-center justify-start gap-0.5 whitespace-nowrap";
      pinContainer.setAttribute('aria-hidden', 'true');
      // A constant 2 slots (fits the narrowest phone cell), independent of window size or zoom.
      // When pins overflow, the last slot becomes a "+N" badge so nothing is silently clipped.
      const slots = 2;
      const shown = dayPins.length > slots ? slots - 1 : dayPins.length;
      dayPins.slice(0, shown).forEach(pin => {
        const emojiSpan = document.createElement('span');
        emojiSpan.className = "inline-block text-[15px] leading-[20px]";
        emojiSpan.textContent = pin.emoji || '📍';
        pinContainer.appendChild(emojiSpan);
      });
      if (dayPins.length > shown) {
        const moreSpan = document.createElement('span');
        moreSpan.className = "text-[11px] font-bold leading-[20px] text-accent";
        moreSpan.textContent = `+${dayPins.length - shown}`;
        pinContainer.appendChild(moreSpan);
      }
      cell.appendChild(pinContainer);
    }

    return cell;
  },

  // One set as a row: emoji, title, an optional "time · note" line, and edit / delete buttons.
  // User text only ever goes in through textContent, so it is never parsed as HTML.
  buildPinRow(pin, { onEdit, onDelete, index = 0 }) {
    const item = document.createElement('div');
    item.className = "pin-row animate-slideUp";
    item.style.animationDelay = `${index * 40}ms`; // gentle stagger

    const content = document.createElement('div');
    content.className = "flex min-w-0 items-center gap-2.5";

    const emojiSpan = document.createElement('span');
    emojiSpan.className = "text-xl";
    emojiSpan.setAttribute('aria-hidden', 'true');
    emojiSpan.textContent = pin.emoji;

    const text = document.createElement('div');
    text.className = "min-w-0";
    const titleSpan = document.createElement('p');
    titleSpan.className = "truncate text-sm font-semibold text-ink";
    titleSpan.textContent = pin.title;
    text.appendChild(titleSpan);

    const time = formatTime(pin.time);
    if (time || pin.note) {
      const meta = document.createElement('p');
      meta.className = "line-clamp-2 text-xs text-muted";
      if (time) {
        const timeSpan = document.createElement('span');
        timeSpan.className = "font-semibold text-accent";
        timeSpan.textContent = time;
        meta.appendChild(timeSpan);
      }
      if (time && pin.note) meta.appendChild(document.createTextNode(' · '));
      if (pin.note) meta.appendChild(document.createTextNode(pin.note));
      text.appendChild(meta);
    }

    content.appendChild(emojiSpan);
    content.appendChild(text);

    const actions = document.createElement('div');
    actions.className = "flex shrink-0 items-center gap-0.5";

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = "row-action";
    editBtn.setAttribute('aria-label', `Edit ${pin.title}`);
    editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square text-xs" aria-hidden="true"></i>';
    editBtn.onclick = () => onEdit(pin.id);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = "row-action row-action--danger";
    deleteBtn.setAttribute('aria-label', `Delete ${pin.title}`);
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can text-xs" aria-hidden="true"></i>';
    deleteBtn.onclick = () => onDelete(pin.id);

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(content);
    item.appendChild(actions);
    return item;
  },

  renderDayPinsList(pins, dateStr, onEditPin, onDeletePin) {
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
      this.elements.dayPinsList.appendChild(this.buildPinRow(pin, { onEdit: onEditPin, onDelete: onDeletePin, index: i }));
    });
  },

  // items: [{ dateStr, pin }] from Model.upcoming(). Each chip is a button that opens that pin's editor.
  renderUpcomingList(items, todayStr, onPinClick) {
    this.elements.upcomingList.innerHTML = '';

    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = "px-1 py-1.5 text-xs text-muted";
      empty.textContent = 'Nothing coming up. Tap a day to set something.';
      this.elements.upcomingList.appendChild(empty);
    }

    items.forEach(({ dateStr, pin }) => {
      const time = formatTime(pin.time);
      const when = relativeDayLabel(dateStr, todayStr) + (time ? ` · ${time}` : '');
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = "chip";
      chip.setAttribute('aria-label', `Edit ${pin.title}, ${when}`);

      const emoji = document.createElement('span');
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = pin.emoji;

      const title = document.createElement('span');
      title.className = "font-medium text-ink";
      title.textContent = pin.title;

      const whenSpan = document.createElement('span');
      whenSpan.className = "text-muted";
      whenSpan.textContent = when;

      chip.appendChild(emoji);
      chip.appendChild(title);
      chip.appendChild(whenSpan);
      chip.onclick = () => onPinClick(dateStr, pin.id);
      this.elements.upcomingList.appendChild(chip);
    });

    this.elements.pinCount.textContent = `${items.length} upcoming`;
  },

  // ---------- Home dashboard ----------

  // One tappable row: emoji, title, and a "when · time · note" line. Tapping opens the editor.
  buildAgendaRow({ dateStr, pin }, whenLabel, onOpen) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = "agenda-row";
    const time = formatTime(pin.time);
    row.setAttribute('aria-label', `Edit ${pin.title}, ${whenLabel}${time ? `, ${time}` : ''}`);

    const emoji = document.createElement('span');
    emoji.className = "text-xl";
    emoji.setAttribute('aria-hidden', 'true');
    emoji.textContent = pin.emoji;

    const text = document.createElement('div');
    text.className = "min-w-0 flex-grow";
    const title = document.createElement('p');
    title.className = "truncate text-sm font-semibold text-ink";
    title.textContent = pin.title;
    const meta = document.createElement('p');
    meta.className = "truncate text-xs text-muted";
    meta.appendChild(document.createTextNode(whenLabel));
    if (time) {
      meta.appendChild(document.createTextNode(' · '));
      const timeSpan = document.createElement('span');
      timeSpan.className = "font-semibold text-accent";
      timeSpan.textContent = time;
      meta.appendChild(timeSpan);
    }
    if (pin.note) meta.appendChild(document.createTextNode(` · ${pin.note}`));
    text.appendChild(title);
    text.appendChild(meta);

    const chevron = document.createElement('i');
    chevron.className = "fa-solid fa-chevron-right text-[10px] text-muted";
    chevron.setAttribute('aria-hidden', 'true');

    row.appendChild(emoji);
    row.appendChild(text);
    row.appendChild(chevron);
    row.onclick = () => onOpen(dateStr, pin.id);
    return row;
  },

  // `summary` is computed by the caller (it needs the current time); pins are today's sets.
  renderToday(todayStr, pins, summary, { onEdit, onDelete }) {
    this.elements.todayHeading.textContent = longDate(todayStr);
    this.elements.todaySummary.textContent = summary;
    this.elements.todayList.innerHTML = '';
    pins.forEach((pin, i) => {
      this.elements.todayList.appendChild(this.buildPinRow(pin, { onEdit, onDelete, index: i }));
    });
  },

  // groups: [{ key, label, items: [{ dateStr, pin }] }] from groupByRange().
  renderNextUp(groups, todayStr, hiddenCount, onOpen) {
    const { nextUpList, nextUpTitle, nextUpCount } = this.elements;
    nextUpList.innerHTML = '';
    nextUpTitle.textContent = 'Next up';

    const total = groups.reduce((n, g) => n + g.items.length, 0);
    nextUpCount.textContent = String(total + hiddenCount);

    if (total === 0) {
      const empty = document.createElement('p');
      empty.className = "py-2 text-center text-sm text-muted";
      empty.textContent = 'Nothing else coming up. Tap + to set something.';
      nextUpList.appendChild(empty);
      return;
    }

    groups.forEach(group => {
      const section = document.createElement('div');
      section.className = "space-y-2";
      const heading = document.createElement('h3');
      heading.className = "label-uppercase";
      heading.textContent = group.label;
      section.appendChild(heading);
      group.items.forEach(item => {
        section.appendChild(this.buildAgendaRow(item, weekdayDate(item.dateStr), onOpen));
      });
      nextUpList.appendChild(section);
    });

    if (hiddenCount > 0) {
      const more = document.createElement('p');
      more.className = "text-center text-xs text-muted";
      more.textContent = `+${hiddenCount} more. See them in Calendar.`;
      nextUpList.appendChild(more);
    }
  },

  // Flat list of matches while the search box has text.
  renderSearchResults(query, results, todayStr, onOpen) {
    const { nextUpList, nextUpTitle, nextUpCount } = this.elements;
    nextUpList.innerHTML = '';
    nextUpTitle.textContent = 'Search results';
    nextUpCount.textContent = String(results.length);

    if (results.length === 0) {
      const empty = document.createElement('p');
      empty.className = "py-2 text-center text-sm text-muted";
      empty.textContent = `No sets match “${query.trim()}”.`;
      nextUpList.appendChild(empty);
      return;
    }
    const list = document.createElement('div');
    list.className = "space-y-2";
    results.forEach(item => list.appendChild(this.buildAgendaRow(item, dateLabelWithYear(item.dateStr, todayStr), onOpen)));
    nextUpList.appendChild(list);
  },

  // stats: from Model.stats(); next: from Model.nextSet() (or null).
  renderStats(monthName, stats, next, todayStr) {
    const e = this.elements;
    e.statsTitle.textContent = `${monthName} at a glance`;
    e.statTotal.textContent = String(stats.total);
    e.statDays.textContent = String(stats.daysPlanned);
    if (stats.busiest) {
      e.statBusiest.textContent = shortDate(stats.busiest.dateStr);
      e.statBusiestLabel.textContent = `Busiest day · ${stats.busiest.count} ${stats.busiest.count === 1 ? 'set' : 'sets'}`;
    } else {
      e.statBusiest.textContent = '—';
      e.statBusiestLabel.textContent = 'Busiest day';
    }
    if (next) {
      e.statNext.textContent = relativeDayLabel(next.dateStr, todayStr);
      e.statNextLabel.textContent = `Next · ${next.pin.title}`;
    } else {
      e.statNext.textContent = '—';
      e.statNextLabel.textContent = 'Next set';
    }
  },

  // ---------- Account ----------
  // person: from describeUser() or null when signed out. error: a short message or ''.
  renderAccount(person, error = '') {
    const e = this.elements;
    e.accountSignedOut.classList.toggle('hidden', !!person);
    e.accountSignedIn.classList.toggle('hidden', !person);
    e.accountError.classList.toggle('hidden', !error);
    e.accountError.textContent = error;
    e.googleSignInBtn.disabled = false;
    e.googleSignInLabel.textContent = 'Continue with Google';
    e.accountText.textContent = person
      ? 'Your sets are saved to this account and sync across your devices.'
      : 'Sign in to back up your sets and use them on all your devices.';
    if (person) {
      e.accountName.textContent = person.name;
      e.accountEmail.textContent = person.email;
      e.accountAvatar.classList.toggle('hidden', !person.avatar);
      if (person.avatar) e.accountAvatar.src = person.avatar;
    }
  },

  // text: e.g. "Synced at 7:42 PM". isError colors it; busy disables the button while a sync runs.
  renderSyncStatus(text, { isError = false, busy = false } = {}) {
    const e = this.elements;
    e.syncStatus.textContent = text;
    e.syncStatus.classList.toggle('text-danger', isError);
    e.syncStatus.classList.toggle('text-muted', !isError);
    e.syncNowBtn.disabled = busy;
  },

  setSigningIn() {
    this.elements.googleSignInBtn.disabled = true;
    this.elements.googleSignInLabel.textContent = 'Opening Google…';
  },

  // ---------- Install prompt ----------
  // mode: 'installed' | 'prompt' | 'ios' | 'manual' (see install.js). showBanner: decided by shouldShowBanner().
  renderInstall(mode, showBanner) {
    const e = this.elements;
    e.installBanner.classList.toggle('hidden', !showBanner);
    e.installBtn.textContent = mode === 'prompt' ? 'Install' : 'Show me how';

    // Settings keeps an entry point even after the banner is dismissed; once installed there is nothing to offer.
    e.installSettingsRow.classList.toggle('hidden', mode === 'installed');
    e.installSettingsLabel.textContent = mode === 'prompt' ? 'Install app' : mode === 'ios' ? 'Show me how' : 'How to install';
    e.installSettingsText.textContent = mode === 'prompt'
      ? 'Install Set for one-tap access and a full-screen experience.'
      : 'Add Set to your Home Screen for one-tap access.';
  },

  // Which instructions the install sheet shows.
  showInstallSteps(isIOS) {
    this.elements.installStepsIOS.classList.toggle('hidden', !isIOS);
    this.elements.installStepsManual.classList.toggle('hidden', isIOS);
  },

  // ---------- Toast ("Deleted. Undo") ----------
  showToast(message, actionLabel = null, onAction = null, duration = 6000) {
    const { toast, toastMessage, toastAction } = this.elements;
    clearTimeout(this.toastTimer);
    toastMessage.textContent = message;
    // No action label = a plain message (e.g. "Moved to Sat, Oct 12"), so hide the button.
    toastAction.classList.toggle('hidden', !actionLabel);
    toastAction.textContent = actionLabel ?? '';
    toastAction.onclick = () => {
      this.hideToast();
      onAction?.();
    };
    toast.dataset.open = 'true';
    this.toastTimer = setTimeout(() => this.hideToast(), duration);
  },

  hideToast() {
    clearTimeout(this.toastTimer);
    this.elements.toast.dataset.open = 'false';
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
