/**
 * Claims page: modal (who + date) then products screen.
 */
(function (global) {
  var rootEl;
  var state = {
    enabledDates: [],
    selectedDate: null,
    userName: '',
    bill: null,
    claims: [],
    mySelection: [],
    claimMap: {},
    readyForProducts: false,
    displayOrderByRow: {}
  };

  function render() {
    if (!rootEl) return;
    rootEl.innerHTML = '<div class="claims-message claims-message--loading">Loading…</div>';
    ClaimsAPI.getDatesWithBills()
      .then(function (dates) {
        state.enabledDates = dates || [];
        renderShell();
      })
      .catch(function (err) {
        rootEl.innerHTML = '<div class="claims-message claims-message--error">Failed to load dates: ' + (err.message || err) + '</div>';
      });
  }

  function renderShell() {
    if (state.readyForProducts) {
      renderProductsView();
      return;
    }
    renderModalView();
  }

  function renderModalView() {
    var html = '<div id="claims-modal-overlay" class="claims-modal">';
    html += '<div class="claims-modal__panel">';
    html += '<h2 class="claims-modal__heading">Who is claiming?</h2>';
    html += '<div id="claims-modal-name-mount"></div>';
    html += '<h2 class="claims-modal__heading">Select date</h2>';
    html += '<div id="claims-modal-calendar-mount"></div>';
    html += '</div></div>';
    rootEl.innerHTML = html;
    NameCombobox.mount(document.getElementById('claims-modal-name-mount'), {
      onSelect: function (name) {
        state.userName = name;
        if (state.selectedDate) onModalContinue();
      }
    });
    CalendarComponent.mount(document.getElementById('claims-modal-calendar-mount'), {
      enabledDates: state.enabledDates,
      selectedDate: state.selectedDate,
      onSelect: function (date) {
        state.selectedDate = date;
        if (state.userName) onModalContinue();
      }
    });
  }

  function onModalContinue() {
    if (!state.userName || !state.selectedDate) return;
    Promise.all([
      ClaimsAPI.getBill(state.selectedDate),
      ClaimsAPI.getClaims(state.selectedDate)
    ]).then(function (results) {
      state.bill = results[0];
      state.claims = results[1] || [];
      state.claimMap = ClaimsState.buildClaimMap(state.claims);
      state.mySelection = (state.claims || []).filter(function (c) {
        return String(c.userName || '') === String(state.userName);
      }).map(function (c) { return { rowIndex: c.rowIndex, unitIndex: c.unitIndex }; });
      state.displayOrderByRow = {};
      state.readyForProducts = true;
      renderShell();
    }).catch(function (err) {
      console.error(err);
      alert('Failed to load bill: ' + (err.message || err));
    });
  }

  function renderProductsView() {
    var dateLabel = state.selectedDate || '';
    if (state.selectedDate) {
      var parts = state.selectedDate.split('-');
      if (parts.length === 3) {
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        dateLabel = parseInt(parts[2], 10) + ' ' + (months[parseInt(parts[1], 10) - 1] || '') + ' ' + parts[0];
      }
    }
    var html = '<div class="claims-products-view">';
    html += '<p class="claims-products-intro">Claiming as <strong>' + (state.userName || '') + '</strong> · ' + dateLabel + '</p>';
    html += '<div id="claims-bill-mount"></div>';
    html += '<div id="claims-summary-mount"></div>';
    html += '<button id="claims-submit-btn" type="button" class="claims-submit-btn">Submit my claims</button>';
    html += '</div>';
    rootEl.innerHTML = html;
    document.getElementById('claims-submit-btn').addEventListener('click', onSubmit);
    renderBill();
    var summaryMount = document.getElementById('claims-summary-mount');
    if (typeof window.Summary !== 'undefined' && window.Summary.render && summaryMount) {
      window.Summary.render(summaryMount, state.bill, state.claims);
    }
  }

  function onDateSelect(date) {
    state.selectedDate = date;
    state.bill = null;
    state.claims = [];
    state.mySelection = [];
    state.claimMap = {};
    if (!state.readyForProducts) {
      updateModalContinue();
      return;
    }
    showBillArea(false);
    if (!date) return;
    Promise.all([
      ClaimsAPI.getBill(date),
      ClaimsAPI.getClaims(date)
    ]).then(function (results) {
      state.bill = results[0];
      state.claims = results[1] || [];
      state.claimMap = ClaimsState.buildClaimMap(state.claims);
      state.mySelection = (state.claims || []).filter(function (c) {
        return String(c.userName || '') === String(state.userName);
      }).map(function (c) { return { rowIndex: c.rowIndex, unitIndex: c.unitIndex }; });
      state.displayOrderByRow = {};
      renderBill();
      showBillArea(true);
    }).catch(function (err) {
      console.error(err);
      if (!state.bill) state.bill = { items: [] };
      renderBill();
      showBillArea(true);
    });
  }

  function showBillArea(show) {
    var billMount = document.getElementById('claims-bill-mount');
    var summaryMount = document.getElementById('claims-summary-mount');
    var submitBtn = document.getElementById('claims-submit-btn');
    if (billMount) billMount.classList.toggle('hidden', !show);
    if (summaryMount) summaryMount.classList.toggle('hidden', !show);
    if (submitBtn) submitBtn.classList.toggle('hidden', !show);
  }

  function renderBill() {
    var mount = document.getElementById('claims-bill-mount');
    if (!mount) return;
    var bill = state.bill || {};
    var items = bill.items || [];
    mount.innerHTML = '';
    var descLabel = document.createElement('p');
    descLabel.id = 'claims-descriptive-label';
    descLabel.className = 'claims-descriptive-label';
    descLabel.textContent = 'Your selection: (none)';
    mount.appendChild(descLabel);
    state.displayOrderByRow = state.displayOrderByRow || {};
    var listEl = document.createElement('div');
    listEl.className = 'claims-products-list';
    mount.appendChild(listEl);
    var stateOrder = { 'claimed-by-me': 0, 'available': 1, 'claimed-by-other': 2 };
    items.forEach(function (item, idx) {
      var ri = item.rowIndex;
      var qty = item.quantity || 0;
      if (!state.displayOrderByRow[ri]) {
        var slotOrder = [];
        for (var u = 0; u < qty; u++) {
          var st = ClaimsState.getSlotState(state.claimMap, state.userName, ri, u);
          slotOrder.push({ unitIndex: u, state: st });
        }
        slotOrder.sort(function (a, b) { return stateOrder[a.state] - stateOrder[b.state]; });
        state.displayOrderByRow[ri] = slotOrder.map(function (x) { return x.unitIndex; });
      }
      var rowEl = ProductRow.render({
        rowIndex: item.rowIndex,
        category: item.category,
        description: item.description,
        quantity: item.quantity,
        currentUser: state.userName,
        claimMap: state.claimMap,
        mySelection: state.mySelection,
        displayOrder: state.displayOrderByRow[ri],
        onSlotClick: function (rowIndex, unitIndex) { onSlotClick(rowIndex, unitIndex); }
      });
      listEl.appendChild(rowEl);
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
      state.claims = state.claims.filter(function (c) { return !(c.rowIndex === rowIndex && c.unitIndex === unitIndex && c.userName === state.userName); });
    } else {
      state.mySelection.push({ rowIndex: rowIndex, unitIndex: unitIndex });
      state.claims = state.claims.concat([{ date: state.selectedDate, userName: state.userName, rowIndex: rowIndex, unitIndex: unitIndex }]);
    }
    state.claimMap = ClaimsState.buildClaimMap(state.claims);
    renderBill();
  }

  function updateDescriptiveLabel() {
    var el = document.getElementById('claims-descriptive-label');
    if (!el) return;
    var parts = [];
    var byDesc = {};
    (state.mySelection || []).forEach(function (s) {
      var item = (state.bill && state.bill.items) ? state.bill.items.find(function (i) { return i.rowIndex === s.rowIndex; }) : null;
      var desc = item ? item.description : 'Item';
      byDesc[desc] = (byDesc[desc] || 0) + 1;
    });
    Object.keys(byDesc).sort().forEach(function (d) {
      parts.push(byDesc[d] + ' ' + d);
    });
    el.textContent = 'Your selection: ' + (parts.length ? parts.join(', ') : '(none)');
  }

  function onSubmit() {
    if (!state.selectedDate || state.userName === '') return;
    var btn = document.getElementById('claims-submit-btn');
    if (btn) btn.disabled = true;
    ClaimsAPI.submitClaims({
      date: state.selectedDate,
      userName: state.userName,
      claims: state.mySelection
    }).then(function () {
      return ClaimsAPI.getClaims(state.selectedDate);
    }).then(function (claims) {
      state.claims = claims || [];
      state.claimMap = ClaimsState.buildClaimMap(state.claims);
      renderBill();
      if (btn) btn.disabled = false;
    }).catch(function (err) {
      alert('Submit failed: ' + (err.message || err));
      if (btn) btn.disabled = false;
    });
  }

  var ClaimsPage = {
    init: function (el) {
      rootEl = el;
      render();
    }
  };
  global.ClaimsPage = ClaimsPage;
})(typeof window !== 'undefined' ? window : this);
