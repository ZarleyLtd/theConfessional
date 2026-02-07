/**
 * Name combobox: RNR-style datalist for type-or-select from config names.
 */
(function (global) {
  var inputEl;
  var datalistEl;
  var onSelectCallback = function () {};

  function populateDatalist(names) {
    if (!datalistEl) return;
    datalistEl.innerHTML = '';
    (names || []).forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      datalistEl.appendChild(opt);
    });
  }

  var NameCombobox = {
    mount: function (container, options) {
      options = options || {};
      onSelectCallback = options.onSelect || function () {};
      var initialValue = options.initialValue || '';
      var onConfigLoaded = options.onConfigLoaded || function () {};
      var html = '<div class="claims-name">';
      html += '<label class="claims-name__label" for="claims-name-input">Your name</label>';
      html += '<input type="text" id="claims-name-input" class="claims-name__input" list="claims-name-list" placeholder="Type or select your name" autocomplete="off">';
      html += '<datalist id="claims-name-list"></datalist>';
      html += '</div>';
      container.innerHTML = html;
      inputEl = document.getElementById('claims-name-input');
      if (inputEl && initialValue) inputEl.value = initialValue;
      datalistEl = document.getElementById('claims-name-list');
      if (inputEl) {
        if (initialValue) onSelectCallback(initialValue.trim());
        inputEl.addEventListener('input', function () {
          onSelectCallback(inputEl.value.trim());
        });
        inputEl.addEventListener('change', function () {
          onSelectCallback(inputEl.value.trim());
        });
      }
      ClaimsAPI.getConfigNames().then(function (names) {
        populateDatalist(names);
        onConfigLoaded(names);
      }).catch(function () {
        populateDatalist([]);
        onConfigLoaded([]);
      });
    }
  };
  global.NameCombobox = NameCombobox;
})(typeof window !== 'undefined' ? window : this);
