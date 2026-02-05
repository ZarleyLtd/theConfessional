/**
 * Single source of truth for Google Apps Script Web App URL.
 * Replace with your deployed Web App URL after deploying backend/code.gs.
 * Must be on window so api.js (loaded after) can read it; top-level const is not on window in browsers.
 */
var CONFIRMATIONAL_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzkYg-6uqb5ieg9YJYWSNViU6XlvMfzyqAgMPAm6mnBz272D07uCZ6ersLDDNgIeTfk2A/exec'
};
