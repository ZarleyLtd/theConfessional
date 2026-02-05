/**
 * Product row: one row per line item; horizontal scroll of N buttons (N = quantity);
 * states: available, claimed-by-me, claimed-by-other. Category-based icon placeholder.
 */
(function (global) {
  var ICONS = {
    Food: '🍽️',
    Drink: '🍺',
    default: '•'
  };

  function getIcon(category) {
    return ICONS[category] || ICONS.default;
  }

  function render(options) {
    options = options || {};
    var rowIndex = options.rowIndex;
    var category = options.category || '';
    var description = options.description || '';
    var quantity = options.quantity || 0;
    var currentUser = options.currentUser || '';
    var claimMap = options.claimMap || {};
    var mySelection = options.mySelection || [];
    var displayOrder = options.displayOrder;
    var onSlotClick = options.onSlotClick || function () {};

    var wrap = document.createElement('div');
    wrap.className = 'claims-product-row';
    var label = document.createElement('div');
    label.className = 'claims-product-row__label';
    label.textContent = description + (category ? ' (' + category + ')' : '');
    wrap.appendChild(label);
    var strip = document.createElement('div');
    strip.className = 'claims-product-strip';
    var unitIndices = displayOrder && displayOrder.length === quantity
      ? displayOrder
      : (function () { var a = []; for (var i = 0; i < quantity; i++) a.push(i); return a; })();
    for (var i = 0; i < unitIndices.length; i++) {
      var u = unitIndices[i];
      var slotState = ClaimsState.getSlotState(claimMap, currentUser, rowIndex, u);
      var claimantName = claimMap[ClaimsState.slotKey(rowIndex, u)];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'claims-slot-btn ' +
        (slotState === 'available' ? 'available' :
          slotState === 'claimed-by-me' ? 'claimed-by-me' : 'claimed-by-other');
      btn.setAttribute('data-row', rowIndex);
      btn.setAttribute('data-unit', u);
      btn.textContent = getIcon(category);
      if (slotState === 'claimed-by-me') {
        btn.title = description + ' (click to unclaim)';
      } else if (slotState === 'claimed-by-other') {
        btn.title = 'Claimed by ' + (claimantName || 'someone else');
      } else {
        btn.title = description;
      }
      btn.addEventListener('click', function () {
        var r = parseInt(this.getAttribute('data-row'), 10);
        var uu = parseInt(this.getAttribute('data-unit'), 10);
        onSlotClick(r, uu);
      });
      strip.appendChild(btn);
    }
    wrap.appendChild(strip);
    return wrap;
  }

  var ProductRow = {
    render: render,
    getIcon: getIcon
  };
  global.ProductRow = ProductRow;
})(typeof window !== 'undefined' ? window : this);
