/**
 * Power User page: Bill Review and Bill Upload.
 * Same look and feel as claims page, with god-mode header.
 * Access via direct URL only (no links from index.html).
 */
(function (global) {
  var rootEl;
  var reviewState = { billsData: null, viewModeByDate: {}, expandedDate: null, billCache: {}, billFetchPromises: {}, billImageCache: {} };
  var pageState = { section: 'bills', paymentSelectedUser: null, paymentBalanceInfo: null, financialBillDate: null };
  var RETURN_STATE_KEY = 'poweruserReturnState';

  function getSectionFromUrl() {
    if (typeof window === 'undefined' || !window.location) return null;
    var section = new URLSearchParams(window.location.search).get('section');
    if (section === 'bills' || section === 'transactions' || section === 'financial' || section === 'payment') {
      return section;
    }
    return null;
  }

  function syncSectionUrl(section) {
    if (typeof window === 'undefined' || !window.history || !window.history.replaceState) return;
    var url = new URL(window.location.href);
    if (section && section !== 'bills') url.searchParams.set('section', section);
    else url.searchParams.delete('section');
    var next = url.pathname + url.search + url.hash;
    var current = window.location.pathname + window.location.search + window.location.hash;
    if (next !== current) {
      window.history.replaceState({ poweruserSection: section }, '', next);
    }
  }

  function readReturnState() {
    try {
      var raw = sessionStorage.getItem(RETURN_STATE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveReturnState(txnKey) {
    try {
      sessionStorage.setItem(RETURN_STATE_KEY, JSON.stringify({
        section: pageState.section,
        scrollY: window.scrollY || 0,
        txnKey: txnKey || null
      }));
    } catch (e) {}
    syncSectionUrl(pageState.section);
  }

  function clearReturnState() {
    try {
      sessionStorage.removeItem(RETURN_STATE_KEY);
    } catch (e) {}
  }

  function buildTransactionKey(type, billDate, date, userName, paymentId) {
    if (type === 'payment') {
      return String(date || '') + '|' + String(userName || '') + '|payment|' + String(paymentId || '');
    }
    return String(billDate || date || '') + '|' + String(userName || '') + '|bill';
  }

  function restoreTransactionsView(mount) {
    var state = readReturnState();
    if (!state || state.section !== 'transactions') return;
    clearReturnState();

    function applyRestore() {
      var restored = false;
      if (state.txnKey && mount) {
        var rows = mount.querySelectorAll('[data-txn-key]');
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].getAttribute('data-txn-key') === state.txnKey) {
            rows[i].classList.add('poweruser-transactions-list__item--returned');
            rows[i].scrollIntoView({ block: 'center', behavior: 'auto' });
            restored = true;
            break;
          }
        }
      }
      if (!restored && state.scrollY > 0) {
        window.scrollTo(0, state.scrollY);
      }
    }

    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(applyRestore);
    } else {
      setTimeout(applyRestore, 0);
    }
  }

  /** ++ button: must match `GEMINI_BILL_ALLOWED_MODELS` in the edge function. */
  var ALT_GEMINI_MODEL_CHOICES = [
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' },
    { id: 'gemma-3-27b-it', label: 'Gemma 2 27B' }
  ];

  /** Display name for the (+) path; must match `GEMINI_BILL_DEFAULT_MODEL` in the edge function. */
  var DEFAULT_BILL_MODEL_LABEL = 'Gemini 3 Flash';

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
    html += '<nav class="poweruser-nav" aria-label="God Mode sections">';
    html += '<button type="button" class="poweruser-nav__btn poweruser-nav__btn--active" data-section="bills" title="Bills" aria-label="Bills"><span class="poweruser-nav__icon" aria-hidden="true">🧾</span></button>';
    html += '<button type="button" class="poweruser-nav__btn" data-section="transactions" title="Transactions" aria-label="Transactions"><span class="poweruser-nav__icon" aria-hidden="true">📜</span></button>';
    html += '<button type="button" class="poweruser-nav__btn" data-section="financial" title="Classic View" aria-label="Classic View"><span class="poweruser-nav__icon" aria-hidden="true">📊</span></button>';
    html += '<button type="button" class="poweruser-nav__btn" data-section="payment" title="Record Payment" aria-label="Record Payment"><span class="poweruser-nav__icon" aria-hidden="true">💰</span></button>';
    html += '</nav>';
    html += '<div class="poweruser-main-wrap">';
    html += '<section id="poweruser-review" class="poweruser-section poweruser-section--active" data-section="bills">';
    html += '<div class="poweruser-add-bar">' +
      '<button type="button" class="poweruser-add-bill" id="poweruser-add-bill" title="Upload new bill" aria-label="Upload new bill">+</button>' +
      '<button type="button" class="poweruser-add-bill poweruser-add-bill--narrow" id="poweruser-add-bill-alt" title="Upload with alternate Gemini model" aria-label="Upload with alternate AI model">++</button>' +
      '</div>';
    html += '<div id="poweruser-upload-inline" class="poweruser-upload-inline"></div>';
    html += '<div id="poweruser-review-list"></div>';
    html += '</section>';
    html += '<section id="poweruser-transactions" class="poweruser-section" data-section="transactions">';
    html += '<div id="poweruser-transactions-mount"></div>';
    html += '</section>';
    html += '<section id="poweruser-financial" class="poweruser-section" data-section="financial">';
    html += '<div id="poweruser-financial-mount"></div>';
    html += '</section>';
    html += '<section id="poweruser-payment" class="poweruser-section" data-section="payment">';
    html += '<div id="poweruser-payment-mount"></div>';
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

    var navBtns = rootEl.querySelectorAll('.poweruser-nav__btn');
    for (var ni = 0; ni < navBtns.length; ni++) {
      navBtns[ni].addEventListener('click', function () {
        var section = this.getAttribute('data-section');
        switchSection(section);
      });
    }
  }

  function switchSection(section) {
    pageState.section = section || 'bills';
    syncSectionUrl(pageState.section);
    var navBtns = rootEl.querySelectorAll('.poweruser-nav__btn');
    for (var i = 0; i < navBtns.length; i++) {
      var btn = navBtns[i];
      btn.classList.toggle('poweruser-nav__btn--active', btn.getAttribute('data-section') === pageState.section);
    }
    var sections = rootEl.querySelectorAll('.poweruser-section');
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      sec.classList.toggle('poweruser-section--active', sec.getAttribute('data-section') === pageState.section);
    }
    if (pageState.section === 'transactions') renderTransactions();
    else if (pageState.section === 'financial') renderFinancialOverview();
    else if (pageState.section === 'payment') renderRecordPayment();
  }

  function renderTransactions() {
    var mount = document.getElementById('poweruser-transactions-mount');
    if (!mount) return;
    mount.innerHTML = '<p class="poweruser-loading">Loading transactions…</p>';
    if (typeof ClaimsAPI === 'undefined' || !ClaimsAPI.getAllTransactions) {
      mount.innerHTML = '<p class="poweruser-error">Transactions API not available.</p>';
      return;
    }
    ClaimsAPI.getAllTransactions()
      .then(function (data) {
        var txns = (data && data.transactions) ? data.transactions : [];
        if (txns.length === 0) {
          mount.innerHTML = '<p class="poweruser-placeholder">No bills or payments yet.</p>';
          return;
        }
        var html = '<div class="poweruser-transactions">';
        html += '<h2 class="poweruser-transactions__title">All transactions</h2>';
        html += '<ul class="poweruser-transactions-list">';
        var prevDate = null;
        for (var i = 0; i < txns.length; i++) {
          var t = txns[i];
          var showDate = t.date !== prevDate;
          prevDate = t.date;
          var dateLabel = typeof ClaimsFormatters !== 'undefined' && ClaimsFormatters.formatBillDateDisplay
            ? ClaimsFormatters.formatBillDateDisplay(t.date) : t.date;
          var isBill = t.type === 'bill';
          var isOpening = t.type === 'opening';
          var isPayment = t.type === 'payment';
          var isClickable = isBill || isPayment;
          var amountClass = isBill
            ? 'poweruser-transactions-list__amount--bill'
            : (isOpening ? 'poweruser-transactions-list__amount--opening' : 'poweruser-transactions-list__amount--payment');
          var desc = t.description || '';
          var foodItems = isBill ? (t.foodItems || '') : '';
          var itemClass = 'poweruser-transactions-list__item';
          if (isBill) itemClass += ' poweruser-transactions-list__item--bill';
          else if (!isOpening) itemClass += ' poweruser-transactions-list__item--payment';
          if (isClickable) itemClass += ' poweruser-transactions-list__item--clickable';
          if (foodItems) itemClass += ' poweruser-transactions-list__item--has-detail';
          var txnKey = isClickable
            ? buildTransactionKey(t.type, t.billDate, t.date, t.userName, t.paymentId)
            : '';
          html += '<li>';
          html += '<div class="' + itemClass + '"';
          if (isClickable) {
            html += ' role="button" tabindex="0"';
            html += ' data-txn-key="' + escapeHtml(txnKey) + '"';
            html += ' data-txn-type="' + escapeHtml(t.type) + '"';
            html += ' data-txn-date="' + escapeHtml(t.date || '') + '"';
            html += ' data-txn-user="' + escapeHtml(t.userName || '') + '"';
            if (t.billDate) html += ' data-txn-bill-date="' + escapeHtml(t.billDate) + '"';
            if (t.paymentId != null) html += ' data-txn-payment-id="' + escapeHtml(String(t.paymentId)) + '"';
            if (t.amount != null) html += ' data-txn-amount="' + escapeHtml(String(t.amount)) + '"';
          }
          html += '>';
          html += '<div class="poweruser-transactions-list__main">';
          if (showDate) {
            html += '<span class="poweruser-transactions-list__date">' + escapeHtml(dateLabel) + '</span>';
          } else {
            html += '<span class="poweruser-transactions-list__date poweruser-transactions-list__date--repeat"></span>';
          }
          html += '<span class="poweruser-transactions-list__desc">' + escapeHtml(desc) + '</span>';
          if (foodItems) {
            html += '<span class="poweruser-transactions-list__detail" title="' + escapeHtml(foodItems) + '">' + escapeHtml(foodItems) + '</span>';
          }
          html += '<span class="poweruser-transactions-list__amount ' + amountClass + '">' + formatMoney(t.amount) + '</span>';
          html += '</div>';
          html += '</div>';
          html += '</li>';
        }
        html += '</ul></div>';
        mount.innerHTML = html;

        var clickables = mount.querySelectorAll('.poweruser-transactions-list__item--clickable');
        for (var ci = 0; ci < clickables.length; ci++) {
          clickables[ci].addEventListener('click', onTransactionLineClick);
          clickables[ci].addEventListener('keydown', onTransactionLineKeydown);
        }
        restoreTransactionsView(mount);
      })
      .catch(function (err) {
        mount.innerHTML = '<p class="poweruser-error">' + escapeHtml(err.message || 'Failed to load transactions') + '</p>';
      });
  }

  function buildClaimsPageUrl(date, userName) {
    var url = new URL('index.html', window.location.href);
    url.searchParams.set('date', date);
    url.searchParams.set('user', userName);
    return url.pathname + url.search;
  }

  function onTransactionLineClick() {
    var type = this.getAttribute('data-txn-type');
    if (type === 'bill') {
      var billDate = this.getAttribute('data-txn-bill-date') || this.getAttribute('data-txn-date');
      var userName = this.getAttribute('data-txn-user');
      if (!billDate || !userName) return;
      var txnKey = this.getAttribute('data-txn-key') || buildTransactionKey('bill', billDate, null, userName);
      saveReturnState(txnKey);
      window.location.href = buildClaimsPageUrl(billDate, userName);
      return;
    }
    if (type === 'payment') {
      var paymentId = this.getAttribute('data-txn-payment-id');
      if (!paymentId) return;
      openPaymentEditModal({
        paymentId: parseInt(paymentId, 10),
        userName: this.getAttribute('data-txn-user') || '',
        paymentDate: this.getAttribute('data-txn-date') || '',
        amount: parseFloat(this.getAttribute('data-txn-amount') || '0')
      });
    }
  }

  function onTransactionLineKeydown(e) {
    if (!e || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    onTransactionLineClick.call(this);
  }

  function openPaymentEditModal(payment) {
    if (!payment || !payment.paymentId) return;
    var overlay = document.createElement('div');
    overlay.className = 'poweruser-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Edit payment');

    var amountVal = payment.amount != null && !isNaN(payment.amount)
      ? Math.abs(payment.amount).toFixed(2) : '';

    var modal = document.createElement('div');
    modal.className = 'poweruser-modal poweruser-modal--payment-edit';
    modal.innerHTML =
      '<h3 class="poweruser-modal__title">Edit payment</h3>' +
      '<form class="payment-record__form payment-record__form--modal" id="payment-edit-form">' +
      '<p class="payment-record__summary"><span class="payment-record__label">Name</span> <strong>' + escapeHtml(payment.userName) + '</strong></p>' +
      '<label class="payment-record__field"><span class="payment-record__label">Payment date</span>' +
      '<input type="date" class="payment-record__input" id="payment-edit-date" value="' + escapeHtml(payment.paymentDate || todayIsoDate()) + '" required></label>' +
      '<label class="payment-record__field"><span class="payment-record__label">Amount paid</span>' +
      '<input type="number" class="payment-record__input payment-record__input--amount" id="payment-edit-amount" ' +
      'inputmode="decimal" step="0.01" min="0.01" value="' + escapeHtml(amountVal) + '" required></label>' +
      '<p class="payment-record__status" id="payment-edit-status" aria-live="polite"></p>' +
      '<div class="poweruser-modal__actions poweruser-modal__actions--payment-edit">' +
      '<button type="button" class="poweruser-modal__cancel" id="payment-edit-cancel">Cancel</button>' +
      '<button type="button" class="payment-record__delete" id="payment-edit-delete">Delete</button>' +
      '<button type="submit" class="payment-record__submit" id="payment-edit-save">Save changes</button>' +
      '</div></form>';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function closeModal() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    modal.querySelector('#payment-edit-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    var amountInput = modal.querySelector('#payment-edit-amount');
    if (amountInput) {
      amountInput.addEventListener('focus', function () { this.select(); });
    }

    modal.querySelector('#payment-edit-delete').addEventListener('click', function () {
      if (!confirm('Delete this payment?')) return;
      var statusEl = modal.querySelector('#payment-edit-status');
      var deleteBtn = this;
      var saveBtn = modal.querySelector('#payment-edit-save');
      deleteBtn.disabled = true;
      if (saveBtn) saveBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'Deleting…';
      ClaimsAPI.deletePayment({ id: payment.paymentId })
        .then(function () {
          closeModal();
          renderTransactions();
          if (pageState.section === 'financial') renderFinancialOverview();
          if (pageState.section === 'payment') renderRecordPayment();
        })
        .catch(function (err) {
          if (statusEl) statusEl.textContent = err.message || 'Failed to delete payment.';
          deleteBtn.disabled = false;
          if (saveBtn) saveBtn.disabled = false;
        });
    });

    modal.querySelector('#payment-edit-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var dateEl = modal.querySelector('#payment-edit-date');
      var amountEl = modal.querySelector('#payment-edit-amount');
      var statusEl = modal.querySelector('#payment-edit-status');
      var saveBtn = modal.querySelector('#payment-edit-save');
      var deleteBtn = modal.querySelector('#payment-edit-delete');
      if (!dateEl || !amountEl) return;
      var paymentDate = dateEl.value;
      var amount = parseFloat(amountEl.value);
      if (!paymentDate || isNaN(amount) || amount <= 0) {
        if (statusEl) statusEl.textContent = 'Enter a valid date and amount.';
        return;
      }
      if (saveBtn) saveBtn.disabled = true;
      if (deleteBtn) deleteBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'Saving…';
      ClaimsAPI.updatePayment({ id: payment.paymentId, paymentDate: paymentDate, amount: amount })
        .then(function () {
          closeModal();
          renderTransactions();
          if (pageState.section === 'financial') renderFinancialOverview();
          if (pageState.section === 'payment') renderRecordPayment();
        })
        .catch(function (err) {
          if (statusEl) statusEl.textContent = err.message || 'Failed to update payment.';
          if (saveBtn) saveBtn.disabled = false;
          if (deleteBtn) deleteBtn.disabled = false;
        });
    });
  }

  function formatMoney(val) {
    if (val == null || isNaN(val)) return '—';
    var n = parseFloat(val);
    var prefix = n < 0 ? '-€' : '€';
    return prefix + Math.abs(n).toFixed(2);
  }

  function todayIsoDate() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function formatMoneyOptional(val) {
    if (val == null || val === '') return '';
    return formatMoney(val);
  }

  /** Largest |owed| among data rows (for traffic-light scaling). */
  function getMaxAbsOwed(rows) {
    var max = 0;
    for (var i = 0; i < rows.length; i++) {
      var owed = rows[i].owed;
      if (owed == null || owed === '') continue;
      var n = parseFloat(owed);
      if (!isNaN(n)) max = Math.max(max, Math.abs(n));
    }
    return max;
  }

  /** Traffic-light class for Owed cell: negative green, zero neutral, positive red. */
  function getOwedTrafficClass(owed, maxAbsOwed) {
    if (owed == null || owed === '') return '';
    var n = parseFloat(owed);
    if (isNaN(n) || maxAbsOwed <= 0 || Math.abs(n) < 0.005) {
      return ' financial-table__amt--owed-neutral';
    }
    var ratio = Math.min(1, Math.abs(n) / maxAbsOwed);
    var level = ratio > 0.66 ? '3' : (ratio > 0.33 ? '2' : '1');
    if (n < 0) return ' financial-table__amt--owed-credit-' + level;
    return ' financial-table__amt--owed-debit-' + level;
  }

  function shareFinancialOverviewImage(btn, billDate) {
    if (typeof html2canvas !== 'function') {
      alert('Image capture is not available. Check your network connection and reload.');
      return;
    }
    var overview = document.querySelector('.financial-overview');
    if (!overview || !btn) return;

    var shareBtn = btn;
    var tableWrap = overview.querySelector('.financial-table-wrap');
    var label = shareBtn.textContent;
    shareBtn.disabled = true;
    shareBtn.textContent = 'Creating image…';

    var prevWrapOverflow = tableWrap ? tableWrap.style.overflow : '';
    var prevWrapWidth = tableWrap ? tableWrap.style.width : '';
    var prevOverviewWidth = overview.style.width;
    var prevOverviewMaxWidth = overview.style.maxWidth;
    var prevBtnDisplay = shareBtn.style.display;

    if (tableWrap) {
      tableWrap.style.overflow = 'visible';
      tableWrap.style.width = tableWrap.scrollWidth + 'px';
    }
    overview.style.width = overview.scrollWidth + 'px';
    overview.style.maxWidth = 'none';
    shareBtn.style.display = 'none';

    html2canvas(overview, {
      scale: 2,
      backgroundColor: '#0f172a',
      logging: false,
      useCORS: true
    })
      .then(function (canvas) {
        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) {
            if (!blob) {
              reject(new Error('Could not create image'));
              return;
            }
            resolve(blob);
          }, 'image/png');
        });
      })
      .then(function (blob) {
        var filename = 'financial-' + (billDate || 'overview') + '.png';
        var file = new File([blob], filename, { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], title: 'Financial overview' });
        }
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        alert(err && err.message ? err.message : 'Failed to create image');
      })
      .finally(function () {
        if (tableWrap) {
          tableWrap.style.overflow = prevWrapOverflow;
          tableWrap.style.width = prevWrapWidth;
        }
        overview.style.width = prevOverviewWidth;
        overview.style.maxWidth = prevOverviewMaxWidth;
        shareBtn.style.display = prevBtnDisplay;
        shareBtn.disabled = false;
        shareBtn.textContent = label;
      });
  }

  function renderFinancialOverview() {
    var mount = document.getElementById('poweruser-financial-mount');
    if (!mount) return;
    mount.innerHTML = '<p class="poweruser-loading">Loading financial overview…</p>';
    if (typeof ClaimsAPI === 'undefined' || !ClaimsAPI.getFinancialOverview) {
      mount.innerHTML = '<p class="poweruser-error">Financial API not available.</p>';
      return;
    }
    ClaimsAPI.getFinancialOverview(pageState.financialBillDate)
      .then(function (data) {
        if (!data || !data.billDate) {
          mount.innerHTML = '<p class="poweruser-placeholder">No settled bills yet. Upload and close a bill to see the financial overview.</p>';
          return;
        }
        pageState.financialBillDate = data.billDate;
        var dateLabel = typeof ClaimsFormatters !== 'undefined' && ClaimsFormatters.formatBillDateDisplay
          ? ClaimsFormatters.formatBillDateDisplay(data.billDate) : data.billDate;
        var shareLabel = (typeof navigator !== 'undefined' && navigator.share) ? 'Share image' : 'Save image';
        var canGoPrev = !!data.prevBillDate;
        var canGoNext = !!data.nextBillDate && data.isLatest !== true;
        var html = '<div class="financial-overview" data-bill-date="' + escapeHtml(data.billDate) + '">';
        html += '<div class="financial-overview__header">';
        html += '<h2 class="financial-overview__title">Classic View · ' + escapeHtml(dateLabel) + '</h2>';
        html += '<div class="financial-overview__header-actions">';
        html += '<button type="button" class="financial-overview__share-btn" id="financial-overview-share-btn">' + shareLabel + '</button>';
        html += '<div class="financial-overview__nav">';
        html += '<button type="button" class="financial-overview__nav-btn" id="financial-overview-prev-btn" title="Previous bill"' + (canGoPrev ? '' : ' disabled') + ' aria-label="Previous bill">';
        html += '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
        html += '</button>';
        html += '<button type="button" class="financial-overview__nav-btn" id="financial-overview-next-btn" title="Next bill"' + (canGoNext ? '' : ' disabled') + ' aria-label="Next bill">';
        html += '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
        html += '</button>';
        html += '</div></div></div>';
        html += '<div class="financial-table-wrap"><table class="financial-table">';
        html += '<thead><tr>';
        html += '<th class="financial-table__name">Name</th>';
        html += '<th colspan="2">Food</th><th colspan="2">Extras</th><th colspan="2">Drinks</th>';
        html += '<th>Total</th><th>Due (incl tip)</th><th>c/f</th><th>Paid</th><th>Owed</th>';
        html += '</tr></thead><tbody>';
        var rows = data.rows || [];
        var maxAbsOwed = getMaxAbsOwed(rows);
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var rowClass = row.guestRow ? ' financial-table__row--guest' : '';
          var owedClass = 'financial-table__amt financial-table__amt--owed' + getOwedTrafficClass(row.owed, maxAbsOwed);
          html += '<tr class="financial-table__row' + rowClass + '">';
          html += '<td class="financial-table__name">' + escapeHtml(row.userName) + '</td>';
          html += '<td class="financial-table__items">' + escapeHtml(row.food.items || '') + '</td>';
          html += '<td class="financial-table__amt">' + (row.food.amount ? formatMoney(row.food.amount) : '') + '</td>';
          html += '<td class="financial-table__items">' + escapeHtml(row.extras.items || '') + '</td>';
          html += '<td class="financial-table__amt">' + (row.extras.amount ? formatMoney(row.extras.amount) : '') + '</td>';
          html += '<td class="financial-table__items">' + escapeHtml(row.drinks.items || '') + '</td>';
          html += '<td class="financial-table__amt">' + (row.drinks.amount ? formatMoney(row.drinks.amount) : '') + '</td>';
          html += '<td class="financial-table__amt">' + (row.total ? formatMoney(row.total) : '') + '</td>';
          html += '<td class="financial-table__amt">' + (row.dueWithTip ? formatMoney(row.dueWithTip) : '') + '</td>';
          html += '<td class="financial-table__amt">' + formatMoneyOptional(row.carryForward) + '</td>';
          html += '<td class="financial-table__amt">' + (row.paid ? formatMoney(row.paid) : '') + '</td>';
          html += '<td class="' + owedClass + '">' + formatMoneyOptional(row.owed) + '</td>';
          html += '</tr>';
        }
        var footer = data.footer || {};
        html += '<tr class="financial-table__footer">';
        html += '<td></td>';
        html += '<td></td><td class="financial-table__amt">' + formatMoney(footer.foodTotal) + '</td>';
        html += '<td></td><td class="financial-table__amt">' + formatMoney(footer.extrasTotal) + '</td>';
        html += '<td></td><td class="financial-table__amt">' + formatMoney(footer.drinksTotal) + '</td>';
        html += '<td class="financial-table__amt">' + formatMoney(footer.billTotal) + '</td>';
        html += '<td class="financial-table__amt">' + formatMoney(footer.totalDueWithTip) + '</td>';
        html += '<td class="financial-table__amt">' + formatMoney(footer.carryForwardTotal) + '</td>';
        html += '<td class="financial-table__amt">' + formatMoney(footer.paidTotal) + '</td>';
        html += '<td class="financial-table__amt">' + formatMoney(footer.owedTotal) + '</td>';
        html += '</tr>';
        html += '</tbody></table></div>';
        html += '<div class="financial-overview__meta">';
        html += '<p><span class="financial-overview__meta-label">Paid by JP</span> ' + formatMoney(footer.paidByJP) + '</p>';
        html += '<p><span class="financial-overview__meta-label">Tip rate</span> ' + (footer.tipRate != null ? (footer.tipRate * 100).toFixed(2) + '%' : '—') + '</p>';
        html += '<p><span class="financial-overview__meta-label">Tip amount</span> ' + formatMoney(footer.tipAmount) + '</p>';
        html += '</div></div>';
        mount.innerHTML = html;
        var shareBtn = document.getElementById('financial-overview-share-btn');
        if (shareBtn) {
          shareBtn.addEventListener('click', function () {
            shareFinancialOverviewImage(shareBtn, data.billDate);
          });
        }
        var prevBtn = document.getElementById('financial-overview-prev-btn');
        if (prevBtn && data.prevBillDate) {
          prevBtn.addEventListener('click', function () {
            pageState.financialBillDate = data.prevBillDate;
            renderFinancialOverview();
          });
        }
        var nextBtn = document.getElementById('financial-overview-next-btn');
        if (nextBtn && data.nextBillDate && data.isLatest !== true) {
          nextBtn.addEventListener('click', function () {
            pageState.financialBillDate = data.nextBillDate;
            renderFinancialOverview();
          });
        }
      })
      .catch(function (err) {
        mount.innerHTML = '<p class="poweruser-error">' + escapeHtml(err.message || 'Failed to load financial overview') + '</p>';
      });
  }

  function renderRecordPayment() {
    var mount = document.getElementById('poweruser-payment-mount');
    if (!mount) return;
    mount.innerHTML = '<p class="poweruser-loading">Loading…</p>';
    if (typeof ClaimsAPI === 'undefined' || !ClaimsAPI.getUserBalanceInfo) {
      mount.innerHTML = '<p class="poweruser-error">Payment API not available.</p>';
      return;
    }
    ClaimsAPI.getUserBalanceInfo()
      .then(function (data) {
        pageState.paymentBalanceInfo = data;
        renderRecordPaymentContent(mount, data);
      })
      .catch(function (err) {
        mount.innerHTML = '<p class="poweruser-error">' + escapeHtml(err.message || 'Failed to load') + '</p>';
      });
  }

  function renderRecordPaymentContent(mount, data) {
    var users = (data && data.users) ? data.users.slice() : [];
    users.sort(function (a, b) {
      return String(a.userName || '').localeCompare(String(b.userName || ''));
    });
    var html = '<div class="payment-record">';
    html += '<h2 class="payment-record__title">Record a payment</h2>';
    html += '<p class="payment-record__hint">Select a name to record a payment.</p>';
    html += '<div class="payment-record__names">';
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      var isActive = pageState.paymentSelectedUser === u.userName;
      var guestClass = u.isGuest ? ' payment-record__name-btn--guest' : '';
      html += '<button type="button" class="payment-record__name-btn' + guestClass + (isActive ? ' payment-record__name-btn--active' : '') + '" data-name="' + escapeHtml(u.userName) + '">';
      html += escapeHtml(u.userName);
      html += '<span class="payment-record__name-balance">' + formatMoney(u.balance) + '</span>';
      html += '</button>';
    }
    html += '</div>';
    html += '<div id="payment-record-form-mount"></div>';
    html += '</div>';
    mount.innerHTML = html;

    var nameBtns = mount.querySelectorAll('.payment-record__name-btn');
    for (var nb = 0; nb < nameBtns.length; nb++) {
      nameBtns[nb].addEventListener('click', function () {
        pageState.paymentSelectedUser = this.getAttribute('data-name');
        renderRecordPaymentContent(mount, data);
        renderPaymentForm(document.getElementById('payment-record-form-mount'), data);
      });
    }

    if (pageState.paymentSelectedUser) {
      renderPaymentForm(document.getElementById('payment-record-form-mount'), data);
    }
  }

  function renderPaymentForm(formMount, data) {
    if (!formMount || !pageState.paymentSelectedUser) return;
    var users = (data && data.users) ? data.users : [];
    var selected = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].userName === pageState.paymentSelectedUser) {
        selected = users[i];
        break;
      }
    }
    if (!selected) return;

    var balance = selected.balance != null ? parseFloat(selected.balance) : 0;
    var prefilled = isNaN(balance) ? '' : Math.abs(balance).toFixed(2);
    var latestBillLabel = selected.latestBillDate && typeof ClaimsFormatters !== 'undefined' && ClaimsFormatters.formatBillDateDisplay
      ? ClaimsFormatters.formatBillDateDisplay(selected.latestBillDate) : (selected.latestBillDate || '—');

    var html = '<form class="payment-record__form" id="payment-record-form">';
    html += '<h3 class="payment-record__form-title">Payment for ' + escapeHtml(selected.userName) + '</h3>';
    html += '<label class="payment-record__field"><span class="payment-record__label">Payment date</span>';
    html += '<input type="date" class="payment-record__input" id="payment-date" value="' + todayIsoDate() + '" required></label>';
    html += '<p class="payment-record__summary"><span class="payment-record__label">Latest bill amount</span> ';
    html += formatMoney(selected.latestBillDue) + (selected.latestBillDate ? ' · ' + escapeHtml(latestBillLabel) : '') + '</p>';
    html += '<p class="payment-record__summary"><span class="payment-record__label">Current balance</span> ';
    html += '<strong>' + formatMoney(selected.balance) + '</strong></p>';
    html += '<label class="payment-record__field"><span class="payment-record__label">Amount paid</span>';
    html += '<input type="number" class="payment-record__input payment-record__input--amount" id="payment-amount" ';
    html += 'inputmode="decimal" step="0.01" min="0.01" value="' + prefilled + '" required></label>';
    html += '<button type="submit" class="payment-record__submit" id="payment-submit-btn">Record payment</button>';
    html += '<p class="payment-record__status" id="payment-status" aria-live="polite"></p>';
    html += '</form>';
    formMount.innerHTML = html;

    var amountInput = document.getElementById('payment-amount');
    if (amountInput) {
      amountInput.addEventListener('focus', function () {
        this.select();
      });
    }

    var form = document.getElementById('payment-record-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        onRecordPaymentSubmit(selected.userName);
      });
    }
  }

  function onRecordPaymentSubmit(userName) {
    var dateEl = document.getElementById('payment-date');
    var amountEl = document.getElementById('payment-amount');
    var statusEl = document.getElementById('payment-status');
    var submitBtn = document.getElementById('payment-submit-btn');
    if (!dateEl || !amountEl) return;
    var paymentDate = dateEl.value;
    var amount = parseFloat(amountEl.value);
    if (!paymentDate || isNaN(amount) || amount <= 0) {
      if (statusEl) statusEl.textContent = 'Enter a valid date and amount.';
      return;
    }
    if (submitBtn) submitBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Saving…';
    ClaimsAPI.recordPayment({ userName: userName, paymentDate: paymentDate, amount: amount })
      .then(function () {
        if (statusEl) statusEl.textContent = 'Payment recorded.';
        pageState.paymentSelectedUser = userName;
        renderRecordPayment();
        if (pageState.section === 'financial') renderFinancialOverview();
        if (pageState.section === 'transactions') renderTransactions();
      })
      .catch(function (err) {
        if (statusEl) statusEl.textContent = err.message || 'Failed to record payment.';
        if (submitBtn) submitBtn.disabled = false;
      });
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

  /** Unclaimed slots grouped by product (same shape as buildByUserView entries). */
  function buildUnclaimedView(bill) {
    if (!bill || !bill.items) return null;
    var claimMap = typeof ClaimsState !== 'undefined' && ClaimsState.buildClaimMap
      ? ClaimsState.buildClaimMap(bill.claims) : {};
    var consolidated = buildConsolidatedItems(bill);
    var prods = {};
    for (var i = 0; i < consolidated.length; i++) {
      var g = consolidated[i];
      for (var j = 0; j < g.slots.length; j++) {
        var s = g.slots[j];
        var k = s.rowIndex + '_' + s.unitIndex;
        var name = (claimMap[k] || '').trim();
        if (name) continue;
        var key = g.description + '|' + g.unitPrice;
        if (!prods[key]) {
          prods[key] = { description: g.description, quantity: 0, unitPrice: g.unitPrice };
        }
        prods[key].quantity++;
      }
    }
    var items = [];
    var keys = Object.keys(prods);
    for (var pk = 0; pk < keys.length; pk++) {
      var p = prods[keys[pk]];
      items.push({
        description: p.description + (p.quantity > 1 ? ' x' + p.quantity : ''),
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        totalPrice: p.unitPrice * p.quantity
      });
    }
    if (items.length === 0) return null;
    var subtotal = items.reduce(function (s, it) { return s + (it.totalPrice || 0); }, 0);
    return { items: items, subtotal: subtotal };
  }

  function appendUserBlock(viewPanel, userName, items, billTotal, tipAmount, options) {
    options = options || {};
    var userTotal = items.reduce(function (s, it) { return s + (it.totalPrice || 0); }, 0);
    var userShare = billTotal > 0 ? userTotal / billTotal : 0;
    var userTip = tipAmount * userShare;
    var userTotalWithTip = userTotal + userTip;
    var userBlock = document.createElement('div');
    userBlock.className = 'poweruser-user-block' + (options.unclaimed ? ' poweruser-user-block--unclaimed' : '');
    var nameLine = document.createElement('div');
    nameLine.className = 'poweruser-user-name-line';
    var nameSpan = document.createElement('span');
    nameSpan.className = 'poweruser-user-name' + (options.unclaimed ? ' poweruser-user-name--unclaimed' : '');
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
    viewPanel.appendChild(userBlock);
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
          if (!confirm('Delete this bill? This will remove all bill items, metadata, and the stored bill image.')) return;
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
          var viewMode = getViewModeForBill(dateStr);

          var tabBar = document.createElement('div');
          tabBar.className = 'poweruser-view-tab-bar';
          tabBar.setAttribute('role', 'tablist');
          tabBar.setAttribute('aria-label', 'Bill view');

          var tabHeadings = document.createElement('div');
          tabHeadings.className = 'poweruser-view-tab-headings';

          var byUserTab = document.createElement('button');
          byUserTab.type = 'button';
          byUserTab.className = 'poweruser-view-tab' + (viewMode === 'byUser' ? ' poweruser-view-tab--active' : '');
          byUserTab.setAttribute('role', 'tab');
          byUserTab.setAttribute('aria-selected', viewMode === 'byUser' ? 'true' : 'false');
          byUserTab.id = 'poweruser-view-tab-byuser-' + dateStr;
          byUserTab.textContent = 'By User';
          byUserTab.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var d = this.closest('.poweruser-bill-block').getAttribute('data-date');
            if (getViewModeForBill(d) === 'byUser') return;
            setViewModeForBill(d, 'byUser');
            var list = document.getElementById('poweruser-bills-list');
            if (list && reviewState.billsData) renderBillsList(list, reviewState.billsData.bills);
          });

          var byItemTab = document.createElement('button');
          byItemTab.type = 'button';
          byItemTab.className = 'poweruser-view-tab' + (viewMode === 'byItem' ? ' poweruser-view-tab--active' : '');
          byItemTab.setAttribute('role', 'tab');
          byItemTab.setAttribute('aria-selected', viewMode === 'byItem' ? 'true' : 'false');
          byItemTab.id = 'poweruser-view-tab-byitem-' + dateStr;
          byItemTab.textContent = 'By Item';
          byItemTab.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var d = this.closest('.poweruser-bill-block').getAttribute('data-date');
            if (getViewModeForBill(d) === 'byItem') return;
            setViewModeForBill(d, 'byItem');
            var list = document.getElementById('poweruser-bills-list');
            if (list && reviewState.billsData) renderBillsList(list, reviewState.billsData.bills);
          });

          tabHeadings.appendChild(byUserTab);
          tabHeadings.appendChild(byItemTab);
          tabBar.appendChild(tabHeadings);
          body.appendChild(tabBar);

          var viewPanel = document.createElement('div');
          viewPanel.className = 'poweruser-view-panel poweruser-view-panel--' + (viewMode === 'byUser' ? 'byuser' : 'byitem');
          viewPanel.setAttribute('role', 'tabpanel');
          viewPanel.setAttribute('aria-labelledby', viewMode === 'byUser' ? byUserTab.id : byItemTab.id);

          if (viewMode === 'byItem') {
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
              viewPanel.appendChild(row);
            }
            var byItemSummary = document.createElement('div');
            byItemSummary.className = 'poweruser-bill-summary';
            byItemSummary.innerHTML = '<div class="poweruser-bill-summary-row"><span class="poweruser-bill-summary-label">Total:</span><span class="poweruser-bill-summary-value">€' + formatNum(billTotal) + '</span></div><div class="poweruser-bill-summary-row"><span class="poweruser-bill-summary-label">Tip:</span><span class="poweruser-bill-summary-value">€' + formatNum(tipAmount) + '</span></div><div class="poweruser-bill-summary-row"><span class="poweruser-bill-summary-label">Total Paid:</span><span class="poweruser-bill-summary-value">€' + formatNum(totalPaid != null ? totalPaid : billTotal + tipAmount) + '</span></div>';
            var billSummaryEl = byItemSummary;
          } else {
            var byUser = buildByUserView(fullBill);
            var users = Object.keys(byUser).sort();
            for (var u = 0; u < users.length; u++) {
              appendUserBlock(viewPanel, users[u], byUser[users[u]], billTotal, tipAmount);
            }
            var unclaimedView = buildUnclaimedView(fullBill);
            if (unclaimedView) {
              appendUserBlock(viewPanel, 'Unclaimed', unclaimedView.items, billTotal, tipAmount, { unclaimed: true });
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
          viewPanel.appendChild(summaryActionsWrap);
          body.appendChild(viewPanel);
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
    if (!billModelLabel) {
      billModelLabel = DEFAULT_BILL_MODEL_LABEL;
    }

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
    var modelName = flowOpts.modelLabel || DEFAULT_BILL_MODEL_LABEL;
    var initialHint = 'Step 1: Processing with ' + modelName + '…';

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
        }, 1000);
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
      var urlSection = getSectionFromUrl();
      var returnState = readReturnState();
      pageState.section = urlSection || (returnState && returnState.section) || 'bills';
      renderShell();
      if (pageState.section !== 'bills') {
        switchSection(pageState.section);
      } else {
        syncSectionUrl(pageState.section);
      }

      if (typeof window !== 'undefined') {
        window.addEventListener('pageshow', function (e) {
          if (!e.persisted) return;
          var section = getSectionFromUrl() || pageState.section;
          if (section !== pageState.section) {
            switchSection(section);
          } else if (section === 'transactions') {
            restoreTransactionsView(document.getElementById('poweruser-transactions-mount'));
          }
        });
      }
    }
  };
  global.PowerUserPage = PowerUserPage;
})(typeof window !== 'undefined' ? window : this);
