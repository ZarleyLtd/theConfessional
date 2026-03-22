/**
 * Power User page: Bill Review and Bill Upload.
 * Same look and feel as claims page, with god-mode header.
 * Access via direct URL only (no links from index.html).
 */
(function (global) {
  var rootEl;
  var reviewState = { billsData: null, viewModeByDate: {}, expandedDate: null, billCache: {}, billFetchPromises: {}, billImageCache: {} };

  /** ++ button: must match `GEMINI_BILL_ALLOWED_MODELS` in backend `code.gs`. */
  var ALT_GEMINI_MODEL_CHOICES = [
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' }
  ];

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

  function prefetchBillImage(dateStr) {
    if (!dateStr || reviewState.billImageCache[dateStr]) return;
    if (typeof ClaimsAPI === 'undefined' || !ClaimsAPI.getBillImage) return;
    ClaimsAPI.getBillImage(dateStr)
      .then(function (data) {
        if (data && data.mimeType && data.base64) {
          reviewState.billImageCache[dateStr] = 'data:' + data.mimeType + ';base64,' + data.base64;
        }
      })
      .catch(function () {});
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
    html += '<div class="claims-hero__godmode-wrap">';
    html += '<h1 class="claims-hero__title">The Confessional</h1>';
    html += '<div class="claims-hero__god-icon-line"><span class="claims-hero__god-icon" aria-hidden="true">⚡</span></div>';
    html += '<div class="claims-hero__god-mode-line">God Mode</div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="poweruser-content">';
    html += '<div class="poweruser-main-wrap">';
    html += '<section id="poweruser-review" class="poweruser-section poweruser-section--active">';
    html += '<div class="poweruser-add-bar">' +
      '<button type="button" class="poweruser-add-bill" id="poweruser-add-bill" title="Upload new bill" aria-label="Upload new bill">+</button>' +
      '<button type="button" class="poweruser-add-bill poweruser-add-bill--narrow" id="poweruser-add-bill-alt" title="Upload with alternate Gemini model" aria-label="Upload with alternate AI model">++</button>' +
      '</div>';
    html += '<div id="poweruser-upload-inline" class="poweruser-upload-inline"></div>';
    html += '<div id="poweruser-review-list"></div>';
    html += '</section>';
    html += '</div>';
    html += '</div></div>';
    rootEl.innerHTML = html;

    var addBtn = document.getElementById('poweruser-add-bill');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var uploadSection = document.getElementById('poweruser-upload-inline');
        if (!uploadSection) return;
        var isOpen = uploadSection.classList.toggle('poweruser-upload-inline--open');
        if (isOpen) {
          renderBillUpload();
        }
      });
    }

    var addBtnAlt = document.getElementById('poweruser-add-bill-alt');
    if (addBtnAlt) {
      addBtnAlt.addEventListener('click', function () {
        showGeminiModelPicker(function (picked) {
          var uploadSection = document.getElementById('poweruser-upload-inline');
          if (!uploadSection) return;
          uploadSection.classList.add('poweruser-upload-inline--open');
          renderBillUpload({ geminiModel: picked.id, modelLabel: picked.label });
        });
      });
    }

    renderBillReview();
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

  /** True if bill has at least one item and every slot is claimed (for padlock visibility). */
  function billHasAllClaimed(fullBill) {
    if (!fullBill || !fullBill.items || fullBill.items.length === 0) return false;
    var claimMap = typeof ClaimsState !== 'undefined' && ClaimsState.buildClaimMap
      ? ClaimsState.buildClaimMap(fullBill.claims) : {};
    var consolidated = buildConsolidatedItems(fullBill);
    for (var j = 0; j < consolidated.length; j++) {
      if (hasUnclaimed(consolidated[j].slots, claimMap)) return false;
    }
    return true;
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
    var listContainer = document.getElementById('poweruser-review-list');
    if (!listContainer) return;
    listContainer.innerHTML = '<p class="poweruser-loading">Loading bills…</p>';
    if (typeof ClaimsAPI !== 'undefined' && ClaimsAPI.getBillsSummary) {
      ClaimsAPI.getBillsSummary()
        .then(function (data) {
          reviewState.billsData = data;
          renderBillReviewContent(listContainer, data);
          prefetchOpenBills();
        })
        .catch(function (err) {
          listContainer.innerHTML = '<p class="poweruser-error">Failed to load bills: ' + (err.message || err) + '</p>';
        });
    } else {
      listContainer.innerHTML = '<p class="poweruser-error">API not available. Deploy backend with getBillsSummary action.</p>';
    }
  }

  function renderBillReviewContent(listContainer, data) {
    var bills = (data && data.bills) ? data.bills : [];
    if (bills.length === 0) {
      listContainer.innerHTML = '<p class="poweruser-placeholder">No bills found.</p>';
      return;
    }

    listContainer.innerHTML = '<div class="poweruser-bills-list" id="poweruser-bills-list"></div>';
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
      var isInFlight = bill.inFlight === true;
      var isExpanded = reviewState.expandedDate === dateStr;
      if (isExpanded) prefetchBillImage(dateStr);
      var fullBill = reviewState.billCache[dateStr];
      var allClaimed = bill.allClaimed === true || (fullBill && billHasAllClaimed(fullBill));

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
      header.addEventListener('click', function () {
        var d = this.closest('.poweruser-bill-block').getAttribute('data-date');
        reviewState.expandedDate = reviewState.expandedDate === d ? null : d;
        var list = document.getElementById('poweruser-bills-list');
        if (list && reviewState.billsData) renderBillsList(list, reviewState.billsData.bills);
      });
      headerWrap.appendChild(header);

      var headerRight = document.createElement('div');
      headerRight.className = 'poweruser-bill-header-right';
      if (allClaimed && !isInFlight) {
        var padlockBtn = document.createElement('button');
        padlockBtn.type = 'button';
        padlockBtn.className = 'poweruser-bill-padlock';
        padlockBtn.title = isOpen ? 'Click to close bill' : 'Click to open bill';
        padlockBtn.setAttribute('aria-label', isOpen ? 'Close bill' : 'Open bill');
        var lockedSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
        var unlockedSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11L7 5Q7 2 12 2Q17 2 17 5L19 9"/></svg>';
        padlockBtn.innerHTML = isOpen ? unlockedSvg : lockedSvg;
        padlockBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var d = this.closest('.poweruser-bill-block').getAttribute('data-date');
          var list = document.getElementById('poweruser-bills-list');
          if (typeof ClaimsAPI !== 'undefined' && ClaimsAPI.setBillOpen && list && reviewState.billsData) {
            var btn = this;
            var workingEl = document.createElement('span');
            workingEl.className = 'poweruser-bill-working';
            workingEl.textContent = 'Working';
            btn.parentNode.insertBefore(workingEl, btn);
            btn.disabled = true;
            var billToUpdate = reviewState.billsData.bills.filter(function (b) { return b.date === d; })[0];
            var newOpen = !(billToUpdate && billToUpdate.open === true);
            ClaimsAPI.setBillOpen({ date: d, open: newOpen })
              .then(function () {
                if (billToUpdate) billToUpdate.open = newOpen;
                if (reviewState.billCache[d]) reviewState.billCache[d].open = newOpen;
                renderBillsList(list, reviewState.billsData.bills);
              })
              .catch(function (err) {
                if (workingEl.parentNode) workingEl.parentNode.removeChild(workingEl);
                btn.disabled = false;
                alert('Failed to update: ' + (err.message || err));
              });
          }
        });
        headerRight.appendChild(padlockBtn);
      }
      var badge = document.createElement('span');
      if (isInFlight) {
        badge.className = 'poweruser-bill-badge poweruser-bill-badge--inflight';
        badge.textContent = 'In flight';
      } else {
        badge.className = 'poweruser-bill-badge poweruser-bill-badge--' + (isOpen ? 'open' : 'closed');
        badge.textContent = isOpen ? 'Open' : 'Closed';
      }
      headerRight.appendChild(badge);
      headerWrap.appendChild(headerRight);

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
      if (hasNoClaims || isInFlight) {
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
          var btn = this;
          if (typeof ClaimsAPI !== 'undefined' && ClaimsAPI.deleteBill) {
            var workingEl = document.createElement('span');
            workingEl.className = 'poweruser-bill-working';
            workingEl.textContent = 'Working';
            btn.parentNode.insertBefore(workingEl, btn);
            btn.disabled = true;
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
                if (workingEl.parentNode) workingEl.parentNode.removeChild(workingEl);
                btn.disabled = false;
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
          var billTotal = (fullBill.items || []).reduce(function (s, it) {
            return s + (parseFloat(it.total_price) || 0);
          }, 0);
          var totalPaid = fullBill.totalPaid != null ? parseFloat(fullBill.totalPaid) : null;
          var tipAmount = (totalPaid != null && billTotal > 0 && totalPaid > billTotal)
            ? totalPaid - billTotal : 0;

          if (getViewModeForBill(dateStr) === 'byItem') {
            var claimMap = typeof ClaimsState !== 'undefined' && ClaimsState.buildClaimMap
              ? ClaimsState.buildClaimMap(fullBill.claims) : {};
            var consolidated = buildConsolidatedItems(fullBill);
            for (var j = 0; j < consolidated.length; j++) {
              var g = consolidated[j];
              var qty = g.slots.length;
              var lineTotal = (g.unitPrice * qty).toFixed(2);
              var claimantLines = getClaimantLines(g.slots, claimMap);
              var unclaimed = hasUnclaimed(g.slots, claimMap);
              var row = document.createElement('div');
              row.className = 'poweruser-item-row' + (unclaimed ? ' poweruser-item-row--unclaimed' : '');
              var lineWrap = document.createElement('div');
              lineWrap.className = 'poweruser-item-line-wrap';
              var itemUnit = document.createElement('span');
              itemUnit.className = 'poweruser-item-unit';
              itemUnit.textContent = g.description + ' x' + qty + ' @ ' + formatNum(g.unitPrice);
              lineWrap.appendChild(itemUnit);
              var spacer = document.createElement('span');
              spacer.className = 'poweruser-item-spacer';
              var itemTotal = document.createElement('span');
              itemTotal.className = 'poweruser-item-total';
              itemTotal.textContent = '€' + lineTotal;
              lineWrap.appendChild(spacer);
              lineWrap.appendChild(itemTotal);
              row.appendChild(lineWrap);
              if (claimantLines.length > 0) {
                var claimantsWrap = document.createElement('div');
                claimantsWrap.className = 'poweruser-item-claimants';
                for (var cl = 0; cl < claimantLines.length; cl++) {
                  var clSpan = document.createElement('div');
                  clSpan.className = 'poweruser-item-claimant-line';
                  clSpan.textContent = claimantLines[cl];
                  if (String(claimantLines[cl]).indexOf('Unclaimed') === 0) {
                    clSpan.className += ' poweruser-item-claimant-line--unclaimed';
                  }
                  claimantsWrap.appendChild(clSpan);
                }
                row.appendChild(claimantsWrap);
              }
              body.appendChild(row);
            }
            var byItemSummary = document.createElement('div');
            byItemSummary.className = 'poweruser-bill-summary';
            byItemSummary.innerHTML = '<div class="poweruser-bill-summary-row"><span class="poweruser-bill-summary-label">Total:</span><span class="poweruser-bill-summary-value">€' + formatNum(billTotal) + '</span></div><div class="poweruser-bill-summary-row"><span class="poweruser-bill-summary-label">Tip:</span><span class="poweruser-bill-summary-value">€' + formatNum(tipAmount) + '</span></div><div class="poweruser-bill-summary-row"><span class="poweruser-bill-summary-label">Total Paid:</span><span class="poweruser-bill-summary-value">€' + formatNum(totalPaid != null ? totalPaid : billTotal + tipAmount) + '</span></div>';
            var billSummaryEl = byItemSummary;
          } else {
            var byUser = buildByUserView(fullBill);
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
            var byUserSummary = document.createElement('div');
            byUserSummary.className = 'poweruser-bill-summary';
            byUserSummary.innerHTML = '<div class="poweruser-bill-summary-row"><span class="poweruser-bill-summary-label">Total:</span><span class="poweruser-bill-summary-value">€' + formatNum(billTotal) + '</span></div><div class="poweruser-bill-summary-row"><span class="poweruser-bill-summary-label">Tip:</span><span class="poweruser-bill-summary-value">€' + formatNum(tipAmount) + '</span></div><div class="poweruser-bill-summary-row"><span class="poweruser-bill-summary-label">Total Paid:</span><span class="poweruser-bill-summary-value">€' + formatNum(totalPaid != null ? totalPaid : billTotal + tipAmount) + '</span></div>';
            billSummaryEl = byUserSummary;
          }

          var actionsWrap = document.createElement('div');
          actionsWrap.className = 'poweruser-bill-actions';
          var copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'poweruser-copy-btn';
          copyBtn.textContent = 'Clip';
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
                setTimeout(function () { copyBtn.textContent = 'Clip'; }, 1500);
              }).catch(function () {
                fallbackCopy(txt, copyBtn);
              });
            } else {
              fallbackCopy(txt, copyBtn);
            }
            };
          })(fullBill));
          actionsWrap.appendChild(copyBtn);
          var viewBillBtn = document.createElement('button');
          viewBillBtn.type = 'button';
          viewBillBtn.className = 'claims-view-bill-btn';
          viewBillBtn.setAttribute('data-date', dateStr);
          viewBillBtn.title = 'View original bill';
          viewBillBtn.innerHTML = '<span class="claims-view-bill-btn__receipt"></span><span class="claims-view-bill-btn__label">View Bill</span>';
          viewBillBtn.addEventListener('click', (function (d) {
            return function () { openBillImageLightbox(d); };
          })(dateStr));
          actionsWrap.appendChild(viewBillBtn);
          var summaryActionsWrap = document.createElement('div');
          summaryActionsWrap.className = 'poweruser-bill-summary-actions';
          summaryActionsWrap.appendChild(actionsWrap);
          summaryActionsWrap.appendChild(billSummaryEl);
          body.appendChild(summaryActionsWrap);
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
      setTimeout(function () { btn.textContent = 'Clip'; }, 1500);
    } catch (e) {
      alert('Copy failed. Please select and copy manually.');
    }
    document.body.removeChild(ta);
  }

  function openBillImageLightbox(date) {
    if (!date || typeof ClaimsAPI === 'undefined' || !ClaimsAPI.getBillImage) return;
    var overlay = document.createElement('div');
    overlay.className = 'claims-bill-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Original bill image');
    overlay.innerHTML = '<div class="claims-bill-lightbox__content"><button type="button" class="claims-bill-lightbox__close" aria-label="Close">×</button><div class="claims-bill-lightbox__loading">Loading…</div></div>';
    document.body.appendChild(overlay);

    function closeLightbox() {
      overlay.removeEventListener('click', onOverlayClick);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function onOverlayClick(e) {
      if (e.target === overlay) closeLightbox();
    }
    overlay.querySelector('.claims-bill-lightbox__close').addEventListener('click', closeLightbox);
    overlay.addEventListener('click', onOverlayClick);

    function showBillImage(dataUrl) {
      var loadingEl = overlay.querySelector('.claims-bill-lightbox__loading');
      if (!loadingEl || !overlay.parentNode) return;
      var img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Original bill';
      img.className = 'claims-bill-lightbox__img';
      loadingEl.parentNode.replaceChild(img, loadingEl);
    }

    if (reviewState.billImageCache[date]) {
      showBillImage(reviewState.billImageCache[date]);
    } else {
      ClaimsAPI.getBillImage(date)
        .then(function (data) {
          var dataUrl = (data && data.mimeType && data.base64)
            ? ('data:' + data.mimeType + ';base64,' + data.base64) : '';
          if (dataUrl) {
            reviewState.billImageCache[date] = dataUrl;
            showBillImage(dataUrl);
          }
        })
        .catch(function (err) {
          var loadingEl = overlay.querySelector('.claims-bill-lightbox__loading');
          if (loadingEl) loadingEl.textContent = 'Failed to load image: ' + (err.message || err);
        });
    }
  }

  /**
   * @param {function({ id: string, label: string })} onPick
   */
  function showGeminiModelPicker(onPick) {
    var overlay = document.createElement('div');
    overlay.className = 'poweruser-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Choose AI model');

    var modal = document.createElement('div');
    modal.className = 'poweruser-modal poweruser-modal--model-pick';
    var inner = '<h3 class="poweruser-modal__title">Choose AI model</h3>' +
      '<p class="poweruser-modal__message">Same upload flow as + after you pick a model.</p>' +
      '<div class="poweruser-model-pick-list" role="group" aria-label="Gemini models">';
    for (var i = 0; i < ALT_GEMINI_MODEL_CHOICES.length; i++) {
      var opt = ALT_GEMINI_MODEL_CHOICES[i];
      inner += '<button type="button" class="poweruser-model-pick-btn" data-model-id="' + opt.id + '">' +
        escapeHtml(opt.label) + '</button>';
    }
    inner += '</div>' +
      '<div class="poweruser-modal__actions">' +
      '<button type="button" class="poweruser-modal__cancel" id="poweruser-model-pick-cancel">Cancel</button>' +
      '</div>';
    modal.innerHTML = inner;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function closePicker() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    modal.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('poweruser-model-pick-btn')) {
        var id = t.getAttribute('data-model-id');
        var label = (t.textContent || '').trim();
        closePicker();
        if (id && typeof onPick === 'function') onPick({ id: id, label: label });
      }
    });

    modal.querySelector('#poweruser-model-pick-cancel').addEventListener('click', closePicker);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePicker();
    });
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

  function roundMoney2(n) {
    return Math.round(n * 100) / 100;
  }

  /**
   * Next total paid when pressing + : smallest strictly above P0 among tip-€5, 5/10/15%, total-€5.
   * Returns { paid, driver } where driver is 'tip' | 'pct' | 'total' for UI feedback.
   */
  function totalPaidNextStepUp(P0, B) {
    var Bc = Math.round(B * 100);
    var P0c = Math.round(P0 * 100);
    if (Bc < 0 || P0c < Bc) P0c = Bc;
    var T0c = P0c - Bc;
    var entries = [];

    var Tnext = Math.floor(T0c / 500) * 500 + 500;
    entries.push({ c: Bc + Tnext, pri: 0, driver: 'tip' });

    var mults = [1.05, 1.1, 1.15];
    for (var i = 0; i < mults.length; i++) {
      var pc = Math.round(B * mults[i] * 100);
      if (pc > P0c) entries.push({ c: pc, pri: 1, driver: 'pct' });
    }

    var pMult5 = Math.floor(P0c / 500) * 500;
    if (pMult5 <= P0c) pMult5 += 500;
    entries.push({ c: pMult5, pri: 2, driver: 'total' });

    var best = null;
    for (var j = 0; j < entries.length; j++) {
      var e = entries[j];
      if (e.c <= P0c || e.c < Bc) continue;
      if (best === null || e.c < best.c || (e.c === best.c && e.pri < best.pri)) best = e;
    }
    if (best === null) return { paid: roundMoney2(P0), driver: 'total' };
    return { paid: best.c / 100, driver: best.driver };
  }

  /** Previous total when pressing − : largest milestone strictly below P0, not below B. */
  function totalPaidNextStepDown(P0, B) {
    var Bc = Math.round(B * 100);
    var P0c = Math.round(P0 * 100);
    if (P0c < Bc) P0c = Bc;
    var T0c = P0c - Bc;
    var entries = [];

    if (T0c > 0) {
      var Tprev;
      if (T0c % 500 === 0) Tprev = T0c - 500;
      else Tprev = Math.floor((T0c - 1) / 500) * 500;
      if (Tprev >= 0) entries.push({ c: Bc + Tprev, pri: 0, driver: 'tip' });
    }

    var mults = [1.05, 1.1, 1.15];
    for (var i = 0; i < mults.length; i++) {
      var pc = Math.round(B * mults[i] * 100);
      if (pc < P0c && pc >= Bc) entries.push({ c: pc, pri: 1, driver: 'pct' });
    }

    var pMult5 = Math.floor((P0c - 1) / 500) * 500;
    if (pMult5 >= Bc) entries.push({ c: pMult5, pri: 2, driver: 'total' });

    var best = null;
    for (var j = 0; j < entries.length; j++) {
      var e = entries[j];
      if (e.c >= P0c || e.c < Bc) continue;
      if (best === null || e.c > best.c || (e.c === best.c && e.pri < best.pri)) best = e;
    }
    if (best === null) return { paid: roundMoney2(B), driver: 'tip' };
    return { paid: best.c / 100, driver: best.driver };
  }

  /**
   * @param {Object} [options]
   * @param {string} [options.geminiModel] - API model id for ++ path only
   * @param {string} [options.modelLabel] - Human label for progress hint
   */
  function renderBillUpload(options) {
    options = options || {};
    var billGeminiModel = options.geminiModel || null;
    var billModelLabel = options.modelLabel || null;

    var section = document.getElementById('poweruser-upload-inline');
    if (!section) return;
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
      input.value = '';

      var statusEl = document.getElementById('poweruser-upload-status');
      if (statusEl) {
        statusEl.textContent = 'Compressing image…';
        statusEl.classList.remove('poweruser-upload-status--error');
      }

      var compress = (typeof BillImageCompress !== 'undefined' && BillImageCompress.compressBillImage)
        ? BillImageCompress.compressBillImage(file)
        : readFileAsDataUrlFallback(file);

      compress
        .then(function (imageData) {
          if (statusEl) statusEl.textContent = '';
          showBillUploadFlowModal(imageData, {
            geminiModel: billGeminiModel,
            modelLabel: billModelLabel
          });
        })
        .catch(function (err) {
          if (statusEl) {
            statusEl.textContent = err.message || 'Failed to process image';
            statusEl.classList.add('poweruser-upload-status--error');
          }
        });
    }

    function readFileAsDataUrlFallback(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          var dataUrl = reader.result;
          var match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          var mimeType = (match && match[1]) || 'image/jpeg';
          var base64 = (match && match[2]) || '';
          if (!base64) reject(new Error('Invalid image'));
          else resolve({ base64: base64, mimeType: mimeType });
        };
        reader.onerror = function () { reject(new Error('Failed to read file')); };
        reader.readAsDataURL(file);
      });
    }

    var cameraInput = document.getElementById('poweruser-camera-input');
    var galleryInput = document.getElementById('poweruser-gallery-input');
    if (cameraInput) cameraInput.addEventListener('change', function () { handleImageChosen(this); });
    if (galleryInput) galleryInput.addEventListener('change', function () { handleImageChosen(this); });
  }

  function showBillUploadFlowModal(imageData, flowOpts) {
    flowOpts = flowOpts || {};
    var initialHint = flowOpts.modelLabel
      ? ('Step 1: Analyzing with ' + flowOpts.modelLabel + '…')
      : 'Step 1: Analyzing bill with AI (Gemini)…';

    var overlay = document.createElement('div');
    overlay.className = 'poweruser-modal-overlay poweruser-modal-overlay--bt';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Bill upload');

    var modal = document.createElement('div');
    modal.className = 'poweruser-modal poweruser-modal--bill-flow';
    modal.innerHTML =
      '<h3 class="poweruser-modal__title" id="poweruser-bill-flow-title">Analyzing bill…</h3>' +
      '<p class="poweruser-modal__hint" id="poweruser-bill-flow-hint">' + escapeHtml(initialHint) + '</p>' +
      '<div id="poweruser-bill-flow-body"></div>' +
      '<div id="poweruser-persist-banner" class="poweruser-persist-banner" role="alert" hidden></div>' +
      '<div class="poweruser-modal__actions poweruser-modal__actions--bill-bt" id="poweruser-bill-flow-actions">' +
      '<button type="button" class="poweruser-modal__cancel" id="poweruser-bill-flow-cancel">Cancel</button>' +
      '<button type="button" class="poweruser-modal__submit" id="poweruser-bill-confirm" hidden disabled>Confirm</button>' +
      '</div>';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var titleEl = modal.querySelector('#poweruser-bill-flow-title');
    var hintEl = modal.querySelector('#poweruser-bill-flow-hint');
    var bodyEl = modal.querySelector('#poweruser-bill-flow-body');
    var persistBanner = modal.querySelector('#poweruser-persist-banner');

    var state = {
      jobId: null,
      dateStr: null,
      billTotal: 0,
      persistPromise: null,
      persistFailCount: 0,
      persistSucceeded: false
    };

    function closeModal() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    function hidePersistBanner() {
      persistBanner.hidden = true;
      persistBanner.innerHTML = '';
    }

    function showPersistError(msg) {
      persistBanner.hidden = false;
      persistBanner.innerHTML =
        '<p class="poweruser-persist-banner__text">' + escapeHtml(msg) + '</p>' +
        '<button type="button" class="poweruser-modal__submit" id="poweruser-persist-retry">Retry save</button>';
      persistBanner.querySelector('#poweruser-persist-retry').addEventListener('click', function () {
        hidePersistBanner();
        kickPersist();
      });
    }

    function kickPersist() {
      if (!state.jobId || typeof ClaimsAPI === 'undefined' || !ClaimsAPI.completeBillUpload) {
        state.persistFailCount++;
        if (state.persistFailCount >= 2) {
          showErrorModal('API not available');
          closeModal();
        } else {
          showPersistError('API not available');
        }
        return;
      }
      state.persistPromise = ClaimsAPI.completeBillUpload({
        jobId: state.jobId,
        base64: imageData.base64,
        mimeType: imageData.mimeType
      })
        .then(function (res) {
          state.persistSucceeded = true;
          state.persistFailCount = 0;
          hidePersistBanner();
          refreshConfirmEnabled();
          return res;
        })
        .catch(function (err) {
          state.persistSucceeded = false;
          state.persistFailCount++;
          if (state.persistFailCount >= 2) {
            showErrorModal(err.message || 'Failed to save bill');
            closeModal();
          } else {
            showPersistError(err.message || 'Failed to save bill');
          }
          refreshConfirmEnabled();
          return Promise.reject(err);
        });
    }

    function refreshConfirmEnabled() {
      var c = document.getElementById('poweruser-bill-confirm');
      if (!c) return;
      c.disabled = !state.persistSucceeded;
      if (!state.persistSucceeded) {
        c.setAttribute('title', 'Waiting for bill to save…');
      } else {
        c.removeAttribute('title');
      }
    }

    function renderTipOptions() {
      var B = state.billTotal;
      var dateLabel = state.dateStr && typeof ClaimsFormatters !== 'undefined' && ClaimsFormatters.formatBillDateDisplay
        ? ClaimsFormatters.formatBillDateDisplay(state.dateStr) : state.dateStr;
      var html = '<ul class="poweruser-bill-analysed-summary poweruser-bill-analysed-summary--hero">';
      html += '<li class="poweruser-bill-hero-row">';
      html += '<div class="poweruser-bill-hero-col poweruser-bill-hero-col--date">';
      html += '<span class="poweruser-bill-hero-label">Bill date</span>';
      html += '<span class="poweruser-bill-hero-value">' + escapeHtml(dateLabel) + '</span></div>';
      html += '<div class="poweruser-bill-hero-col poweruser-bill-hero-col--total">';
      html += '<span class="poweruser-bill-hero-label">Bill total</span>';
      html += '<span class="poweruser-bill-hero-value">€' + formatNum(B) + '</span></div>';
      html += '</li></ul>';
      html += '<div class="poweruser-bt-stack">';
      html += '<div class="poweruser-bt-row poweruser-bt-row--tip">';
      html += '<label class="poweruser-bt-field__label" for="poweruser-bt-tip">Tip (€)</label>';
      html += '<div class="poweruser-bt-tip-inline">';
      html += '<input type="text" inputmode="decimal" autocomplete="off" id="poweruser-bt-tip" class="poweruser-modal__input poweruser-bt-input--narrow" placeholder="" aria-label="Tip in euros">';
      html += '<span class="poweruser-bt-tip-pct" id="poweruser-bt-tip-pct" aria-live="polite">0%</span>';
      html += '</div></div>';
      html += '<div class="poweruser-bt-row poweruser-bt-row--total">';
      html += '<label class="poweruser-bt-field__label" for="poweruser-bt-total">Total paid (€)</label>';
      html += '<div class="poweruser-bt-total-stepper">';
      html += '<button type="button" class="poweruser-bt-step-btn" id="poweruser-bt-minus" aria-label="Decrease total paid" title="Decrease">−</button>';
      html += '<input type="text" inputmode="decimal" autocomplete="off" id="poweruser-bt-total" class="poweruser-modal__input poweruser-bt-input--narrow" aria-label="Total paid in euros">';
      html += '<button type="button" class="poweruser-bt-step-btn" id="poweruser-bt-plus" aria-label="Increase total paid" title="Increase">+</button>';
      html += '</div></div></div>';
      bodyEl.innerHTML = html;

      var tipInput = document.getElementById('poweruser-bt-tip');
      var totalInput = document.getElementById('poweruser-bt-total');
      var tipPctEl = document.getElementById('poweruser-bt-tip-pct');
      var syncLock = false;

      function parseMoney(str) {
        if (str == null) return NaN;
        var s = String(str).trim().replace(',', '.');
        if (s === '') return NaN;
        return parseFloat(s);
      }

      function tipDisplayFromAmount(tipAmt) {
        if (tipAmt <= 1e-6) return '';
        return formatNum(tipAmt);
      }

      function updateTipPctLabel() {
        if (!tipPctEl) return;
        if (!(B > 0)) {
          tipPctEl.textContent = '—';
          return;
        }
        var rawTot = totalInput.value.trim();
        if (rawTot === '') {
          tipPctEl.textContent = '—';
          return;
        }
        var tot = parseMoney(rawTot);
        if (isNaN(tot)) {
          tipPctEl.textContent = '—';
          return;
        }
        var tipAmt = roundMoney2(tot - B);
        if (tipAmt <= 1e-6) {
          tipPctEl.textContent = '0%';
          return;
        }
        var pct = (tipAmt / B) * 100;
        tipPctEl.textContent = pct.toFixed(1) + '%';
      }

      function flashStepDriver(driver) {
        var el = driver === 'tip' ? tipInput : driver === 'pct' ? tipPctEl : totalInput;
        if (!el) return;
        el.classList.add('poweruser-bt-flash-bold');
        window.setTimeout(function () {
          el.classList.remove('poweruser-bt-flash-bold');
        }, 500);
      }

      function selectAllOnFocus(el) {
        if (!el) return;
        window.setTimeout(function () {
          if (typeof el.select === 'function') el.select();
        }, 0);
      }

      function currentTotalForStep() {
        var P0 = parseMoney(totalInput.value);
        if (isNaN(P0)) P0 = B;
        return Math.max(roundMoney2(P0), B);
      }

      function refreshStepperButtons() {
        var minus = document.getElementById('poweruser-bt-minus');
        if (!minus) return;
        minus.disabled = currentTotalForStep() <= B + 1e-6;
      }

      function applyTotalPaid(P) {
        P = roundMoney2(P);
        if (P < B) P = B;
        var tipAmt = roundMoney2(P - B);
        syncLock = true;
        tipInput.value = tipDisplayFromAmount(tipAmt);
        totalInput.value = formatNum(P);
        syncLock = false;
        updateTipPctLabel();
        refreshStepperButtons();
      }

      function onTipInput() {
        if (syncLock) return;
        var s = tipInput.value.trim();
        syncLock = true;
        if (s === '') {
          totalInput.value = formatNum(B);
        } else {
          var t = parseMoney(s);
          if (!isNaN(t) && t >= 0) {
            totalInput.value = formatNum(roundMoney2(B + t));
          }
        }
        syncLock = false;
        updateTipPctLabel();
        refreshStepperButtons();
      }

      function onTotalInput() {
        if (syncLock) return;
        var s = totalInput.value;
        syncLock = true;
        var trimmed = s.trim();
        if (trimmed === '') {
          tipInput.value = '';
        } else {
          var tot = parseMoney(trimmed);
          if (!isNaN(tot) && tot >= 0) {
            var tipAmt = roundMoney2(tot - B);
            tipInput.value = tipDisplayFromAmount(tipAmt);
          }
        }
        syncLock = false;
        updateTipPctLabel();
        refreshStepperButtons();
      }

      applyTotalPaid(roundMoney2(B * 1.1));

      tipInput.addEventListener('focus', function () {
        if (syncLock) return;
        selectAllOnFocus(tipInput);
      });
      totalInput.addEventListener('focus', function () {
        if (syncLock) return;
        selectAllOnFocus(totalInput);
      });

      tipInput.addEventListener('input', onTipInput);
      tipInput.addEventListener('blur', function () {
        if (syncLock) return;
        var s = tipInput.value.trim();
        syncLock = true;
        if (s === '') {
          totalInput.value = formatNum(B);
        } else {
          var t = parseMoney(s);
          if (!isNaN(t) && t >= 0) {
            tipInput.value = tipDisplayFromAmount(t);
            totalInput.value = formatNum(roundMoney2(B + t));
          }
        }
        syncLock = false;
        updateTipPctLabel();
        refreshStepperButtons();
      });
      totalInput.addEventListener('input', onTotalInput);
      totalInput.addEventListener('blur', function () {
        if (syncLock) return;
        var raw = totalInput.value.trim();
        syncLock = true;
        if (raw === '') {
          tipInput.value = '';
          totalInput.value = formatNum(B);
        } else {
          var tot = parseMoney(raw);
          if (isNaN(tot) || tot < B) {
            totalInput.value = formatNum(B);
            tipInput.value = '';
          } else {
            var tipAmt = roundMoney2(tot - B);
            tipInput.value = tipDisplayFromAmount(tipAmt);
            totalInput.value = formatNum(roundMoney2(tot));
          }
        }
        syncLock = false;
        updateTipPctLabel();
        refreshStepperButtons();
      });

      document.getElementById('poweruser-bt-minus').addEventListener('click', function () {
        var step = totalPaidNextStepDown(currentTotalForStep(), B);
        applyTotalPaid(step.paid);
        flashStepDriver(step.driver);
      });
      document.getElementById('poweruser-bt-plus').addEventListener('click', function () {
        var step = totalPaidNextStepUp(currentTotalForStep(), B);
        applyTotalPaid(step.paid);
        flashStepDriver(step.driver);
      });

      var confirmBtn = document.getElementById('poweruser-bill-confirm');
      if (confirmBtn) {
        confirmBtn.hidden = false;
      }
      refreshConfirmEnabled();
      kickPersist();
      if (state.persistPromise && typeof state.persistPromise.then === 'function') {
        state.persistPromise.then(function () { refreshConfirmEnabled(); }).catch(function () { refreshConfirmEnabled(); });
      }
    }

    function readTotalPaidFromForm() {
      var totalInput = document.getElementById('poweruser-bt-total');
      var tipInput = document.getElementById('poweruser-bt-tip');
      var B = state.billTotal;
      if (!totalInput) return NaN;
      var raw = String(totalInput.value).trim();
      var tot = raw === '' ? NaN : parseFloat(raw.replace(',', '.'));
      if (isNaN(tot)) {
        var s = tipInput && tipInput.value.trim();
        if (s === '') return B;
        var t = parseFloat(s.replace(',', '.'));
        if (!isNaN(t) && t >= 0) return roundMoney2(B + t);
        return NaN;
      }
      return roundMoney2(tot);
    }

    modal.querySelector('#poweruser-bill-confirm').addEventListener('click', function onBtConfirm() {
      var btn = document.getElementById('poweruser-bill-confirm');
      if (btn.hidden || !state.persistSucceeded) return;
      var totalPaid = readTotalPaidFromForm();
      if (isNaN(totalPaid) || totalPaid < state.billTotal - 1e-6) {
        showErrorModal('Enter a valid total at least equal to the bill total (€' + formatNum(state.billTotal) + ').');
        return;
      }
      if (typeof ClaimsAPI === 'undefined' || !ClaimsAPI.updateBillTotalPaid || !ClaimsAPI.setBillOpen) {
        showErrorModal('API not available');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Saving…';

      function ensurePersisted() {
        if (state.persistSucceeded) return Promise.resolve();
        return ClaimsAPI.completeBillUpload({
          jobId: state.jobId,
          base64: imageData.base64,
          mimeType: imageData.mimeType
        }).then(function () {
          state.persistSucceeded = true;
          hidePersistBanner();
        });
      }

      function finalizeOnce() {
        return ClaimsAPI.updateBillTotalPaid({ date: state.dateStr, totalPaid: totalPaid }).then(function (upd) {
          return ClaimsAPI.setBillOpen({ date: state.dateStr, open: true }).then(function () {
            return upd;
          });
        });
      }

      ensurePersisted()
        .catch(function () {
          if (state.persistSucceeded) return Promise.resolve();
          return ensurePersisted();
        })
        .then(function () {
          return finalizeOnce();
        })
        .catch(function () {
          return finalizeOnce();
        })
        .then(function (result) {
          closeModal();
          showUploadSuccess(result);
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = 'Confirm';
          refreshConfirmEnabled();
          showErrorModal(err.message || 'Failed to finalize bill');
        });
    });

    modal.querySelector('#poweruser-bill-flow-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    if (typeof ClaimsAPI === 'undefined' || !ClaimsAPI.analyzeBillImage) {
      showErrorModal('API not available');
      closeModal();
      return;
    }

    var analyzePayload = {
      base64: imageData.base64,
      mimeType: imageData.mimeType
    };
    if (flowOpts.geminiModel) {
      analyzePayload.geminiModel = flowOpts.geminiModel;
    }

    ClaimsAPI.analyzeBillImage(analyzePayload)
      .then(function (res) {
        if (!res || !res.jobId) throw new Error('No jobId from analysis');
        state.jobId = res.jobId;
        state.dateStr = res.date || '';
        state.billTotal = typeof res.billTotal === 'number' ? res.billTotal : parseFloat(res.billTotal);
        if (isNaN(state.billTotal)) state.billTotal = 0;
        titleEl.textContent = 'Bill successfully analysed';
        hintEl.textContent = '';
        renderTipOptions();
      })
      .catch(function (err) {
        showErrorModal(err.message || 'Analysis failed');
        closeModal();
      });
  }

  function showUploadSuccess(result) {
    var section = document.getElementById('poweruser-upload-inline');
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
    html += '<button type="button" class="poweruser-upload-ok" id="poweruser-upload-ok">OK</button>';
    html += '</div>';
    section.innerHTML = html;
    document.getElementById('poweruser-upload-ok').addEventListener('click', function () {
      section.innerHTML = '';
      section.classList.remove('poweruser-upload-inline--open');
    });
    if (typeof ClaimsAPI !== 'undefined' && ClaimsAPI.getBillsSummary && reviewState.billsData) {
      ClaimsAPI.getBillsSummary().then(function (data) {
        reviewState.billsData = data;
        var listContainer = document.getElementById('poweruser-review-list');
        if (listContainer) renderBillReviewContent(listContainer, data);
      });
    }
  }

  var PowerUserPage = {
    init: function (el) {
      rootEl = el;
      renderShell();
    }
  };
  global.PowerUserPage = PowerUserPage;
})(typeof window !== 'undefined' ? window : this);
