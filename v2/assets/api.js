/* 活動工作台 v2：後端介面（只管怎麼呼叫，不管畫面、不管計算）。
 * 規格見 event-accounting/v2/SPEC.md 第 5 節：
 *   讀取 GET＋JSONP：bootstrap、activity、history、search
 *   寫入 POST（Content-Type: text/plain，內容是 JSON）：{ token, op, args, client_id }
 * 回傳一律 { ok, data, version } 或 { ok: false, error }。
 *
 * 後端網址來自 assets/config.js 的 window.V2_API_URL。
 * 存取碼由使用者在畫面上輸入一次，只放在這個分頁的 sessionStorage，不進網址、不進 repo。
 * 網址帶 ?mock=1 時，dev/mock-api.js 會用 V2Api.useTransport() 換成瀏覽器內的模擬後端。 */
(function (root) {
  'use strict';

  const TOKEN_KEY = 'v2.accessToken';
  const TIMEOUT_MS = 30000;
  let memoryToken = '';
  let transport = null;

  class ApiError extends Error {
    constructor(message, kind) {
      super(message);
      this.name = 'ApiError';
      this.kind = kind || 'server'; // server：後端說不行；network：沒連上
    }
  }

  function baseUrl() { return String(root.V2_API_URL || '').trim(); }
  function isConfigured() { return !!transport || !!baseUrl(); }
  function isMock() { return !!transport; }
  function useTransport(t) { transport = t; }

  function getToken() {
    try { return root.sessionStorage.getItem(TOKEN_KEY) || memoryToken; } catch (_) { return memoryToken; }
  }
  function setToken(token) {
    memoryToken = String(token || '').trim();
    try { root.sessionStorage.setItem(TOKEN_KEY, memoryToken); } catch (_) { /* 無痕或封鎖儲存時只留在記憶體 */ }
  }
  function clearToken() {
    memoryToken = '';
    try { root.sessionStorage.removeItem(TOKEN_KEY); } catch (_) { /* 同上 */ }
  }

  function clientId() {
    const rand = root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    return 'web-' + rand;
  }

  function unwrap(result) {
    if (!result || typeof result !== 'object') throw new ApiError('後端沒有回應正確的資料', 'server');
    if (!result.ok) throw new ApiError(result.error || '後端拒絕了這個請求', 'server');
    return result;
  }

  function jsonp(action, params) {
    return new Promise((resolve, reject) => {
      const callback = '__v2cb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const query = new URLSearchParams(Object.assign({ action, token: getToken(), callback }, params || {}));
      const script = document.createElement('script');
      let timer = null;
      const cleanup = () => { clearTimeout(timer); delete root[callback]; script.remove(); };
      root[callback] = result => { cleanup(); resolve(result); };
      script.onerror = () => { cleanup(); reject(new ApiError('連不上後端，請檢查網路後再試一次', 'network')); };
      timer = setTimeout(() => { cleanup(); reject(new ApiError('後端太久沒有回應，請再試一次', 'network')); }, TIMEOUT_MS);
      script.src = baseUrl() + (baseUrl().indexOf('?') === -1 ? '?' : '&') + query.toString();
      document.head.appendChild(script);
    });
  }

  function get(action, params) {
    if (transport) return transport.get(action, params || {}, getToken()).then(unwrap);
    if (!baseUrl()) return Promise.reject(new ApiError('還沒設定後端網址（assets/config.js 的 V2_API_URL）', 'config'));
    return jsonp(action, params).then(unwrap);
  }

  function postOnce(body) {
    if (transport) return transport.post(body);
    return fetch(baseUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
      .then(res => res.json(), () => { throw new ApiError('連不上後端，請檢查網路後再試一次', 'network'); })
      .catch(err => { throw err instanceof ApiError ? err : new ApiError('後端回傳的資料看不懂', 'network'); });
  }

  /* 寫入：同一個 client_id 重送只會執行一次（SPEC 第 5 節），所以網路失敗時用同一個 client_id 再試一次。 */
  function write(op, args, id) {
    if (!isConfigured()) return Promise.reject(new ApiError('還沒設定後端網址', 'config'));
    const body = { token: getToken(), op, args: args || {}, client_id: id || clientId() };
    return postOnce(body)
      .catch(err => { if (err.kind === 'network') return postOnce(body); throw err; })
      .then(unwrap);
  }

  root.V2Api = {
    ApiError, isConfigured, isMock, useTransport, getToken, setToken, clearToken, clientId,
    bootstrap: () => get('bootstrap'),
    activity: id => get('activity', { id }),
    history: () => get('history'),
    search: q => get('search', { q }),
    write
  };
})(typeof window !== 'undefined' ? window : globalThis);
