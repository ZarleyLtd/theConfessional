/**
 * Product row: one row per line item; horizontal scroll of N buttons (N = quantity);
 * states: available, claimed-by-me, claimed-by-other. Uses images from assets/images.
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
    var productIcons = options.productIcons || [];
    var onSlotClick = options.onSlotClick || function () {};
    var readOnly = options.readOnly === true;

    var wrap = document.createElement('div');
    wrap.className = 'claims-product-row';
    var label = document.createElement('div');
    label.className = 'claims-product-row__label';
    label.textContent = description;
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
      var imgSrc = getImageSrc(category, description, productIcons);
      if (imgSrc) {
        var img = document.createElement('img');
        img.src = imgSrc;
        img.alt = description;
        img.className = 'claims-slot-btn__img';
        btn.appendChild(img);
      } else {
        btn.textContent = getFallbackIcon(category, description);
      }
      if (slotState === 'claimed-by-me') {
        btn.title = description + ' (click to unclaim)';
      } else if (slotState === 'claimed-by-other') {
        btn.title = 'Claimed by ' + (claimantName || 'someone else');
      } else {
        btn.title = description;
      }
      if (!readOnly && (slotState === 'available' || slotState === 'claimed-by-me')) {
        btn.addEventListener('click', function () {
          var r = parseInt(this.getAttribute('data-row'), 10);
          var uu = parseInt(this.getAttribute('data-unit'), 10);
          onSlotClick(r, uu);
        });
      } else if (readOnly) {
        btn.classList.add('claims-slot-btn--readonly');
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
