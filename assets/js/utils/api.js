/**
 * API wrappers for Bar Bill Claims backend (Supabase Edge Function).
 */

(function (global) {
  var CONFIG = global.CONFIRMATIONAL_CONFIG || {};
  var BASE = CONFIG.API_URL || '';

  function parseJsonResponse(res) {
    return res.json().then(function (json) {
      if (!res.ok) {
        var msg = json && (json.error || json.message || json.msg);
        throw new Error(msg || ('Request failed (' + res.status + ')'));
      }
      if (json && json.error) throw new Error(json.error);
      return json.data;
    });
  }

  function get(action, params) {
    var url = new URL(BASE);
    url.searchParams.set('action', action);
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(function (k) {
        var v = params[k];
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      });
    }
    return fetch(url.toString(), {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    }).then(parseJsonResponse);
  }

  function post(action, body) {
    var payload = Object.assign({ action: action }, body);
    return fetch(BASE, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'application/json' },
      body: JSON.stringify(payload)
    }).then(parseJsonResponse);
  }

  var api = {
    getDatesWithBills: function () { return get('dates'); },
    getBill: function (date) { return get('bill', { date: date }); },
    getClaims: function (date) { return get('claims', { date: date }); },
    getConfigNames: function () { return get('config'); },
    getProductIcons: function () { return get('productIcons'); },
    getBillImage: function (date) { return get('getBillImage', { date: date }); },
    submitClaims: function (payload) { return post('submitClaims', payload); },
    getAllBillsFull: function () { return get('getAllBillsFull'); },
    getBillsSummary: function () { return get('getBillsSummary'); },
    getBillFull: function (date) { return get('getBillFull', { date: date }); },
    analyzeBillImage: function (payload) { return post('analyzeBillImage', payload); },
    completeBillUpload: function (payload) { return post('completeBillUpload', payload); },
    updateBillTotalPaid: function (payload) { return post('updateBillTotalPaid', payload); },
    deleteBill: function (payload) { return post('deleteBill', payload); },
    setBillOpen: function (payload) { return post('setBillOpen', payload); },
    getFinancialOverview: function (billDate) {
      return get('getFinancialOverview', billDate ? { billDate: billDate } : undefined);
    },
    getUserBalanceInfo: function () { return get('getUserBalanceInfo'); },
    getAllTransactions: function () { return get('getAllTransactions'); },
    getUserStatement: function (userName) { return get('getUserStatement', { userName: userName }); },
    recordPayment: function (payload) { return post('recordPayment', payload); },
    updatePayment: function (payload) { return post('updatePayment', payload); },
    deletePayment: function (payload) { return post('deletePayment', payload); }
  };

  global.ClaimsAPI = api;
})(typeof window !== 'undefined' ? window : this);
