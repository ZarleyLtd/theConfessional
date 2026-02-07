/**
 * API wrappers for Bar Bill Claims backend (Google Apps Script Web App).
 */

(function (global) {
  var CONFIG = global.CONFIRMATIONAL_CONFIG || {};
  var BASE = CONFIG.API_URL || '';

  function get(action, params) {
    var url = new URL(BASE);
    url.searchParams.set('action', action);
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(function (k) {
        var v = params[k];
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      });
    }
    return fetch(url.toString())
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.error) throw new Error(json.error);
        return json.data;
      });
  }

  function post(action, body) {
    var payload = Object.assign({ action: action }, body);
    return fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json.error) throw new Error(json.error);
        return json.data;
      });
  }

  var api = {
    getDatesWithBills: function () { return get('dates'); },
    getBill: function (date) { return get('bill', { date: date }); },
    getClaims: function (date) { return get('claims', { date: date }); },
    getConfigNames: function () { return get('config'); },
    getProductIcons: function () { return get('productIcons'); },
    getBillImage: function (date) { return get('getBillImage', { date: date }); },
    submitClaims: function (payload) { return post('submitClaims', payload); }
  };

  global.ClaimsAPI = api;
})(typeof window !== 'undefined' ? window : this);
