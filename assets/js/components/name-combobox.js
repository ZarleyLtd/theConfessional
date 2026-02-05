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
      btn.className = 'claims-name__option';
      btn.textContent = name;
      btn.addEventListener('click', function () { setValue(name); });
      dropdownEl.appendChild(btn);
    });
  }

  var NameCombobox = {
    mount: function (container, options) {
      options = options || {};
      onSelectCallback = options.onSelect || function () {};
      var html = '<div class="claims-name">';
      html += '<label class="claims-name__label" for="claims-name-input">Who are you?</label>';
      html += '<input type="text" id="claims-name-input" class="claims-name__input" placeholder="Select or type your name" autocomplete="off">';
      html += '<div id="claims-name-dropdown" class="claims-name__dropdown hidden"></div>';
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
