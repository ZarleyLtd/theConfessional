/**
 * Single source of truth for backend API URL.
 * Replace with your deployed Supabase Edge Function URL.
 * Must be on window so api.js (loaded after) can read it; top-level const is not on window in browsers.
 */
var CONFIRMATIONAL_CONFIG = {
  API_URL: 'https://yzyipxvlsoxfphwobfkb.supabase.co/functions/v1/theconfessional-api',
  BASE_PATH: ''  // e.g. '/theConfessional' if served from a subpath
};
