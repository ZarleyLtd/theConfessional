/**
 * API wrappers for Bar Bill Claims backend (Google Apps Script Web App).
 */

(function (global) {
  const CONFIG = global.CONFIRMATIONAL_CONFIG || {};
  const BASE = CONFIG.API_URL || '';

  function get(action, params) {
    const url = new URL(BASE);
    url.searchParams.set('action', action);
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(function (k) {
        if (params[k] != null) url.searchParams.set(k, params[k]);
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
    const payload = Object.assign({ action: action }, body);
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

  const api = {
    getDatesWithBills: function () { return get('dates'); },
    getBill: function (date) { return get('bill', { date: date }); },
    getClaims: function (date) { return get('claims', { date: date }); },
    getConfigNames: function () { return get('config'); },
    getProductIcons: function () { return get('productIcons'); },
    submitClaims: function (payload) { return post('submitClaims', payload); }
  };

  global.ClaimsAPI = api;
})(typeof window !== 'undefined' ? window : this);
