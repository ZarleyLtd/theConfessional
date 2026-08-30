/**
 * Claims page: initial (hero + name + bill lists) -> products screen.
 */
(function (global) {
  var rootEl;
  var CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes

  var state = {
    screen: 'home',       // 'home' | 'products' | 'statement'
    isReviewMode: false,  // true when user selected from Historical bills
    enabledDates: [],
    enabledDatesFetchedAt: null,
    selectedDate: null,
    userName: '',
    bill: null,
    claims: [],
    mySelection: [],
    claimMap: {},
    productIcons: [],
    readyForProducts: false,
    displayOrderByRow: {},
    billCache: {},
    claimsCache: {},
    billImageCache: {},
    productIconsCache: null,
    productIconsFetchedAt: null,
    productsLoading: false,
    configNames: [],
    originalClaimsForUser: [],
    firstOpenBillPrefetchPromise: null,
    consolidatedRowOrder: {}
  };

  function normalizeUserName(name) {
    if (!name || !state.configNames || state.configNames.length === 0) return name;
    var trimmed = String(name).trim();
    if (!trimmed) return name;
    for (var i = 0; i < state.configNames.length; i++) {
      if (String(state.configNames[i]).toLowerCase() === trimmed.toLowerCase()) {
        return state.configNames[i];
      }
    }
    return trimmed;
  }

  function goHome() {
    state.screen = 'home';
    state.readyForProducts = false;
    state.productsLoading = false;
    state.isReviewMode = false;
    state.selectedDate = null;
    state.bill = null;
    state.claims = [];
    state.mySelection = [];
    state.originalClaimsForUser = [];
    state.claimMap = {};
    renderShell();
  }

  function isDatesStale() {
    if (!state.enabledDatesFetchedAt) return true;
    return (Date.now() - state.enabledDatesFetchedAt) > CACHE_TTL_MS;
  }

  function isClaimsStaleForDate(date) {
    var cached = state.claimsCache[date];
    if (!cached || !cached.fetchedAt) return true;
    return (Date.now() - cached.fetchedAt) > CACHE_TTL_MS;
  }

  function fetchDatesIfStale() {
    return new Promise(function (resolve) {
      if (!isDatesStale()) {
        resolve(state.enabledDates);
        return;
      }
      ClaimsAPI.getDatesWithBills().then(function (dates) {
          state.enabledDates = dates || [];
          state.enabledDatesFetchedAt = Date.now();
          resolve(state.enabledDates);
        })
        .catch(function (err) {
          console.error(err);
          resolve(state.enabledDates);
        });
    });
  }

  function render() {
    if (!rootEl) return;
    setAppHomeClass(true);
    renderInitialView();
    ClaimsAPI.getDatesWithBills()
      .then(function (dates) {
        state.enabledDates = dates || [];
        state.enabledDatesFetchedAt = Date.now();
        renderInitialViewLists();
        prefetchFirstOpenBill();
      })
      .catch(function (err) {
        console.warn('Background fetch dates failed:', err);
        renderInitialViewLists();
      });
  }

  function setAppHomeClass(isHome) {
    var app = document.getElementById('app');
    if (app) {
      if (isHome) app.classList.add('app--home');
      else app.classList.remove('app--home');
    }
  }

  function renderShell() {
    if (state.screen === 'home') {
      setAppHomeClass(true);
      renderInitialView();
      return;
    }
    setAppHomeClass(false);
    if (state.screen === 'statement') {
      renderStatementView();
      return;
    }
    renderProductsView();
  }

  function renderInitialView() {
    var split = getOpenAndHistoricalDates();
    var html = '<div class="claims-hero-bg" aria-hidden="true"></div>';
    html += '<div class="claims-home">';
    html += '<div class="claims-hero claims-hero--header-only">';
    html += '<div class="claims-hero__overlay"></div>';
    html += '<h1 class="claims-hero__title">The Confessional</h1>';
    html += '</div>';
    html += '<div class="claims-initial-content">';
    html += '<div id="claims-modal-name-mount"></div>';
    html += '<h2 class="claims-modal__heading">Open for claims</h2>';
    html += '<div id="claims-modal-open-bills"></div>';
    html += '<h2 class="claims-modal__heading">Historical bills</h2>';
    html += '<div id="claims-modal-historical-bills"></div>';
    html += '</div></div>';
    rootEl.innerHTML = html;
    NameCombobox.mount(document.getElementById('claims-modal-name-mount'), {
      initialValue: state.userName,
      onSelect: function (name) {
        state.userName = name;
      },
      onConfigLoaded: function (names) {
        state.configNames = names;
      }
    });
    renderBillList('claims-modal-open-bills', split.open, false, function (date) {
      state.selectedDate = date;
      state.isReviewMode = false;
      if (state.userName) onBillSelectedContinue();
    });
    renderBillList('claims-modal-historical-bills', split.historical, true, function (date) {
      state.selectedDate = date;
      state.isReviewMode = true;
      if (state.userName) onBillSelectedContinue();
    });
  }

  function renderInitialViewLists() {
    var split = getOpenAndHistoricalDates();
    renderBillList('claims-modal-open-bills', split.open, false, function (date) {
      state.selectedDate = date;
      state.isReviewMode = false;
      if (state.userName) onBillSelectedContinue();
    });
    renderBillList('claims-modal-historical-bills', split.historical, true, function (date) {
      state.selectedDate = date;
      state.isReviewMode = true;
      if (state.userName) onBillSelectedContinue();
    });
  }

  function buildBillImageDataUrl(data) {
    var mimeType = (data && data.mimeType) ? data.mimeType : 'image/jpeg';
    var base64 = (data && data.base64) ? data.base64 : '';
    return 'data:' + mimeType + ';base64,' + base64;
  }

  function prefetchFirstOpenBill() {
    var split = getOpenAndHistoricalDates();
    var firstOpen = split.open[0];
    if (firstOpen && !state.billCache[firstOpen] && !state.firstOpenBillPrefetchPromise) {
      state.firstOpenBillPrefetchPromise = ClaimsAPI.getBill(firstOpen)
        .then(function (bill) {
          state.billCache[firstOpen] = bill;
          return bill;
        })
        .catch(function () {});
    }
    return state.firstOpenBillPrefetchPromise;
  }

  function getOpenAndHistoricalDates() {
    var items = state.enabledDates || [];
    var openDates = [];
    var historicalDates = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var dateStr = typeof item === 'string' ? item : (item && item.date);
      var isOpen = typeof item === 'string' ? true : (typeof item === 'object' && item && item.open === true);
      if (!dateStr) continue;
      if (isOpen) openDates.push(dateStr);
      else historicalDates.push(dateStr);
    }
    openDates.sort();
    historicalDates.sort().reverse();
    return { open: openDates, historical: historicalDates };
  }

  /** Group bill items by description+category (bill order), one line per product with total quantity. */
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
      var ri = item.rowIndex != null ? item.rowIndex : i;
      if (!seen[key]) {
        seen[key] = { description: desc, category: cat, slots: [] };
        consolidated.push(seen[key]);
      }
      for (var u = 0; u < qty; u++) {
        seen[key].slots.push({ rowIndex: ri, unitIndex: u });
      }
    }
    return consolidated;
  }

  function renderBillList(containerId, dates, isHistorical, onSelect) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    var listEl = document.createElement('div');
    listEl.className = 'claims-bills-list';
    if (!state.enabledDatesFetchedAt && dates.length === 0) {
      var loading = document.createElement('p');
      loading.className = 'claims-bills-empty claims-bills-loading';
      loading.textContent = 'Loading dates…';
      listEl.appendChild(loading);
    } else if (dates.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'claims-bills-empty';
      empty.textContent = isHistorical ? 'No historical bills.' : 'No bills open for claims.';
      listEl.appendChild(empty);
    } else {
      for (var i = 0; i < dates.length; i++) {
        var dateStr = dates[i];
        var label = ClaimsFormatters.formatBillDateDisplay(dateStr);
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'claims-bill-item' + (isHistorical ? ' claims-bill-item--historical' : '');
        item.setAttribute('data-date', dateStr);
        item.innerHTML = '<span class="claims-bill-item__icon" aria-hidden="true">🧾</span><span class="claims-bill-item__date">' + label + '</span>';
        item.addEventListener('click', function () {
          var d = this.getAttribute('data-date');
          if (d && onSelect) onSelect(d);
        });
        listEl.appendChild(item);
      }
    }
    container.appendChild(listEl);
  }

  function onBillSelectedContinue() {
    if (!state.userName || !state.selectedDate) return;
    if (!state.configNames || state.configNames.length === 0) {
      ClaimsAPI.getConfigNames().then(function (names) {
        state.configNames = names || [];
        state.userName = normalizeUserName(state.userName);
        proceedToProducts();
      }).catch(function () {
        proceedToProducts();
      });
      return;
    }
    state.userName = normalizeUserName(state.userName);
    proceedToProducts();
  }

  function proceedToProducts() {
    var date = state.selectedDate;
    state.screen = 'products';
    state.readyForProducts = true;
    state.productsLoading = true;
    state.bill = null;
    state.claims = [];
    state.mySelection = [];
    state.originalClaimsForUser = [];
    state.claimMap = {};
    state.consolidatedRowOrder = {};
    renderShell();

    var split = getOpenAndHistoricalDates();
    var isFirstOpen = split.open[0] === date;
    var billPromise = state.billCache[date]
      ? Promise.resolve(state.billCache[date])
      : (isFirstOpen && state.firstOpenBillPrefetchPromise
          ? state.firstOpenBillPrefetchPromise.then(function () {
              return state.billCache[date] || ClaimsAPI.getBill(date).then(function (bill) {
                state.billCache[date] = bill;
                return bill;
              });
            })
          : ClaimsAPI.getBill(date).then(function (bill) {
              state.billCache[date] = bill;
              return bill;
            }));
    var claimsPromise = !isClaimsStaleForDate(date) && state.claimsCache[date]
      ? Promise.resolve(state.claimsCache[date].claims)
      : ClaimsAPI.getClaims(date).then(function (claims) {
          state.claimsCache[date] = { claims: claims, fetchedAt: Date.now() };
          return claims;
        });
    var iconsPromise = state.productIconsCache
      ? Promise.resolve(state.productIconsCache)
      : ClaimsAPI.getProductIcons().then(function (icons) {
          state.productIconsCache = icons;
          state.productIconsFetchedAt = Date.now();
          return icons;
        }).catch(function (err) {
          console.warn('ProductIcons load failed, using defaults:', err);
          return [];
        });
    Promise.all([billPromise, claimsPromise, iconsPromise]).then(function (results) {
      state.bill = results[0];
      state.claims = results[1] || [];
      state.productIcons = results[2] || [];
      state.claimMap = ClaimsState.buildClaimMap(state.claims);
      state.mySelection = ClaimsState.getMySelectionFromClaims(state.claims, state.userName);
      state.originalClaimsForUser = state.mySelection.map(function (s) { return { rowIndex: s.rowIndex, unitIndex: s.unitIndex }; });
      state.displayOrderByRow = {};
      state.productsLoading = false;
      renderShell();
      prefetchBillImage(date);
    }).catch(function (err) {
      console.error(err);
      state.productsLoading = false;
      state.bill = state.bill || { items: [] };
      renderBill();
      alert('Failed to load bill: ' + (err.message || err));
    });
  }

  function renderProductsView() {
    var dateLabel = ClaimsFormatters.formatBillDateDisplay(state.selectedDate) || state.selectedDate || '';
    var html = '<div class="claims-hero-bg" aria-hidden="true"></div>';
    html += '<div class="claims-products-topbar">';
    html += '<button type="button" class="claims-home-btn" id="claims-products-home-btn" aria-label="Home"><span class="claims-home-btn__icon-wrap"><svg class="claims-home-btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span><span class="claims-home-btn__label">Home</span></button>';
    html += '<h1 class="claims-products-topbar__title">The Confessional</h1>';
    if (state.bill && state.bill.metadata && state.bill.metadata.billImageUrl && state.selectedDate) {
      html += '<button type="button" class="claims-view-bill-btn" id="claims-view-bill-btn" data-date="' + state.selectedDate + '" title="View original bill"><span class="claims-view-bill-btn__receipt"></span><span class="claims-view-bill-btn__label">View Bill</span></button>';
    } else {
      html += '<span class="claims-products-topbar__spacer"></span>';
    }
    html += '</div>';
    html += '<div class="claims-products-wrap">';
    html += '<div class="claims-products-view">';
    html += '<p class="claims-products-intro">Claiming as <strong>' + (state.userName || '') + '</strong> · ' + dateLabel + '</p>';
    html += '<div id="claims-bill-mount"></div>';
    html += '<div id="claims-summary-mount"></div>';
    html += '<div id="claims-selection-area">';
    html += '<p id="claims-descriptive-label" class="claims-descriptive-label">Your selection: (none)</p>';
    html += '<p id="claims-estimated-cost" class="claims-estimated-cost" aria-live="polite">Estimated cost (incl tip): €?.??</p>';
    if (!state.isReviewMode) {
      html += '<button id="claims-submit-btn" type="button" class="claims-submit-btn"><span class="claims-submit-btn__text">Submit my claims</span><span class="claims-submit-btn__progress-wrap"><span class="claims-submit-btn__progress"></span></span></button>';
    }
    if (state.userName) {
      html += '<button type="button" class="claims-statement-btn" id="claims-statement-btn">My financial statement</button>';
    }
    html += '</div></div></div>';
    html += '<button type="button" class="claims-back-to-top hidden" id="claims-back-to-top" aria-label="Back to top"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>';
    rootEl.innerHTML = html;
    document.getElementById('claims-products-home-btn').addEventListener('click', goHome);
    var viewBillBtn = document.getElementById('claims-view-bill-btn');
    if (viewBillBtn) {
      viewBillBtn.addEventListener('click', function () {
        var date = viewBillBtn.getAttribute('data-date');
        openBillImageLightbox(date);
      });
    }
    if (!state.isReviewMode) {
      document.getElementById('claims-submit-btn').addEventListener('click', onSubmit);
    }
    var statementBtn = document.getElementById('claims-statement-btn');
    if (statementBtn) {
      statementBtn.addEventListener('click', goToStatement);
    }
    var backToTopBtn = document.getElementById('claims-back-to-top');
    if (backToTopBtn) {
      backToTopBtn.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      var onScroll = function () {
        backToTopBtn.classList.toggle('hidden', window.scrollY < 200);
        requestAnimationFrame(function () {});
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    renderBill();
    updateDescriptiveLabel();
    var summaryMount = document.getElementById('claims-summary-mount');
    if (typeof window.Summary !== 'undefined' && window.Summary.render && summaryMount) {
      window.Summary.render(summaryMount, state.bill, state.claims);
    }
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

    if (state.billImageCache[date]) {
      showBillImage(state.billImageCache[date]);
    } else {
      ClaimsAPI.getBillImage(date)
        .then(function (data) {
          var dataUrl = buildBillImageDataUrl(data);
          state.billImageCache[date] = dataUrl;
          showBillImage(dataUrl);
        })
        .catch(function (err) {
          var loadingEl = overlay.querySelector('.claims-bill-lightbox__loading');
          if (loadingEl) loadingEl.textContent = 'Failed to load image: ' + (err.message || err);
        });
    }
  }

  function prefetchBillImage(date) {
    if (!date || !state.bill || !state.bill.metadata || !state.bill.metadata.billImageUrl) return;
    if (state.billImageCache[date]) return;
    ClaimsAPI.getBillImage(date).then(function (data) {
      state.billImageCache[date] = buildBillImageDataUrl(data);
    }).catch(function () {});
  }

  function getProductRowScrollPositions() {
    var list = document.querySelectorAll('#claims-bill-mount .claims-product-row');
    var pos = {};
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var key = el.getAttribute('data-row-key');
      if (key == null) continue;
      var strip = el.querySelector('.claims-product-strip');
      pos[key + '_row'] = el.scrollLeft || 0;
      pos[key + '_strip'] = strip ? (strip.scrollLeft || 0) : 0;
    }
    return pos;
  }

  function setProductRowScrollPositions(pos) {
    if (!pos || typeof pos !== 'object') return;
    var list = document.querySelectorAll('#claims-bill-mount .claims-product-row');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var key = el.getAttribute('data-row-key');
      if (key == null) continue;
      var strip = el.querySelector('.claims-product-strip');
      if (pos[key + '_row'] != null) el.scrollLeft = pos[key + '_row'];
      if (strip && pos[key + '_strip'] != null) strip.scrollLeft = pos[key + '_strip'];
    }
  }

  function renderBill() {
    var mount = document.getElementById('claims-bill-mount');
    if (!mount) return;
    if (state.productsLoading) {
      mount.innerHTML = '<div class="claims-products-loading">Loading bill…</div>';
      return;
    }
    var bill = state.bill || {};
    var scrollPos = getProductRowScrollPositions();
    mount.innerHTML = '';
    var listEl = document.createElement('div');
    listEl.className = 'claims-products-list';
    mount.appendChild(listEl);
    var consolidated = buildConsolidatedItems(bill);
    var stateOrder = { 'claimed-by-me': 0, 'available': 1, 'claimed-by-other': 2 };
    for (var idx = 0; idx < consolidated.length; idx++) {
      var group = consolidated[idx];
      var rowKey = 'g' + idx;
      var slotsToUse = group.slots;
      if (state.consolidatedRowOrder[rowKey] && state.consolidatedRowOrder[rowKey].length === group.slots.length) {
        slotsToUse = state.consolidatedRowOrder[rowKey];
      } else {
        var withState = group.slots.map(function (s) {
          return { rowIndex: s.rowIndex, unitIndex: s.unitIndex, state: ClaimsState.getSlotState(state.claimMap, state.userName, s.rowIndex, s.unitIndex) };
        });
        withState.sort(function (a, b) { return stateOrder[a.state] - stateOrder[b.state]; });
        slotsToUse = withState.map(function (x) { return { rowIndex: x.rowIndex, unitIndex: x.unitIndex }; });
        state.consolidatedRowOrder[rowKey] = slotsToUse;
      }
      var rowEl = ProductRow.render({
        slots: slotsToUse,
        category: group.category,
        description: group.description,
        currentUser: state.userName,
        claimMap: state.claimMap,
        mySelection: state.mySelection,
        productIcons: state.productIcons,
        onSlotClick: state.isReviewMode ? undefined : function (rowIndex, unitIndex) { onSlotClick(rowIndex, unitIndex); },
        onClaimedByOtherClick: state.isReviewMode ? undefined : function (rowIndex, unitIndex, claimantName, buttonEl) {
          showClaimedByOtherMessage(claimantName, buttonEl);
        },
        readOnly: state.isReviewMode
      });
      rowEl.setAttribute('data-row-key', rowKey);
      listEl.appendChild(rowEl);
    }
    setProductRowScrollPositions(scrollPos);
    requestAnimationFrame(function () {
      setProductRowScrollPositions(scrollPos);
    });
    updateDescriptiveLabel();
    var summaryMount = document.getElementById('claims-summary-mount');
    if (typeof window.Summary !== 'undefined' && window.Summary.render && summaryMount) {
      window.Summary.render(summaryMount, state.bill, state.claims);
    }
  }

  function onSlotClick(rowIndex, unitIndex) {
    var slotState = ClaimsState.getSlotState(state.claimMap, state.userName, rowIndex, unitIndex);
    if (slotState === 'claimed-by-other') {
      var claim = (state.claims || []).find(function (c) {
        return c.rowIndex === rowIndex && c.unitIndex === unitIndex;
      });
      var name = (claim && claim.userName) ? claim.userName : 'someone else';
      alert('This has already been claimed by ' + name);
      return;
    }
    var idx = state.mySelection.findIndex(function (s) { return s.rowIndex === rowIndex && s.unitIndex === unitIndex; });
    if (slotState === 'claimed-by-me' || idx >= 0) {
      state.mySelection = state.mySelection.filter(function (s) { return !(s.rowIndex === rowIndex && s.unitIndex === unitIndex); });
      state.claims = state.claims.filter(function (c) { return !(c.rowIndex === rowIndex && c.unitIndex === unitIndex && String(c.userName || '').toLowerCase() === String(state.userName || '').toLowerCase()); });
    } else {
      state.mySelection.push({ rowIndex: rowIndex, unitIndex: unitIndex });
      state.claims = state.claims.concat([{ date: state.selectedDate, userName: state.userName, rowIndex: rowIndex, unitIndex: unitIndex }]);
    }
    state.claimMap = ClaimsState.buildClaimMap(state.claims);
    renderBill();
  }

  function escapeHtml(str) {
    if (str == null) return '';
    var s = String(str);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getEstimatedCostInclTip() {
    var bill = state.bill;
    var items = (bill && bill.items) ? bill.items : [];
    var sel = state.mySelection || [];
    if (items.length === 0) return null;
    var rowToUnitPrice = {};
    var billTotal = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var ri = it.rowIndex != null ? it.rowIndex : i;
      rowToUnitPrice[ri] = parseFloat(it.unit_price) || 0;
      billTotal += parseFloat(it.total_price) || 0;
    }
    var claimedTotal = 0;
    for (var j = 0; j < sel.length; j++) {
      var up = rowToUnitPrice[sel[j].rowIndex];
      if (typeof up === 'number' && !isNaN(up)) claimedTotal += up;
    }
    var totalPaid = (bill.metadata && bill.metadata.totalPaid != null) ? parseFloat(bill.metadata.totalPaid) : null;
    var tip = (totalPaid != null && !isNaN(totalPaid) && billTotal > 0 && totalPaid > billTotal)
      ? totalPaid - billTotal
      : 0;
    var proportionalTip = (billTotal > 0 && claimedTotal > 0) ? tip * (claimedTotal / billTotal) : 0;
    return claimedTotal + proportionalTip;
  }

  function updateEstimatedCost() {
    var el = document.getElementById('claims-estimated-cost');
    if (!el) return;
    var value = getEstimatedCostInclTip();
    if (value == null || (state.mySelection || []).length === 0) {
      el.textContent = 'Estimated cost (incl tip): €?.??';
      return;
    }
    el.textContent = 'Estimated cost (incl tip): €' + (Math.round(value * 100) / 100).toFixed(2);
  }

  function updateDescriptiveLabel() {
    var el = document.getElementById('claims-descriptive-label');
    if (!el) return;
    var consolidated = buildConsolidatedItems(state.bill);
    var selSet = {};
    (state.mySelection || []).forEach(function (s) {
      var k = s.rowIndex + '_' + s.unitIndex;
      selSet[k] = true;
    });
    var parts = [];
    for (var i = 0; i < consolidated.length; i++) {
      var group = consolidated[i];
      var count = 0;
      for (var j = 0; j < group.slots.length; j++) {
        var slot = group.slots[j];
        if (selSet[slot.rowIndex + '_' + slot.unitIndex]) count++;
      }
      if (count > 0) {
        parts.push('<strong>' + escapeHtml(group.description) + '</strong> (' + count + ')');
      }
    }
    el.innerHTML = 'Your selection: ' + (parts.length ? parts.join(', ') : '(none)');
    updateEstimatedCost();
  }

  function showClaimedByOtherMessage(claimantName, buttonEl) {
    var text = 'Claimed by ' + (claimantName || 'someone else');
    var msg = document.createElement('div');
    msg.className = 'claims-info-message claims-info-message--above';
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');
    msg.innerHTML = '<span class="claims-info-message__text">' + (text || '').replace(/</g, '&lt;') + '</span>';
    document.body.appendChild(msg);
    if (buttonEl) {
      var rect = buttonEl.getBoundingClientRect();
      var centerX = rect.left + rect.width / 2;
      msg.style.top = (rect.top - 8) + 'px';
      msg.style.left = centerX + 'px';
      var msgRect = msg.getBoundingClientRect();
      var pad = 8;
      var left = centerX;
      if (msgRect.left < pad) {
        left = left + (pad - msgRect.left);
      } else if (msgRect.right > window.innerWidth - pad) {
        left = left - (msgRect.right - (window.innerWidth - pad));
      }
      msg.style.left = left + 'px';
      if (msgRect.top < pad) {
        msg.style.top = (rect.bottom + 8) + 'px';
        msg.classList.remove('claims-info-message--above');
        msg.classList.add('claims-info-message--below');
      }
    }
    setTimeout(function () {
      if (msg.parentNode) msg.parentNode.removeChild(msg);
    }, 1000);
  }

  function showInfoMessage(text, submitBtn) {
    var labelEl = document.getElementById('claims-descriptive-label');
    var msg = document.createElement('div');
    msg.className = 'claims-info-message';
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');
    msg.innerHTML = '<span class="claims-info-message__text">' + (text || '').replace(/</g, '&lt;') + '</span>';
    document.body.appendChild(msg);
    if (labelEl) {
      var rect = labelEl.getBoundingClientRect();
      msg.style.top = (rect.top + rect.height / 2) + 'px';
      msg.style.left = (rect.left + rect.width / 2) + 'px';
    }
    if (submitBtn) submitBtn.disabled = true;
    setTimeout(function () {
      if (msg.parentNode) msg.parentNode.removeChild(msg);
      if (submitBtn) submitBtn.disabled = false;
    }, 1000);
  }

  function onSubmit() {
    if (!state.selectedDate || state.userName === '') return;
    var btn = document.getElementById('claims-submit-btn');
    if (!btn) return;

    var original = state.originalClaimsForUser || [];
    var sel = state.mySelection || [];

    if (sel.length === 0 && original.length === 0) {
      showInfoMessage('Nothing claimed', btn);
      return;
    }

    var same = original.length === sel.length && sel.every(function (s) {
      return original.some(function (e) { return e.rowIndex === s.rowIndex && e.unitIndex === s.unitIndex; });
    });
    if (same) {
      showInfoMessage('Claim already recorded', btn);
      return;
    }

    btn.disabled = true;
    btn.classList.add('claims-submit-btn--processing');
    var textEl = btn.querySelector('.claims-submit-btn__text');
    if (textEl) textEl.textContent = 'Processing…';
    ClaimsAPI.submitClaims({
      date: state.selectedDate,
      userName: state.userName,
      claims: state.mySelection
    }).then(function (data) {
      var claims = (data && Array.isArray(data.claims)) ? data.claims : null;
      if (claims == null) {
        return ClaimsAPI.getClaims(state.selectedDate);
      }
      return claims;
    }).then(function (claims) {
      claims = claims || [];
      state.claims = claims;
      state.claimMap = ClaimsState.buildClaimMap(state.claims);
      state.claimsCache[state.selectedDate] = { claims: claims, fetchedAt: Date.now() };
      state.mySelection = ClaimsState.getMySelectionFromClaims(state.claims, state.userName);
      state.originalClaimsForUser = state.mySelection.map(function (s) { return { rowIndex: s.rowIndex, unitIndex: s.unitIndex }; });
      renderBill();
      btn.disabled = false;
      btn.classList.remove('claims-submit-btn--processing');
      var textEl = btn.querySelector('.claims-submit-btn__text');
      if (textEl) textEl.textContent = 'Submit my claims';
      var msg = document.createElement('div');
      msg.className = 'claims-success-overlay';
      msg.setAttribute('role', 'status');
      msg.setAttribute('aria-live', 'polite');
      msg.innerHTML = '<span class="claims-success-overlay__text">Claims saved successfully!</span>';
      document.body.appendChild(msg);
      setTimeout(function () {
        if (msg.parentNode) msg.parentNode.removeChild(msg);
      }, 1500);
    }).catch(function (err) {
      var msg = err.message || err;
      alert('Submit failed: ' + msg);
      btn.disabled = false;
      btn.classList.remove('claims-submit-btn--processing');
      var textEl = btn.querySelector('.claims-submit-btn__text');
      if (textEl) textEl.textContent = 'Submit my claims';
      if (msg.indexOf('already claimed') >= 0 || msg.indexOf('slot') >= 0) {
        ClaimsAPI.getClaims(state.selectedDate).then(function (claims) {
          state.claims = claims || [];
          state.claimMap = ClaimsState.buildClaimMap(state.claims);
          state.mySelection = ClaimsState.getMySelectionFromClaims(state.claims, state.userName);
          state.claimsCache[state.selectedDate] = { claims: claims, fetchedAt: Date.now() };
          renderBill();
        }).catch(function () {});
      }
    });
  }

  function goToStatement() {
    if (!state.userName) {
      alert('Please enter your name first.');
      return;
    }
    state.screen = 'statement';
    renderShell();
  }

  function goBackFromStatement() {
    if (state.selectedDate) {
      state.screen = 'products';
    } else {
      state.screen = 'home';
    }
    renderShell();
  }

  function openBillFromStatement(billDate) {
    if (!billDate) return;
    state.selectedDate = billDate;
    state.isReviewMode = true;
    state.screen = 'products';
    onBillSelectedContinue();
  }

  function renderStatementView() {
    var html = '<div class="claims-hero-bg" aria-hidden="true"></div>';
    html += '<div class="claims-products-topbar">';
    html += '<button type="button" class="claims-home-btn" id="claims-statement-back-btn" aria-label="Back"><span class="claims-home-btn__icon-wrap"><svg class="claims-home-btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></span><span class="claims-home-btn__label">Back</span></button>';
    html += '<h1 class="claims-products-topbar__title">The Confessional</h1>';
    html += '<span class="claims-products-topbar__spacer"></span>';
    html += '</div>';
    html += '<div class="claims-products-wrap">';
    html += '<div class="statement-view">';
    html += '<h2 class="statement-view__title">Financial statement</h2>';
    html += '<p class="statement-view__user">Account: <strong>' + (state.userName || '') + '</strong></p>';
    html += '<div id="statement-mount"><p class="statement-view__loading">Loading…</p></div>';
    html += '</div></div>';
    rootEl.innerHTML = html;
    document.getElementById('claims-statement-back-btn').addEventListener('click', goBackFromStatement);

    if (typeof ClaimsAPI === 'undefined' || !ClaimsAPI.getUserStatement) {
      document.getElementById('statement-mount').innerHTML = '<p class="statement-view__error">Statement not available.</p>';
      return;
    }
    ClaimsAPI.getUserStatement(state.userName)
      .then(function (data) {
        renderStatementContent(document.getElementById('statement-mount'), data);
      })
      .catch(function (err) {
        document.getElementById('statement-mount').innerHTML = '<p class="statement-view__error">' + (err.message || 'Failed to load statement') + '</p>';
      });
  }

  function formatStatementMoney(val) {
    if (val == null || isNaN(val)) return '—';
    var n = parseFloat(val);
    var formatted = typeof ClaimsFormatters !== 'undefined' && ClaimsFormatters.formatCurrency
      ? ClaimsFormatters.formatCurrency(Math.abs(n))
      : ('€' + Math.abs(n).toFixed(2));
    return n < 0 ? ('-' + formatted) : formatted;
  }

  function renderStatementContent(mount, data) {
    if (!mount) return;
    var balance = data.currentBalance != null ? parseFloat(data.currentBalance) : 0;
    var balanceLabel = balance > 0 ? 'Owed' : (balance < 0 ? 'Due to you' : 'Balanced');
    var html = '<p class="statement-view__balance">' + balanceLabel + ': <strong>' + formatStatementMoney(balance) + '</strong></p>';
    var txns = data.transactions || [];
    if (txns.length === 0) {
      html += '<p class="statement-view__empty">No transactions yet.</p>';
      mount.innerHTML = html;
      return;
    }
    html += '<ul class="statement-list">';
    for (var i = 0; i < txns.length; i++) {
      var t = txns[i];
      var dateLabel = typeof ClaimsFormatters !== 'undefined' && ClaimsFormatters.formatBillDateDisplay
        ? ClaimsFormatters.formatBillDateDisplay(t.date) : t.date;
      var isBill = t.type === 'bill';
      var isOpening = t.type === 'opening';
      var amountClass = isBill ? 'statement-list__amount--debit' : (isOpening ? 'statement-list__amount--opening' : 'statement-list__amount--credit');
      html += '<li class="statement-list__item">';
      html += '<div class="statement-list__main">';
      html += '<span class="statement-list__date">' + dateLabel + '</span>';
      html += '<span class="statement-list__desc">' + (t.description || (isBill ? 'Bill' : (isOpening ? 'Opening balance' : 'Payment'))) + '</span>';
      if (!isOpening && t.amount != null) {
        html += '<span class="statement-list__amount ' + amountClass + '">' + formatStatementMoney(t.amount) + '</span>';
      } else if (isOpening) {
        html += '<span class="statement-list__amount ' + amountClass + '">' + formatStatementMoney(t.balanceAfter) + '</span>';
      }
      html += '</div>';
      html += '<div class="statement-list__balance">Balance: ' + formatStatementMoney(t.balanceAfter) + '</div>';
      if (isBill && t.billDate) {
        html += '<button type="button" class="statement-list__bill-link" data-date="' + t.billDate + '">View claims for this bill</button>';
      }
      html += '</li>';
    }
    html += '</ul>';
    mount.innerHTML = html;

    var billLinks = mount.querySelectorAll('.statement-list__bill-link');
    for (var bl = 0; bl < billLinks.length; bl++) {
      billLinks[bl].addEventListener('click', function () {
        openBillFromStatement(this.getAttribute('data-date'));
      });
    }
  }

  function parseInitialDeepLink() {
    if (typeof window === 'undefined' || !window.location || !window.location.search) return null;
    var params = new URLSearchParams(window.location.search);
    var date = params.get('date') || params.get('billDate');
    var userName = params.get('user') || params.get('userName') || params.get('name');
    if (!date || !userName) return null;
    return { date: date, userName: userName };
  }

  function openBillFromDeepLink(deepLink) {
    if (!deepLink || !deepLink.date || !deepLink.userName) return;
    state.userName = deepLink.userName;
    state.selectedDate = deepLink.date;
    state.isReviewMode = true;
    if (!state.configNames || state.configNames.length === 0) {
      ClaimsAPI.getConfigNames().then(function (names) {
        state.configNames = names || [];
        state.userName = normalizeUserName(state.userName);
        onBillSelectedContinue();
      }).catch(function () {
        state.userName = normalizeUserName(state.userName);
        onBillSelectedContinue();
      });
      return;
    }
    state.userName = normalizeUserName(state.userName);
    onBillSelectedContinue();
  }

  var ClaimsPage = {
    init: function (el) {
      rootEl = el;
      var deepLink = parseInitialDeepLink();
      if (deepLink) {
        openBillFromDeepLink(deepLink);
        return;
      }
      render();
    }
  };
  global.ClaimsPage = ClaimsPage;
})(typeof window !== 'undefined' ? window : this);
