/**
 * Product row: one row per line item; horizontal scroll of N buttons (N = quantity);
 * states: available, claimed-by-me, claimed-by-other, shared-by-me, shared-by-other.
 * Optional portion-claim mode opens the share dialog.
 */
(function (global) {
  var config = global.CONFIRMATIONAL_CONFIG || {};
  var base = (config.BASE_PATH || '').replace(/\/?$/, '');
  var IMAGE_BASE = base + (base ? '/' : '') + 'assets/images/';
  var IMAGES = {
    DrinkStout: 'GuinnessPint.png',
    DrinkWine: 'WineRed.png',
    DrinkLager: 'LagerPint.png'
  };
  var FALLBACK_ICONS = {
    Food: '🍽️',
    DrinkSpirit: '🥃',
    default: '•'
  };

  function getImageFromConfig(productIcons, description) {
    if (!productIcons || !productIcons.length || !description) return null;
    var d = description.toLowerCase();
    var best = null;
    var bestLen = 0;
    for (var i = 0; i < productIcons.length; i++) {
      var p = (productIcons[i].product || '').toLowerCase();
      if (p && d.indexOf(p) >= 0 && p.length > bestLen) {
        best = productIcons[i].image;
        bestLen = p.length;
      }
    }
    return best ? IMAGE_BASE + best : null;
  }

  function getImageSrc(category, description, productIcons) {
    var configImg = getImageFromConfig(productIcons, description);
    if (configImg) return configImg;
    if (category === 'Food') return null;
    if (category === 'Drink') {
      var d = (description || '').toLowerCase();
      if (d.indexOf('guinness') >= 0) return IMAGE_BASE + IMAGES.DrinkStout;
      if (d.indexOf('wine') >= 0) return IMAGE_BASE + IMAGES.DrinkWine;
      if (d.indexOf('spirit') >= 0 || d.indexOf('vodka') >= 0 || d.indexOf('whiskey') >= 0 ||
          d.indexOf('whisky') >= 0 || d.indexOf('rum') >= 0 || d.indexOf('gin') >= 0 ||
          d.indexOf('tequila') >= 0 || d.indexOf('bourbon') >= 0) return null;
      return IMAGE_BASE + IMAGES.DrinkLager;
    }
    return null;
  }

  function getFallbackIcon(category, description) {
    if (category === 'Food') return FALLBACK_ICONS.Food;
    if (category === 'Drink') {
      var d = (description || '').toLowerCase();
      if (d.indexOf('spirit') >= 0 || d.indexOf('vodka') >= 0 || d.indexOf('whiskey') >= 0 ||
          d.indexOf('whisky') >= 0 || d.indexOf('rum') >= 0 || d.indexOf('gin') >= 0 ||
          d.indexOf('tequila') >= 0 || d.indexOf('bourbon') >= 0) return FALLBACK_ICONS.DrinkSpirit;
      return FALLBACK_ICONS.default;
    }
    return FALLBACK_ICONS.default;
  }

  function badgeHtml(st, claimMap, currentUser, rowIndex, unitIndex) {
    if (st === 'shared-by-me' || st === 'shared-by-other') {
      var info = ClaimsState.getSlotInfo(claimMap, rowIndex, unitIndex);
      var filled;
      if (st === 'shared-by-me') {
        filled = ClaimsState.getMyPortions(claimMap, currentUser, rowIndex, unitIndex);
      } else {
        filled = Object.keys(info.byIndex || {}).map(function (k) { return parseInt(k, 10); });
      }
      if (global.ShareClaimDialog && typeof global.ShareClaimDialog.buildMiniPieBadge === 'function') {
        return global.ShareClaimDialog.buildMiniPieBadge(info.portionCount, filled);
      }
      return '<span class="claims-slot-btn__pie claims-slot-btn__pie--fallback" aria-hidden="true"></span>';
    }
    return '';
  }

  function ariaForState(st, otherNames, description) {
    if (st === 'claimed-by-me') return (description || 'Item') + ' (click to unclaim)';
    if (st === 'shared-by-me') return 'Shared claim — tap to edit portions';
    if (st === 'claimed-by-other') return 'Claimed by ' + (otherNames[0] || 'someone else');
    if (st === 'shared-by-other') {
      return otherNames.length
        ? ('Partially shared with ' + otherNames.join(', ') + ' — tap to claim a portion')
        : 'Partially shared — tap to claim a portion';
    }
    return description || 'Available to claim';
  }

  function portionToggleSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle>' +
      '<path fill="currentColor" d="M12 12V3A9 9 0 0 1 19.794 7.5L12 12Z"></path>' +
      '</svg>';
  }

  function canShare(st) {
    return st === 'available' || st === 'claimed-by-me' || st === 'shared-by-me' || st === 'shared-by-other';
  }

  function setPortionModeUi(row, toggle, on) {
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    toggle.classList.toggle('claims-product-row__portion-toggle--on', on);
    row.classList.toggle('claims-product-row--portion-claim', on);
    toggle.title = on ? 'Portion claim mode on' : 'Portion claim mode';
  }

  function render(options) {
    options = options || {};
    var slots = options.slots;
    var rowIndex = options.rowIndex;
    var category = options.category || '';
    var description = options.description || '';
    var quantity = options.quantity || 0;
    var currentUser = options.currentUser || '';
    var claimMap = options.claimMap || {};
    var displayOrder = options.displayOrder;
    var productIcons = options.productIcons || [];
    var onSlotClick = options.onSlotClick || function () {};
    var readOnly = options.readOnly === true;
    var portionMode = !!options.portionClaimMode;

    var wrap = document.createElement('div');
    wrap.className = 'claims-product-row';

    var header = document.createElement('div');
    header.className = 'claims-product-row__header';

    if (!readOnly) {
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'claims-product-row__portion-toggle';
      toggle.setAttribute('aria-label', 'Portion claim mode');
      toggle.innerHTML = portionToggleSvg();
      setPortionModeUi(wrap, toggle, portionMode);
      toggle.addEventListener('click', function () {
        portionMode = !portionMode;
        setPortionModeUi(wrap, toggle, portionMode);
        if (options.onPortionClaimModeChange) options.onPortionClaimModeChange(portionMode);
      });
      toggle.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      header.appendChild(toggle);
    } else if (portionMode) {
      wrap.classList.add('claims-product-row--portion-claim');
    }

    var label = document.createElement('div');
    label.className = 'claims-product-row__label';
    label.textContent = description + (slots && slots.length ? ' × ' + slots.length : '');
    header.appendChild(label);
    wrap.appendChild(header);

    var strip = document.createElement('div');
    strip.className = 'claims-product-strip';

    var orderedSlots;
    if (slots && slots.length > 0) {
      orderedSlots = slots.map(function (s) {
        return {
          rowIndex: s.rowIndex,
          unitIndex: s.unitIndex,
          state: ClaimsState.getSlotState(claimMap, currentUser, s.rowIndex, s.unitIndex)
        };
      });
    } else {
      var unitIndices = displayOrder && displayOrder.length === quantity
        ? displayOrder
        : (function () { var a = []; for (var i = 0; i < quantity; i++) a.push(i); return a; })();
      orderedSlots = unitIndices.map(function (u) {
        return {
          rowIndex: rowIndex,
          unitIndex: u,
          state: ClaimsState.getSlotState(claimMap, currentUser, rowIndex, u)
        };
      });
    }

    for (var i = 0; i < orderedSlots.length; i++) {
      var s = orderedSlots[i];
      var r = s.rowIndex;
      var u = s.unitIndex;
      var slotState = s.state;
      var otherNames = ClaimsState.getOtherClaimants(claimMap, currentUser, r, u);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'claims-slot-btn ' + slotState;
      btn.setAttribute('data-row', r);
      btn.setAttribute('data-unit', u);
      btn.setAttribute('aria-label', ariaForState(slotState, otherNames, description));
      btn.title = ariaForState(slotState, otherNames, description);
      if (slotState === 'claimed-by-other' || slotState === 'shared-by-other') {
        btn.setAttribute('data-claimant', otherNames.join(', ') || 'someone else');
      }

      var imgSrc = getImageSrc(category, description, productIcons);
      if (imgSrc) {
        var img = document.createElement('img');
        img.src = imgSrc;
        img.alt = description;
        img.className = 'claims-slot-btn__img';
        img.draggable = false;
        btn.appendChild(img);
      } else {
        var iconSpan = document.createElement('span');
        iconSpan.textContent = getFallbackIcon(category, description);
        btn.appendChild(iconSpan);
      }

      var badge = badgeHtml(slotState, claimMap, currentUser, r, u);
      if (badge) {
        btn.insertAdjacentHTML('beforeend', badge);
      }

      if (readOnly) {
        btn.classList.add('claims-slot-btn--readonly');
      } else {
        (function (rowIdx, unitIdx, st, buttonEl) {
          buttonEl.addEventListener('click', function () {
            if (st === 'claimed-by-other') {
              var claimant = buttonEl.getAttribute('data-claimant') || 'someone else';
              if (options.onClaimedByOtherClick) {
                options.onClaimedByOtherClick(rowIdx, unitIdx, claimant, buttonEl);
              }
              return;
            }
            if (portionMode && canShare(st) && options.onSlotShare) {
              options.onSlotShare(rowIdx, unitIdx, buttonEl);
              return;
            }
            if ((st === 'shared-by-me' || st === 'shared-by-other') && options.onSlotShare) {
              options.onSlotShare(rowIdx, unitIdx, buttonEl);
              return;
            }
            if (options.onSlotClick) onSlotClick(rowIdx, unitIdx);
          });
          buttonEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        })(r, u, slotState, btn);
      }
      strip.appendChild(btn);
    }
    wrap.appendChild(strip);
    return wrap;
  }

  var ProductRow = {
    render: render,
    getImageSrc: getImageSrc,
    getImageFromConfig: getImageFromConfig,
    getFallbackIcon: getFallbackIcon
  };
  global.ProductRow = ProductRow;
})(typeof window !== 'undefined' ? window : this);
