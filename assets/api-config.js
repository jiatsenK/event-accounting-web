(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EventApiConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PROD_API_URL = 'https://script.google.com/macros/s/AKfycbyLKDauNZi4zQzztda_agrJF84ILNSL6mXBsTe6e7DUx7dIbNN3GKwSWkDURQjYxkf_aA/exec';
  const TEST_API_URL = 'https://script.google.com/macros/s/AKfycbxE3UPQzCqkFPlAWA82CX8LhJBtLM0PbcCEIYkl-fDnmwjmTWJQ-RH81WMfO4Q-9So5/exec';
  const ENV_STORAGE_KEY = 'eventAccountingEnvironment';

  function readStoredEnvironment(win) {
    try { return win.localStorage.getItem(ENV_STORAGE_KEY) || ''; }
    catch (_) { return ''; }
  }

  function storeEnvironment(win, value) {
    try {
      if (value === 'test') win.localStorage.setItem(ENV_STORAGE_KEY, value);
      else win.localStorage.removeItem(ENV_STORAGE_KEY);
    } catch (_) { /* localStorage 被停用時仍可依當次網址切換 */ }
  }

  function resolveEnvironment(win) {
    if (!win || !win.location) return 'prod';
    const params = new URLSearchParams(win.location.search || '');
    if (params.has('env')) {
      const requested = params.get('env') === 'test' ? 'test' : 'prod';
      storeEnvironment(win, requested);
      return requested;
    }
    return readStoredEnvironment(win) === 'test' ? 'test' : 'prod';
  }

  function resolveApiUrl(win) {
    return resolveEnvironment(win) === 'test' ? TEST_API_URL : PROD_API_URL;
  }

  function tokenStorageKey(win) {
    return 'eventAccountingToken:' + resolveApiUrl(win);
  }

  function mountEnvironmentBanner(doc, win) {
    if (!doc || !win || resolveEnvironment(win) !== 'test') return null;
    const banner = doc.createElement('div');
    banner.className = 'test-environment-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = '<strong>⚠ 目前連測試後端</strong><button type="button">回正式後端</button>';
    banner.querySelector('button').addEventListener('click', () => {
      storeEnvironment(win, 'prod');
      const url = new URL(win.location.href);
      url.searchParams.set('env', 'prod');
      win.location.assign(url.toString());
    });
    doc.body.prepend(banner);
    return banner;
  }

  return { PROD_API_URL, TEST_API_URL, ENV_STORAGE_KEY, resolveEnvironment, resolveApiUrl, tokenStorageKey, mountEnvironmentBanner };
});
