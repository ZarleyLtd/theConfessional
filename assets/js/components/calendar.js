/**
 * Calendar component: Mon–Sun grid; only enabled dates clickable; emits date selected.
 * Structure and styling aligned with R&R-style calendar (month header, weekdays, days grid).
 */
(function (global) {
  var enabledSet = {};
  var selectedDate = null;
  var onSelect = function () {};

  function monthYear(d) {
    var y = d.getFullYear();
    var m = d.getMonth();
    return { year: y, month: m };
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function firstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay();
  }

  function toDateStr(year, month, day) {
    var m = ('0' + (month + 1)).slice(-2);
    var d = ('0' + day).slice(-2);
    return year + '-' + m + '-' + d;
  }

  var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function render(container, options) {
    options = options || {};
    var enabledDates = options.enabledDates || [];
    onSelect = options.onSelect || function () {};
    selectedDate = options.selectedDate || null;
    enabledSet = {};
    enabledDates.forEach(function (d) { enabledSet[d] = true; });

    var year, month;
    if (enabledDates.length > 0) {
      var now = new Date();
      var currentYear = now.getFullYear();
      var currentMonth = now.getMonth();
      var currentMonthHasData = enabledDates.some(function (d) {
        var parts = d.split('-');
        return parts.length === 3 && parseInt(parts[0], 10) === currentYear && parseInt(parts[1], 10) === currentMonth + 1;
      });
      if (currentMonthHasData) {
        year = currentYear;
        month = currentMonth;
      } else {
        var first = enabledDates[0];
        var parts = first.split('-');
        year = parseInt(parts[0], 10);
        month = (parseInt(parts[1], 10) || 1) - 1;
      }
    } else {
      var now = new Date();
      year = now.getFullYear();
      month = now.getMonth();
    }
    var firstDow = firstDayOfMonth(year, month);
    var total = daysInMonth(year, month);
    var weekStartsMonday = true;
    var dowOffset = weekStartsMonday ? (firstDow === 0 ? 6 : firstDow - 1) : firstDow;

    var html = '<div class="claims-calendar calendar-month">';
    html += '<div class="calendar-month-header">' + monthNames[month] + ' ' + year + '</div>';
    html += '<div class="calendar-weekdays">';
    var dayNames = weekStartsMonday ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(function (d) { html += '<div class="calendar-weekday">' + d + '</div>'; });
    html += '</div>';
    html += '<div class="calendar-days-grid">';
    for (var i = 0; i < dowOffset; i++) {
      html += '<div class="calendar-day empty"></div>';
    }
    for (var day = 1; day <= total; day++) {
      var dateStr = toDateStr(year, month, day);
      var isEnabled = enabledSet[dateStr];
      var isSelected = dateStr === selectedDate;
      var cls = 'calendar-day';
      if (isEnabled) {
        cls += ' available';
        if (isSelected) cls += ' selected';
      } else {
        cls += ' booked';
      }
      html += '<button type="button" class="' + cls + '" data-date="' + dateStr + '" ' + (isEnabled ? '' : 'disabled') + '>' + day + '</button>';
    }
    html += '</div></div>';
    container.innerHTML = html;
    container.querySelectorAll('button.calendar-day[data-date]').forEach(function (btn) {
      if (btn.disabled) return;
      btn.addEventListener('click', function () {
        var d = btn.getAttribute('data-date');
        selectedDate = d;
        onSelect(d);
        render(container, { enabledDates: enabledDates, onSelect: onSelect, selectedDate: selectedDate });
      });
    });
  }

  var CalendarComponent = {
    mount: function (container, options) {
      if (!container) return;
      options = options || {};
      options.enabledDates = options.enabledDates || [];
      options.selectedDate = options.selectedDate || null;
      render(container, options);
    }
  };
  global.CalendarComponent = CalendarComponent;
})(typeof window !== 'undefined' ? window : this);
