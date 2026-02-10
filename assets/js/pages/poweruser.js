/**
 * Power User page: Bill Review and Bill Upload.
 * Same look and feel as claims page, with god-mode header.
 * Access via direct URL only (no links from index.html).
 */
(function (global) {
  var rootEl;
  var reviewState = { billsData: null, viewModeByDate: {}, expandedDate: null, billCache: {}, billFetchPromises: {} };

  function getViewModeForBill(dateStr) {
    return reviewState.viewModeByDate[dateStr] || 'byItem';
  }

  function setViewModeForBill(dateStr, mode) {
    reviewState.viewModeByDate[dateStr] = mode;
  }

  function ensureBillFull(dateStr) {
    if (reviewState.billCache[dateStr]) return Promise.resolve(reviewState.billCache[dateStr]);
    if (reviewState.billFetchPromises[dateStr]) return reviewState.billFetchPromises[dateStr];
    var p = ClaimsAPI.getBillFull(dateStr).then(function (b) {
      reviewState.billCache[dateStr] = b;
      delete reviewState.billFetchPromises[dateStr];
      return b;
    });
    reviewState.billFetchPromises[dateStr] = p;
    return p;
  }

  function prefetchOpenBills() {
    var bills = (reviewState.billsData && reviewState.billsData.bills) ? reviewState.billsData.bills : [];
    for (var i = 0; i < bills.length; i++) {
      if (bills[i].open === true) {
        ensureBillFull(bills[i].date).then(function (bill) {
          var list = document.getElementById('poweruser-bills-list');
          if (list && reviewState.billsData && reviewState.expandedDate === bill.date) {
            renderBillsList(list, reviewState.billsData.bills);
          }
        });
      }
    }
  }

  function renderShell() {
    if (!rootEl) return;
    var html = '<div class="claims-hero-bg" aria-hidden="true"></div>';
    html += '<div class="claims-products-wrap">';
    html += '<div class="claims-hero claims-hero--header-only claims-hero--godmode">';
    html += '<div class="claims-hero__overlay"></div>';
    html += '<h1 class="claims-hero__title">The Confessional <span class="claims-hero__god-icon" aria-hidden="true">⚡</span> God Mode</h1>';
    html += '</div>';
    html += '<div class="poweruser-content">';
    html += '<nav class="poweruser-tabs">';
    html += '<button type="button" class="poweruser-tab poweruser-tab--active" data-tab="review">Bill Review</button>';
    html += '<button type="button" class="poweruser-tab" data-tab="upload">Upload New Bill</button>';
    html += '</nav>';
    html += '<section id="poweruser-review" class="poweruser-section poweruser-section--active"></section>';
    html += '<section id="poweruser-upload" class="poweruser-section"></section>';
    html += '</div></div>';
    rootEl.innerHTML = html;

    var tabs = rootEl.querySelectorAll('.poweruser-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        var tab = this.getAttribute('data-tab');
        var allTabs = rootEl.querySelectorAll('.poweruser-tab');
        for (var t = 0; t < allTabs.length; t++) allTabs[t].classList.remove('poweruser-tab--active');
        var allSections = rootEl.querySelectorAll('.poweruser-section');
        for (var s = 0; s < allSections.length; s++) allSections[s].classList.remove('poweruser-section--active');
        this.classList.add('poweruser-tab--active');
        var section = document.getElementById('poweruser-' + tab);
        if (section) section.classList.add('poweruser-section--active');
        if (tab === 'review') renderBillReview();
        if (tab === 'upload') renderBillUpload();
      });
    }

    renderBillReview();
    renderBillUpload();
  }

  /** Group bill items by description+category (bill order), one line per product with slots. */
  function buildConsolidatedItems(bill) {
    var items = (bill && bill.items) ? bill.items : [];
    var seen = {};
    var consolidated = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var desc = (item.description || '').trim();
      var cat = (item.category || '').trim();
      var key = cat + '|' + desc;
      var qty = Math.max(0, parseInt(item.quantity, 10) || 0);
      var unitPrice = parseFloat(item.unit_price) || 0;
      var totalPrice = parseFloat(item.total_price) || 0;
      var ri = item.rowIndex != null ? item.rowIndex : i;
      if (!seen[key]) {
        seen[key] = { description: desc, category: cat, unitPrice: unitPrice, totalPrice: totalPrice, slots: [] };
        consolidated.push(seen[key]);
      }
      for (var u = 0; u < qty; u++) {
        seen[key].slots.push({ rowIndex: ri, unitIndex: u });
      }
    }
    return consolidated;
  }

  /** Get claimant summary as array of lines: ["John (1)", "Gary (2)", "Unclaimed (1)"] */
  function getClaimantLines(slots, claimMap) {
    var byUser = {};
    var unclaimed = 0;
    for (var i = 0; i < slots.length; i++) {
      var k = slots[i].rowIndex + '_' + slots[i].unitIndex;
      var name = claimMap[k];
      if (!name || String(name).trim() === '') {
        unclaimed++;
      } else {
        byUser[name] = (byUser[name] || 0) + 1;
      }
    }
    var lines = [];
    var names = Object.keys(byUser).sort();
    for (var j = 0; j < names.length; j++) {
      lines.push(names[j] + ' (' + byUser[names[j]] + ')');
    }
    if (unclaimed > 0) lines.push('Unclaimed (' + unclaimed + ')');
    return lines;
  }

  /** Check if any slot is unclaimed */
  function hasUnclaimed(slots, claimMap) {
    for (var i = 0; i < slots.length; i++) {
      var k = slots[i].rowIndex + '_' + slots[i].unitIndex;
      if (!claimMap[k] || String(claimMap[k]).trim() === '') return true;
    }
    return false;
  }

  /** Category for clipboard: food, fries, drinks */
  function getExportCategory(cat) {
    var c = (cat || '').toLowerCase();
    if (c.indexOf('food') >= 0) return 'food';
    if (c.indexOf('fries') >= 0) return 'fries';
    return 'drinks';
  }

  var CLIPBOARD_NAME_ORDER = ['John', 'Greg', 'Boc', 'Brian', 'Duggie', 'Barry', 'Berndt', 'Brendan', 'Stephan', 'Cormac', 'Tony', 'Gary', 'Ray'];

  function formatUserRow(userName, data) {
    var empty = { food: [], fries: [], drinks: [] };
    data = data || empty;
    var foodNames = data.food.map(function (x) { return x.desc; }).join(', ');
    var foodPrices = data.food.length ? '=' + data.food.map(function (x) { return String(x.unitPrice); }).join('+') : '';
    var friesNames = data.fries.map(function (x) { return x.desc; }).join(', ');
    var friesPrices = data.fries.length ? '=' + data.fries.map(function (x) { return String(x.unitPrice); }).join('+') : '';
    var drinksParts = [];
    var drinksPricesParts = [];
    var seenDrink = {};
    for (var d = 0; d < data.drinks.length; d++) {
      var dx = data.drinks[d];
      var key = dx.desc;
      if (!seenDrink[key]) {
        seenDrink[key] = { count: 0, price: dx.unitPrice };
      }
      seenDrink[key].count++;
    }
    var drinkKeys = Object.keys(seenDrink);
    for (var dk = 0; dk < drinkKeys.length; dk++) {
      var desc = drinkKeys[dk];
      var obj = seenDrink[desc];
      drinksParts.push(obj.count + ' ' + desc.toLowerCase());
      drinksPricesParts.push(obj.price + '*' + obj.count);
    }
    var drinksNames = drinksParts.join(', ');
    var drinksPrices = drinksPricesParts.length ? '=' + drinksPricesParts.join('+') : '';
    return [userName, foodNames, foodPrices, friesNames, friesPrices, drinksNames, drinksPrices].join('\t');
  }

  /** Build clipboard text for one bill: one row per user, ordered list first (blanks if no claims), then others */
  function buildClipboardText(bill) {
    if (!bill || !bill.items || !bill.claims) return '';
    var claimMap = typeof ClaimsState !== 'undefined' && ClaimsState.buildClaimMap
      ? ClaimsState.buildClaimMap(bill.claims) : {};
    var consolidated = buildConsolidatedItems(bill);
    var byUser = {};
    for (var i = 0; i < consolidated.length; i++) {
      var g = consolidated[i];
      var exportCat = getExportCategory(g.category);
      for (var j = 0; j < g.slots.length; j++) {
        var s = g.slots[j];
        var k = s.rowIndex + '_' + s.unitIndex;
        var name = (claimMap[k] || '').trim();
        if (!name) continue;
        if (!byUser[name]) byUser[name] = { food: [], fries: [], drinks: [] };
        var arr = byUser[name][exportCat];
        arr.push({ desc: g.description, unitPrice: g.unitPrice });
      }
    }
    var orderedSet = {};
    for (var o = 0; o < CLIPBOARD_NAME_ORDER.length; o++) {
      orderedSet[CLIPBOARD_NAME_ORDER[o]] = true;
    }
    var lines = [];
    for (var u = 0; u < CLIPBOARD_NAME_ORDER.length; u++) {
      var userName = CLIPBOARD_NAME_ORDER[u];
      lines.push(formatUserRow(userName, byUser[userName]));
    }
    var otherUsers = Object.keys(byUser).filter(function (n) { return !orderedSet[n]; }).sort();
    for (var x = 0; x < otherUsers.length; x++) {
      lines.push(formatUserRow(otherUsers[x], byUser[otherUsers[x]]));
    }
    return lines.join('\n');
  }

  /** Build by-user view: each user with their claimed products (consolidated per product) */
  function buildByUserView(bill) {
    if (!bill || !bill.items || !bill.claims) return [];
    var claimMap = typeof ClaimsState !== 'undefined' && ClaimsState.buildClaimMap
      ? ClaimsState.buildClaimMap(bill.claims) : {};
    var consolidated = buildConsolidatedItems(bill);
    var byUser = {};
    for (var i = 0; i < consolidated.length; i++) {
      var g = consolidated[i];
      for (var j = 0; j < g.slots.length; j++) {
        var s = g.slots[j];
        var k = s.rowIndex + '_' + s.unitIndex;
        var name = (claimMap[k] || '').trim();
        if (!name) continue;
        if (!byUser[name]) byUser[name] = {};
        var key = g.description + '|' + g.unitPrice;
        if (!byUser[name][key]) {
          byUser[name][key] = { description: g.description, quantity: 0, unitPrice: g.unitPrice };
        }
        byUser[name][key].quantity++;
      }
    }
    var result = {};
    var users = Object.keys(byUser);
    for (var u = 0; u < users.length; u++) {
      var userName = users[u];
      var prods = byUser[userName];
      result[userName] = [];
      var keys = Object.keys(prods);
      for (var pk = 0; pk < keys.length; pk++) {
        var p = prods[keys[pk]];
        result[userName].push({
          description: p.description + (p.quantity > 1 ? ' x' + p.quantity : ''),
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          totalPrice: p.unitPrice * p.quantity
        });
      }
    }
    return result;
  }

  function renderBillReview() {
    var section = document.getElementById('poweruser-review');
    if (!section) return;
    if (!section.classList.contains('poweruser-section--active')) return;
    section.innerHTML = '<p class="poweruser-loading">Loading bills…</p>';
    if (typeof ClaimsAPI !== 'undefined' && ClaimsAPI.getBillsSummary) {
      ClaimsAPI.getBillsSummary()
        .then(function (data) {
          reviewState.billsData = data;
          renderBillReviewContent(section, data);
          prefetchOpenBills();
        })
        .catch(function (err) {
          section.innerHTML = '<p class="poweruser-error">Failed to load bills: ' + (err.message || err) + '</p>';
        });
    } else {
      section.innerHTML = '<p class="poweruser-error">API not available. Deploy backend with getBillsSummary action.</p>';
    }
  }

  function renderBillReviewContent(section, data) {
    var bills = (data && data.bills) ? data.bills : [];
    if (bills.length === 0) {
      section.innerHTML = '<p class="poweruser-placeholder">No bills found.</p>';
      return;
    }

    section.innerHTML = '<div class="poweruser-bills-list" id="poweruser-bills-list"></div>';
    var list = document.getElementById('poweruser-bills-list');
    if (list) renderBillsList(list, bills);
  }

  function renderBillsList(listEl, bills) {
    listEl.innerHTML = '';
    var sortedBills = bills.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });

    for (var i = 0; i < sortedBills.length; i++) {
      var bill = sortedBills[i];
      var dateStr = bill.date || '';
      var dateLabel = typeof ClaimsFormatters !== 'undefined' && ClaimsFormatters.formatBillDateDisplay
        ? ClaimsFormatters.formatBillDateDisplay(dateStr) : dateStr;
      var isOpen = bill.open === true;
      var isExpanded = reviewState.expandedDate === dateStr;

      var block = document.createElement('div');
      block.className = 'poweruser-bill-block' + (isExpanded ? ' poweruser-bill-block--expanded' : '');
      block.setAttribute('data-date', dateStr);

      var headerWrap = document.createElement('div');
      headerWrap.className = 'poweruser-bill-header-wrap';
      var header = document.createElement('button');
      header.type = 'button';
      header.className = 'poweruser-bill-header';
      header.innerHTML = '<span class="poweruser-bill-header__icon">' + (isExpanded ? '▼' : '▶') + '</span>';
      header.innerHTML += '<span class="poweruser-bill-header__date">' + escapeHtml(dateLabel) + '</span>';
      header.innerHTML += '<span class="poweruser-bill-badge poweruser-bill-badge--' + (isOpen ? 'open' : 'closed') + '">' + (isOpen ? 'Open' : 'Closed') + '</span>';
      header.addEventListener('click', function () {
        var d = this.closest('.poweruser-bill-block').getAttribute('data-date');
        reviewState.expandedDate = reviewState.expandedDate === d ? null : d;
        var list = document.getElementById('poweruser-bills-list');
        if (list && reviewState.billsData) renderBillsList(list, reviewState.billsData.bills);
      });
      headerWrap.appendChild(header);

      var headerActions = document.createElement('div');
      headerActions.className = 'poweruser-bill-header-actions';
      if (isExpanded) {
        var viewMode = getViewModeForBill(dateStr);
        var toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'poweruser-bill-toggle-view';
        toggleBtn.textContent = 'View: ' + (viewMode === 'byItem' ? 'By Item' : 'By User');
        toggleBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var d = this.closest('.poweruser-bill-block').getAttribute('data-date');
          var next = getViewModeForBill(d) === 'byItem' ? 'byUser' : 'byItem';
          setViewModeForBill(d, next);
          this.textContent = 'View: ' + (next === 'byItem' ? 'By Item' : 'By User');
          var list = document.getElementById('poweruser-bills-list');
          if (list && reviewState.billsData) renderBillsList(list, reviewState.billsData.bills);
        });
        headerActions.appendChild(toggleBtn);
      }

      var hasNoClaims = bill.hasClaims === false;
      if (hasNoClaims) {
        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'poweruser-bill-delete';
        deleteBtn.title = 'Delete this bill';
        deleteBtn.innerHTML = 'Delete';
        deleteBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var d = this.closest('.poweruser-bill-block').getAttribute('data-date');
          if (!confirm('Delete this bill? This will remove all bill items, the BillMeta row, and the image file from Drive.')) return;
          var list = document.getElementById('poweruser-bills-list');
          if (typeof ClaimsAPI !== 'undefined' && ClaimsAPI.deleteBill) {
            ClaimsAPI.deleteBill({ date: d })
              .then(function () {
                if (list && reviewState.billsData) {
                  delete reviewState.billCache[d];
                  delete reviewState.billFetchPromises[d];
                  reviewState.billsData.bills = reviewState.billsData.bills.filter(function (b) { return b.date !== d; });
                  renderBillsList(list, reviewState.billsData.bills);
                }
              })
              .catch(function (err) {
                alert('Delete failed: ' + (err.message || err));
              });
          }
        });
        headerActions.appendChild(deleteBtn);
      }
      if (headerActions.childNodes.length > 0) {
        headerWrap.appendChild(headerActions);
      }
      block.appendChild(headerWrap);

      if (isExpanded) {
        var body = document.createElement('div');
        body.className = 'poweruser-bill-body';
        var fullBill = reviewState.billCache[dateStr];

        if (fullBill) {
          if (getViewModeForBill(dateStr) === 'byItem') {
            var claimMap = typeof ClaimsState !== 'undefined' && ClaimsState.buildClaimMap
              ? ClaimsState.buildClaimMap(fullBill.claims) : {};
            var consolidated = buildConsolidatedItems(fullBill);
            for (var j = 0; j < consolidated.length; j++) {
              var g = consolidated[j];
              var qty = g.slots.length;
              var lineTotal = (g.unitPrice * qty).toFixed(2);
              var claimantLines = getClaimantLines(g.slots, claimMap);
              var firstClaimant = claimantLines.length > 0 ? claimantLines[0] : null;
              var remainingClaimants = claimantLines.length > 1 ? claimantLines.slice(1) : [];
              var unclaimed = hasUnclaimed(g.slots, claimMap);
              var row = document.createElement('div');
              row.className = 'poweruser-item-row' + (unclaimed ? ' poweruser-item-row--unclaimed' : '');
              var lineWrap = document.createElement('div');
              lineWrap.className = 'poweruser-item-line-wrap';
              var itemUnit = document.createElement('span');
              itemUnit.className = 'poweruser-item-unit';
              itemUnit.textContent = g.description + ' x' + qty + ' @ ' + formatNum(g.unitPrice);
              var itemTotal = document.createElement('span');
              itemTotal.className = 'poweruser-item-total';
              itemTotal.textContent = '€' + lineTotal;
              var lineRight = document.createElement('span');
              lineRight.className = 'poweruser-item-claimant';
              lineRight.textContent = firstClaimant || '';
              var spacer = document.createElement('span');
              spacer.className = 'poweruser-item-spacer';
              lineWrap.appendChild(itemUnit);
              lineWrap.appendChild(itemTotal);
              lineWrap.appendChild(spacer);
              lineWrap.appendChild(lineRight);
              row.appendChild(lineWrap);
              if (remainingClaimants.length > 0) {
                var claimantsWrap = document.createElement('div');
                claimantsWrap.className = 'poweruser-item-claimants';
                for (var cl = 0; cl < remainingClaimants.length; cl++) {
                  var clSpan = document.createElement('div');
                  clSpan.className = 'poweruser-item-claimant-line';
                  clSpan.textContent = remainingClaimants[cl];
                  claimantsWrap.appendChild(clSpan);
                }
                row.appendChild(claimantsWrap);
              }
              body.appendChild(row);
            }
          } else {
            var byUser = buildByUserView(fullBill);
            var billTotal = (fullBill.items || []).reduce(function (s, it) {
              return s + (parseFloat(it.total_price) || 0);
            }, 0);
            var totalPaid = fullBill.totalPaid != null ? parseFloat(fullBill.totalPaid) : null;
            var tipAmount = (totalPaid != null && billTotal > 0 && totalPaid > billTotal)
              ? totalPaid - billTotal : 0;
            var users = Object.keys(byUser).sort();
            for (var u = 0; u < users.length; u++) {
              var userName = users[u];
              var items = byUser[userName];
              var userTotal = items.reduce(function (s, it) { return s + (it.totalPrice || 0); }, 0);
              var userShare = billTotal > 0 ? userTotal / billTotal : 0;
              var userTip = tipAmount * userShare;
              var userTotalWithTip = userTotal + userTip;
              var userBlock = document.createElement('div');
              userBlock.className = 'poweruser-user-block';
              var nameLine = document.createElement('div');
              nameLine.className = 'poweruser-user-name-line';
              var nameSpan = document.createElement('span');
              nameSpan.className = 'poweruser-user-name';
              nameSpan.textContent = userName;
              nameLine.appendChild(nameSpan);
              if (userTip > 0) {
                var tipSpan = document.createElement('span');
                tipSpan.className = 'poweruser-user-with-tip';
                tipSpan.textContent = 'With tip: €' + userTotalWithTip.toFixed(2);
                nameLine.appendChild(tipSpan);
              }
              var totalSpan = document.createElement('span');
              totalSpan.className = 'poweruser-user-total';
              totalSpan.textContent = '€' + userTotal.toFixed(2);
              nameLine.appendChild(totalSpan);
              userBlock.appendChild(nameLine);
              for (var k = 0; k < items.length; k++) {
                var it = items[k];
                var itemRow = document.createElement('div');
                itemRow.className = 'poweruser-user-item';
                var itemLeft = document.createElement('span');
                itemLeft.className = 'poweruser-user-item-desc';
                itemLeft.textContent = it.description + ' @ ' + formatNum(it.unitPrice);
                var itemRight = document.createElement('span');
                itemRight.className = 'poweruser-user-item-price';
                itemRight.textContent = '€' + it.totalPrice.toFixed(2);
                itemRow.appendChild(itemLeft);
                itemRow.appendChild(itemRight);
                userBlock.appendChild(itemRow);
              }
              body.appendChild(userBlock);
            }
          }

          var copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'poweruser-copy-btn';
          copyBtn.textContent = 'Clip for Bailey Bill';
          copyBtn.addEventListener('click', (function (billForCopy) {
            return function () {
            var txt = buildClipboardText(billForCopy);
            if (!txt) {
              alert('No claims to copy for this bill.');
              return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(txt).then(function () {
                copyBtn.textContent = 'Clipped!';
                setTimeout(function () { copyBtn.textContent = 'Clip for Bailey Bill'; }, 1500);
              }).catch(function () {
                fallbackCopy(txt, copyBtn);
              });
            } else {
              fallbackCopy(txt, copyBtn);
            }
            };
          })(fullBill));
          body.appendChild(copyBtn);
        } else {
          body.innerHTML = '<p class="poweruser-loading">Loading…</p>';
          (function (d) {
            ensureBillFull(d).then(function () {
              var list = document.getElementById('poweruser-bills-list');
              if (list && reviewState.billsData && reviewState.expandedDate === d) {
                renderBillsList(list, reviewState.billsData.bills);
              }
            });
          })(dateStr);
        }
        block.appendChild(body);
      }

      listEl.appendChild(block);
    }
  }

  function fallbackCopy(txt, btn) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      btn.textContent = 'Clipped!';
      setTimeout(function () { btn.textContent = 'Clip for Bailey Bill'; }, 1500);
    } catch (e) {
      alert('Copy failed. Please select and copy manually.');
    }
    document.body.removeChild(ta);
  }

  function showErrorModal(message) {
    var overlay = document.createElement('div');
    overlay.className = 'poweruser-modal-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Message');
    overlay.innerHTML = '<div class="poweruser-modal poweruser-modal--error">' +
      '<h3 class="poweruser-modal__title">Cannot upload bill</h3>' +
      '<p class="poweruser-modal__message">' + escapeHtml(message) + '</p>' +
      '<div class="poweruser-modal__actions">' +
      '<button type="button" class="poweruser-modal__ok" id="poweruser-error-ok">OK</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    document.getElementById('poweruser-error-ok').addEventListener('click', function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    var s = String(str);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatNum(n) {
    return typeof n === 'number' && !isNaN(n) ? n.toFixed(2) : '0.00';
  }

  function renderBillUpload() {
    var section = document.getElementById('poweruser-upload');
    if (!section) return;
    if (!section.classList.contains('poweruser-section--active')) {
      section.innerHTML = '<div class="poweruser-upload-area"><p class="poweruser-placeholder">Select "Upload New Bill" tab to use.</p></div>';
      return;
    }
    var html = '<div class="poweruser-upload-area">';
    html += '<p class="poweruser-upload-intro">Take a photo or select an image of the bill. We will analyze it and add it to the Bills sheet.</p>';
    html += '<div class="poweruser-upload-buttons">';
    html += '<input type="file" accept="image/*" capture="environment" id="poweruser-camera-input" class="poweruser-file-input" aria-hidden="true">';
    html += '<input type="file" accept="image/*" id="poweruser-gallery-input" class="poweruser-file-input" aria-hidden="true">';
    html += '<label class="poweruser-upload-btn poweruser-upload-btn--camera" for="poweruser-camera-input" title="Take photo with camera">';
    html += '<span class="poweruser-upload-btn__icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span>';
    html += '<span class="poweruser-upload-btn__text">Camera</span></label>';
    html += '<label class="poweruser-upload-btn poweruser-upload-btn--file" for="poweruser-gallery-input" title="Choose image from gallery or file">';
    html += '<span class="poweruser-upload-btn__icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></span>';
    html += '<span class="poweruser-upload-btn__text">Gallery / File</span></label>';
    html += '</div>';
    html += '<div id="poweruser-upload-status"></div>';
    html += '</div>';
    section.innerHTML = html;

    function handleImageChosen(input) {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        var match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        var mimeType = (match && match[1]) || 'image/jpeg';
        var base64 = (match && match[2]) || '';
        if (!base64) return;
        showBTModalAndUpload({ base64: base64, mimeType: mimeType });
      };
      reader.readAsDataURL(file);
      input.value = '';
    }

    var cameraInput = document.getElementById('poweruser-camera-input');
    var galleryInput = document.getElementById('poweruser-gallery-input');
    if (cameraInput) cameraInput.addEventListener('change', function () { handleImageChosen(this); });
    if (galleryInput) galleryInput.addEventListener('change', function () { handleImageChosen(this); });
  }

  function showBTModalAndUpload(imageData) {
    var overlay = document.createElement('div');
    overlay.className = 'poweruser-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Enter total paid');
    overlay.innerHTML = '<div class="poweruser-modal">' +
      '<h3 class="poweruser-modal__title">Enter total paid including tip (B+T)</h3>' +
      '<p class="poweruser-modal__hint poweruser-modal__step" id="poweruser-step-hint">Step 1: Analyzing bill with AI (Gemini)...</p>' +
      '<input type="number" step="0.01" min="0" id="poweruser-paid-input" class="poweruser-modal__input" placeholder="e.g. 220.50">' +
      '<div class="poweruser-modal__actions">' +
      '<button type="button" class="poweruser-modal__cancel" id="poweruser-modal-cancel">Cancel</button>' +
      '<button type="button" class="poweruser-modal__submit" id="poweruser-modal-submit">Submit</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

    function closeModal() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    document.getElementById('poweruser-modal-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    var phase1Promise = null;
    if (typeof ClaimsAPI !== 'undefined' && ClaimsAPI.analyzeBillImage) {
      phase1Promise = ClaimsAPI.analyzeBillImage({
        base64: imageData.base64,
        mimeType: imageData.mimeType
      });
    } else {
      phase1Promise = Promise.reject(new Error('API not available'));
    }

    var stepHint = document.getElementById('poweruser-step-hint');

    document.getElementById('poweruser-modal-submit').addEventListener('click', function () {
      var input = document.getElementById('poweruser-paid-input');
      var paidStr = input && input.value ? input.value.trim() : '';
      var paidAmount = parseFloat(paidStr);
      if (isNaN(paidAmount) || paidAmount < 0) {
        showErrorModal('Please enter a valid amount.');
        return;
      }
      var submitBtn = document.getElementById('poweruser-modal-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing…';
      if (stepHint) stepHint.textContent = 'Step 1: Completing analysis and checking for duplicates...';

      phase1Promise
        .then(function (res) {
          var jobId = res && res.jobId;
          if (!jobId) throw new Error('No jobId from analysis');
          if (stepHint) stepHint.textContent = 'Step 2: Saving to Drive and updating sheets...';
          if (typeof ClaimsAPI !== 'undefined' && ClaimsAPI.completeBillUpload) {
            return ClaimsAPI.completeBillUpload({
              jobId: jobId,
              paidAmount: paidAmount,
              base64: imageData.base64,
              mimeType: imageData.mimeType
            });
          }
          throw new Error('API not available');
        })
        .then(function (result) {
          closeModal();
          showUploadSuccess(result);
        })
        .catch(function (err) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit';
          if (stepHint) stepHint.textContent = 'Step 1: Analyzing bill with AI (Gemini)...';
          closeModal();
          showErrorModal(err.message || 'Upload failed');
        });
    });
  }

  function showUploadSuccess(result) {
    var section = document.getElementById('poweruser-upload');
    if (!section) return;
    var dateLabel = result.date && typeof ClaimsFormatters !== 'undefined' && ClaimsFormatters.formatBillDateDisplay
      ? ClaimsFormatters.formatBillDateDisplay(result.date) : result.date;
    var html = '<div class="poweruser-success-box">';
    html += '<h3 class="poweruser-success__title">Bill uploaded successfully</h3>';
    html += '<ul class="poweruser-success__list">';
    html += '<li><strong>Bill Date:</strong> ' + escapeHtml(dateLabel) + '</li>';
    html += '<li><strong>Bill Total:</strong> €' + (result.billTotal != null ? result.billTotal.toFixed(2) : '—') + '</li>';
    html += '<li><strong>Tip Amount:</strong> €' + (result.tipAmount != null ? result.tipAmount.toFixed(2) : '—') + '</li>';
    html += '<li><strong>Total Paid:</strong> €' + (result.totalPaid != null ? result.totalPaid.toFixed(2) : '—') + '</li>';
    html += '</ul>';
    html += '<button type="button" class="poweruser-upload-again" id="poweruser-upload-again">Upload another bill</button>';
    html += '</div>';
    section.innerHTML = html;
    document.getElementById('poweruser-upload-again').addEventListener('click', function () {
      renderBillUpload();
    });
  }

  var PowerUserPage = {
    init: function (el) {
      rootEl = el;
      renderShell();
    }
  };
  global.PowerUserPage = PowerUserPage;
})(typeof window !== 'undefined' ? window : this);
