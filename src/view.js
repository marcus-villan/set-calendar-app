export const View = {
  elements: {},

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
      dayDetailCard: document.getElementById('dayDetailCard'),
      dayDetailTitle: document.getElementById('dayDetailTitle'),
      dayPinsList: document.getElementById('dayPinsList'),
      closeDayDetailBtn: document.getElementById('closeDayDetailBtn'),
      addNewPinBtn: document.getElementById('addNewPinBtn'),
      pinModal: document.getElementById('pinModal'),
      modalCard: document.getElementById('modalCard'),
      modalDateTitle: document.getElementById('modalDateTitle'),
      pinTitleInput: document.getElementById('pinTitle'),
      emojiPresetsContainer: document.getElementById('emojiPresets'),
      selectedEmojiPreview: document.getElementById('selectedEmojiPreview'),
      closeModalBtn: document.getElementById('closeModalBtn'),
      savePinBtn: document.getElementById('savePinBtn'),
      deletePinBtn: document.getElementById('deletePinBtn'),
      upcomingList: document.getElementById('upcomingList'),
      settingsThemeToggle: document.getElementById('settingsThemeToggle'),
      pinCount: document.getElementById('pinCount')
    };
  },

  switchTab(tabName) {
  const calendarView = document.getElementById('calendarView');
  const settingsView = document.getElementById('settingsView');
  const navCalendarBtn = document.getElementById('navCalendarBtn');
  const navSettingsBtn = document.getElementById('navSettingsBtn');

  const activeClasses = ['bg-white', 'dark:bg-slate-700', 'text-slate-900', 'dark:text-white', 'shadow-xs'];
  const inactiveClasses = ['bg-transparent', 'text-slate-500', 'hover:text-slate-900', 'dark:hover:text-white', 'shadow-none'];

  if (tabName === 'calendar') {
    calendarView.classList.remove('hidden');
    settingsView.classList.add('hidden');

    navCalendarBtn.classList.add(...activeClasses);
    navCalendarBtn.classList.remove(...inactiveClasses);

    navSettingsBtn.classList.remove(...activeClasses);
    navSettingsBtn.classList.add(...inactiveClasses);
    } else {
    calendarView.classList.add('hidden');
    settingsView.classList.remove('hidden');

    navSettingsBtn.classList.add(...activeClasses);
    navSettingsBtn.classList.remove(...inactiveClasses);

    navCalendarBtn.classList.remove(...activeClasses);
    navCalendarBtn.classList.add(...inactiveClasses);
    }
  },

  renderCalendar(currentDate, pins, onDateClick) {
    this.elements.calendarGrid.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    this.elements.currentMonthYear.textContent = `${monthNames[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      this.elements.calendarGrid.appendChild(this.createDayBox(prevMonthDays - i, true));
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
  },

  createDayBox(dayNum, isDisabled, isToday = false, dateStr = null, dayPins = [], onDateClick) {
    const btn = document.createElement('div');
    let baseClasses = "relative rounded-2xl sm:rounded-3xl p-1.5 sm:p-2 transition-all duration-200 ease-out flex flex-col justify-between cursor-pointer border select-none min-h-[52px] sm:min-h-[70px] active:scale-95 animate-fadeIn ";
    
    if (isDisabled) {
      baseClasses += "bg-slate-100/40 dark:bg-slate-900/20 border-transparent text-slate-300 dark:text-slate-700 pointer-events-none active:scale-100";
    } else if (dayPins.length > 0) {
      baseClasses += "bg-brand-50/80 dark:bg-slate-700/80 border-brand-200 dark:border-brand-500/40 shadow-xs hover:border-brand-400 hover:shadow-md";
    } else {
      baseClasses += "bg-slate-50/60 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-700/40 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:border-slate-300";
    }

    btn.className = baseClasses;
    if (!isDisabled && dateStr) btn.onclick = () => onDateClick(dateStr);

    const dayHeader = document.createElement('div');
    dayHeader.className = "flex items-center justify-between w-full";
    const numSpan = document.createElement('span');
    numSpan.className = `text-xs sm:text-sm font-bold ${isToday ? 'bg-brand-600 text-white px-2 py-0.5 rounded-full shadow-sm' : 'text-slate-700 dark:text-slate-300'}`;
    numSpan.textContent = dayNum;
    dayHeader.appendChild(numSpan);
    btn.appendChild(dayHeader);

    if (dayPins.length > 0 && !isDisabled) {
      const pinContainer = document.createElement('div');
      pinContainer.className = "mt-1 flex flex-wrap gap-1 items-center justify-start overflow-hidden max-h-[32px]";
      dayPins.slice(0, 3).forEach(pin => {
        const emojiSpan = document.createElement('span');
        emojiSpan.className = "text-xs sm:text-sm transition-transform hover:scale-125 inline-block";
        emojiSpan.textContent = pin.emoji || '📍';
        pinContainer.appendChild(emojiSpan);
      });
      if (dayPins.length > 3) {
        const moreSpan = document.createElement('span');
        moreSpan.className = "text-[9px] font-bold text-brand-600 dark:text-brand-400 bg-brand-100 dark:bg-brand-900/60 px-1 rounded-full";
        moreSpan.textContent = `+${dayPins.length - 3}`;
        pinContainer.appendChild(moreSpan);
      }
      btn.appendChild(pinContainer);
    }

    return btn;
  },

  renderDayPinsList(pins, dateStr, onEditPin) {
    this.elements.dayPinsList.innerHTML = '';
    const dayPins = pins[dateStr] || [];

    if (dayPins.length === 0) {
      this.elements.dayPinsList.innerHTML = `
        <div class="text-center py-6 text-slate-400 dark:text-slate-500">
          <i class="fa-regular fa-calendar-xmark text-2xl mb-2"></i>
          <p class="text-xs">No plans pinned for this day yet.</p>
        </div>`;
      return;
    }

    dayPins.forEach(pin => {
      const item = document.createElement('div');
      item.className = "flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 hover:border-brand-500 transition-all animate-slideUp";
      
      const content = document.createElement('div');
      content.className = "flex items-center gap-2.5 overflow-hidden";
      
      const emojiSpan = document.createElement('span');
      emojiSpan.className = "text-xl";
      emojiSpan.textContent = pin.emoji;
      
      const titleSpan = document.createElement('span');
      titleSpan.className = "font-semibold text-xs sm:text-sm text-slate-800 dark:text-slate-100 truncate";
      titleSpan.textContent = pin.title;
      
      content.appendChild(emojiSpan);
      content.appendChild(titleSpan);

      const editBtn = document.createElement('button');
      editBtn.className = "text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 p-1.5 transition-colors";
      editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square text-xs"></i>';
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
        chip.className = "flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700/50 px-2.5 py-1 rounded-xl whitespace-nowrap border border-slate-200/50 dark:border-slate-600/40";
        
        const emoji = document.createElement('span');
        emoji.textContent = pin.emoji;
        
        const title = document.createElement('span');
        title.className = "font-medium text-slate-700 dark:text-slate-200";
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
      btn.className = `p-2 text-xl rounded-xl transition-transform hover:scale-110 flex items-center justify-center ${emoji === currentEmoji ? 'bg-brand-100 dark:bg-brand-900/60 ring-2 ring-brand-500' : 'bg-slate-100 dark:bg-slate-900/50'}`;
      btn.textContent = emoji;
      btn.onclick = () => onSelect(emoji);
      this.elements.emojiPresetsContainer.appendChild(btn);
    });
  }
};