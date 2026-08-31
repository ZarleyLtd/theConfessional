/**
 * Classic View financial overview table — shared by poweruser and claims statement.
 */
(function (global) {
  function escapeHtml(str) {
    if (str == null) return '';
    var s = String(str);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatMoney(val) {
    if (val == null || isNaN(val)) return '—';
    var n = parseFloat(val);
    var prefix = n < 0 ? '-€' : '€';
    return prefix + Math.abs(n).toFixed(2);
  }

  function formatMoneyOptional(val) {
    if (val == null || val === '') return '';
    return formatMoney(val);
  }

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

  function isHighlightedUser(rowName, highlightUserName) {
    if (!highlightUserName || !rowName) return false;
    return String(rowName).trim().toLowerCase() === String(highlightUserName).trim().toLowerCase();
  }

  function buildHtml(data, options) {
    options = options || {};
    var showShare = options.showShare !== false;
    var showNav = options.showNav !== false;
    var titlePrefix = options.titlePrefix || 'Classic View';
    var highlightUserName = options.highlightUserName || '';
    var dateLabel = typeof ClaimsFormatters !== 'undefined' && ClaimsFormatters.formatBillDateDisplay
      ? ClaimsFormatters.formatBillDateDisplay(data.billDate) : data.billDate;
    var shareLabel = (typeof navigator !== 'undefined' && navigator.share) ? 'Share image' : 'Save image';
    var canGoPrev = !!data.prevBillDate;
    var canGoNext = !!data.nextBillDate && data.isLatest !== true;

    var html = '<div class="financial-overview" data-bill-date="' + escapeHtml(data.billDate) + '">';
    html += '<div class="financial-overview__header">';
    html += '<h2 class="financial-overview__title">' + escapeHtml(titlePrefix) + ' · ' + escapeHtml(dateLabel) + '</h2>';
    if (showShare || showNav) {
      html += '<div class="financial-overview__header-actions">';
      if (showShare) {
        html += '<button type="button" class="financial-overview__share-btn" id="financial-overview-share-btn">' + shareLabel + '</button>';
      }
      if (showNav) {
        html += '<div class="financial-overview__nav">';
        html += '<button type="button" class="financial-overview__nav-btn" id="financial-overview-prev-btn" title="Previous bill"' + (canGoPrev ? '' : ' disabled') + ' aria-label="Previous bill">';
        html += '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
        html += '</button>';
        html += '<button type="button" class="financial-overview__nav-btn" id="financial-overview-next-btn" title="Next bill"' + (canGoNext ? '' : ' disabled') + ' aria-label="Next bill">';
        html += '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
        html += '</button>';
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="financial-table-wrap"><table class="financial-table">';
    html += '<thead><tr>';
    html += '<th class="financial-table__name">Name</th>';
    html += '<th colspan="2">Food</th><th colspan="2">Extras</th><th colspan="2">Drinks</th>';
    html += '<th class="financial-table__amt">Total</th><th class="financial-table__amt financial-table__hdr-wrap">Due<br><span class="financial-table__hdr-sub">(incl tip)</span></th><th class="financial-table__amt">c/f</th><th class="financial-table__amt">Paid</th><th class="financial-table__amt">Owed</th>';
    html += '</tr></thead><tbody>';
    var rows = data.rows || [];
    var maxAbsOwed = getMaxAbsOwed(rows);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var rowClass = row.guestRow ? ' financial-table__row--guest' : '';
      if (isHighlightedUser(row.userName, highlightUserName)) {
        rowClass += ' financial-table__row--highlighted';
      }
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
    var tipRateSuffix = footer.tipRate != null ? ' (' + (footer.tipRate * 100).toFixed(2) + '%)' : '';
    html += '<p><span class="financial-overview__meta-label">Tip amount</span> ' + formatMoney(footer.tipAmount) + tipRateSuffix + '</p>';
    html += '</div></div>';
    return html;
  }

  function bindEvents(mount, data, options) {
    options = options || {};
    if (!mount || !data) return;

    var shareBtn = mount.querySelector('#financial-overview-share-btn');
    if (shareBtn && options.showShare !== false) {
      shareBtn.addEventListener('click', function () {
        shareImage(shareBtn, data.billDate);
      });
    }

    var prevBtn = mount.querySelector('#financial-overview-prev-btn');
    if (prevBtn && data.prevBillDate && typeof options.onBillDateChange === 'function') {
      prevBtn.addEventListener('click', function () {
        options.onBillDateChange(data.prevBillDate);
      });
    }

    var nextBtn = mount.querySelector('#financial-overview-next-btn');
    if (nextBtn && data.nextBillDate && data.isLatest !== true && typeof options.onBillDateChange === 'function') {
      nextBtn.addEventListener('click', function () {
        options.onBillDateChange(data.nextBillDate);
      });
    }
  }

  function shareImage(btn, billDate) {
    if (typeof html2canvas !== 'function') {
      alert('Image capture is not available. Check your network connection and reload.');
      return;
    }
    var overview = btn && btn.closest ? btn.closest('.financial-overview') : document.querySelector('.financial-overview');
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

  function renderInto(mount, options) {
    options = options || {};
    if (!mount) return Promise.reject(new Error('Missing mount element'));
    if (typeof ClaimsAPI === 'undefined' || !ClaimsAPI.getFinancialOverview) {
      mount.innerHTML = '<p class="poweruser-error">Financial API not available.</p>';
      return Promise.resolve(null);
    }

    var loadingClass = options.loadingClass || 'poweruser-loading';
    var emptyClass = options.emptyClass || 'poweruser-placeholder';
    var errorClass = options.errorClass || 'poweruser-error';
    mount.innerHTML = '<p class="' + loadingClass + '">Loading financial overview…</p>';

    return ClaimsAPI.getFinancialOverview(options.billDate || null)
      .then(function (data) {
        if (!data || !data.billDate) {
          mount.innerHTML = '<p class="' + emptyClass + '">' + escapeHtml(options.emptyMessage || 'No settled bills yet.') + '</p>';
          return null;
        }
        mount.innerHTML = buildHtml(data, options);
        bindEvents(mount, data, options);
        return data;
      })
      .catch(function (err) {
        mount.innerHTML = '<p class="' + errorClass + '">' + escapeHtml(err.message || 'Failed to load financial overview') + '</p>';
        return null;
      });
  }

  global.FinancialOverview = {
    buildHtml: buildHtml,
    bindEvents: bindEvents,
    renderInto: renderInto,
    shareImage: shareImage,
    formatMoney: formatMoney,
    formatMoneyOptional: formatMoneyOptional
  };
})(typeof window !== 'undefined' ? window : this);
