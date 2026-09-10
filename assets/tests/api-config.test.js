'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../api-config.js');

function fakeWindow(search, stored) {
  const values = new Map(stored ? [[config.ENV_STORAGE_KEY, stored]] : []);
  return {
    location: { search, href: 'https://example.test/manage/' + search, assign(value) { this.assigned = value; } },
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    }
  };
}

test('預設與明確 prod 都解析為正式後端', () => {
  assert.equal(config.resolveApiUrl(fakeWindow('')), config.PROD_API_URL);
  const win = fakeWindow('?env=prod', 'test');
  assert.equal(config.resolveApiUrl(win), config.PROD_API_URL);
  assert.equal(win.localStorage.getItem(config.ENV_STORAGE_KEY), null);
});

test('明確 test 會持續使用測試後端', () => {
  const win = fakeWindow('?env=test');
  assert.equal(config.resolveApiUrl(win), config.TEST_API_URL);
  win.location.search = '';
  assert.equal(config.resolveApiUrl(win), config.TEST_API_URL);
});

test('token key 跟解析後的網址分開', () => {
  const prodKey = config.tokenStorageKey(fakeWindow('?env=prod'));
  const testKey = config.tokenStorageKey(fakeWindow('?env=test'));
  assert.notEqual(prodKey, testKey);
  assert.ok(prodKey.endsWith(config.PROD_API_URL));
  assert.ok(testKey.endsWith(config.TEST_API_URL));
});

test('測試模式顯示警示並可切回正式', () => {
  const win = fakeWindow('?env=test');
  let click;
  const button = { addEventListener(type, handler) { if (type === 'click') click = handler; } };
  const banner = {
    className: '', innerHTML: '',
    setAttribute() {},
    querySelector() { return button; }
  };
  const doc = { createElement() { return banner; }, body: { prepend(node) { this.child = node; } } };
  assert.equal(config.mountEnvironmentBanner(doc, win), banner);
  assert.match(banner.innerHTML, /目前連測試後端/);
  click();
  assert.match(win.location.assigned, /env=prod/);
  win.location.search = '';
  assert.equal(config.resolveEnvironment(win), 'prod');
});
