/**
 * Formatters for dates and currency.
 */

(function (global) {
  function formatDateISO(date) {
    if (!date) return '';
    var d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date;
    if (isNaN(d.getTime())) return '';
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }

  function formatCurrency(amount, currency) {
    currency = currency || 'EUR';
    return new Intl.NumberFormat('en-IE', { style: 'currency', currency: currency }).format(amount);
  }

  global.ClaimsFormatters = {
    formatDateISO: formatDateISO,
    formatCurrency: formatCurrency
  };
})(typeof window !== 'undefined' ? window : this);
