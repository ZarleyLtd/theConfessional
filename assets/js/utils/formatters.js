/**
 * Formatters for dates and currency.
 */

(function (global) {
  function formatBillDateDisplay(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return parseInt(parts[2], 10) + ' ' + (months[parseInt(parts[1], 10) - 1] || '') + ' ' + parts[0];
  }

  function formatCurrency(amount, currency) {
    currency = currency || 'EUR';
    return new Intl.NumberFormat('en-IE', { style: 'currency', currency: currency }).format(amount);
  }

  global.ClaimsFormatters = {
    formatBillDateDisplay: formatBillDateDisplay,
    formatCurrency: formatCurrency
  };
})(typeof window !== 'undefined' ? window : this);
