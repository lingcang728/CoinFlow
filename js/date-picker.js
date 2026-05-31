// CoinFlow dark themed date picker. Stores values as YYYY-MM-DD.
(function() {
  const instances = new WeakMap();
  let openInstance = null;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toDateString(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date();
    }
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  function monthLabel(date) {
    return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月`;
  }

  function displayLabel(value) {
    const date = parseDate(value);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function sameDay(a, b) {
    return a && b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function buildInstance(input, options = {}) {
    const trigger = options.trigger || input.nextElementSibling;
    if (!trigger) {
      throw new Error('Date picker trigger is missing');
    }

    const labelEl = trigger.querySelector('[data-date-label]') || trigger;
    const popover = document.createElement('div');
    popover.className = 'date-picker-popover';
    popover.hidden = true;

    let selectedDate = parseDate(input.value || window.CoinFlowUtils.getTodayDateString());
    let viewDate = new Date(selectedDate);

    if (!input.value) {
      input.value = toDateString(selectedDate);
    }

    function updateLabel() {
      labelEl.textContent = displayLabel(input.value);
    }

    function close() {
      popover.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (openInstance === instance) {
        openInstance = null;
      }
    }

    function open() {
      if (openInstance && openInstance !== instance) {
        openInstance.close();
      }
      openInstance = instance;
      selectedDate = parseDate(input.value);
      viewDate = new Date(selectedDate);
      render();
      popover.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    }

    function toggle() {
      if (popover.hidden) open();
      else close();
    }

    function selectDate(date) {
      selectedDate = date;
      input.value = toDateString(date);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      updateLabel();
      close();
    }

    function changeMonth(delta) {
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
      render();
    }

    function render() {
      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const previousMonthDays = new Date(year, month, 0).getDate();
      const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let cells = '';
      for (let i = 0; i < 42; i++) {
        const dayNumber = i - startOffset + 1;
        let cellDate;
        let muted = false;

        if (dayNumber < 1) {
          cellDate = new Date(year, month - 1, previousMonthDays + dayNumber);
          muted = true;
        } else if (dayNumber > daysInMonth) {
          cellDate = new Date(year, month + 1, dayNumber - daysInMonth);
          muted = true;
        } else {
          cellDate = new Date(year, month, dayNumber);
        }

        const classes = [
          'date-picker-day',
          muted ? 'is-muted' : '',
          sameDay(cellDate, selectedDate) ? 'is-selected' : '',
          sameDay(cellDate, today) ? 'is-today' : ''
        ].filter(Boolean).join(' ');

        cells += `<button type="button" class="${classes}" data-date="${toDateString(cellDate)}">${cellDate.getDate()}</button>`;
      }

      popover.innerHTML = `
        <div class="date-picker-header">
          <button type="button" class="icon-button date-picker-prev" aria-label="上个月">‹</button>
          <button type="button" class="date-picker-month" aria-label="当前月份">${monthLabel(viewDate)}</button>
          <button type="button" class="icon-button date-picker-next" aria-label="下个月">›</button>
        </div>
        <div class="date-picker-weekdays">
          <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
        </div>
        <div class="date-picker-grid">${cells}</div>
        <div class="date-picker-footer">
          <button type="button" class="text-button date-picker-clear">清除</button>
          <button type="button" class="text-button date-picker-today">今天</button>
        </div>
      `;
    }

    popover.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      if (target.classList.contains('date-picker-prev')) {
        changeMonth(-1);
      } else if (target.classList.contains('date-picker-next')) {
        changeMonth(1);
      } else if (target.classList.contains('date-picker-day')) {
        selectDate(parseDate(target.dataset.date));
      } else if (target.classList.contains('date-picker-today')) {
        selectDate(new Date());
      } else if (target.classList.contains('date-picker-clear')) {
        input.value = '';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        updateLabel();
        close();
      }
    });

    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      toggle();
    });

    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.parentElement.appendChild(popover);
    updateLabel();

    const instance = { input, trigger, popover, open, close, render, updateLabel };
    return instance;
  }

  document.addEventListener('click', (event) => {
    if (!openInstance) return;
    const target = event.target;
    if (openInstance.popover.contains(target) || openInstance.trigger.contains(target)) return;
    openInstance.close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openInstance) {
      openInstance.close();
    }
  });

  function attach(inputOrSelector, options = {}) {
    const input = typeof inputOrSelector === 'string'
      ? document.querySelector(inputOrSelector)
      : inputOrSelector;

    if (!input) return null;
    if (instances.has(input)) {
      const existing = instances.get(input);
      existing.updateLabel();
      return existing;
    }

    const instance = buildInstance(input, options);
    instances.set(input, instance);
    return instance;
  }

  window.CoinFlowDatePicker = {
    attach,
    toDateString,
    parseDate
  };
})();
