/**
 * Name combobox: dropdown from config names + free-text entry.
 */
(function (global) {
  var listEl;
  var inputEl;
  var dropdownEl;
  var onSelectCallback = function () {};

  function showDropdown(show) {
    if (dropdownEl) dropdownEl.classList.toggle('hidden', !show);
  }

  function setValue(value) {
    if (inputEl) inputEl.value = value || '';
    showDropdown(false);
    onSelectCallback(value || '');
  }

  function renderDropdown(names) {
    if (!dropdownEl) return;
    dropdownEl.innerHTML = '';
    (names || []).forEach(function (name) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'block w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-600 rounded';
      btn.textContent = name;
      btn.addEventListener('click', function () { setValue(name); });
      dropdownEl.appendChild(btn);
    });
  }

  var NameCombobox = {
    mount: function (container, options) {
      options = options || {};
      onSelectCallback = options.onSelect || function () {};
      var html = '<div class="relative">';
      html += '<label class="block text-sm font-medium text-slate-300 mb-1">Who are you?</label>';
      html += '<input type="text" id="claims-name-input" placeholder="Select or type your name" class="w-full border border-slate-600 bg-slate-700 text-slate-100 rounded-lg px-3 py-2 placeholder-slate-400" autocomplete="off">';
      html += '<div id="claims-name-dropdown" class="hidden absolute z-10 mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-auto"></div>';
      html += '</div>';
      container.innerHTML = html;
      inputEl = document.getElementById('claims-name-input');
      dropdownEl = document.getElementById('claims-name-dropdown');
      if (inputEl) {
        inputEl.addEventListener('focus', function () {
          if (dropdownEl && dropdownEl.children.length) showDropdown(true);
        });
        inputEl.addEventListener('input', function () {
          onSelectCallback(inputEl.value.trim());
        });
        inputEl.addEventListener('blur', function () {
          setTimeout(function () { showDropdown(false); }, 150);
        });
      }
      ClaimsAPI.getConfigNames().then(function (names) {
        renderDropdown(names);
      }).catch(function () {
        renderDropdown([]);
      });
      listEl = container;
    }
  };
  global.NameCombobox = NameCombobox;
})(typeof window !== 'undefined' ? window : this);
