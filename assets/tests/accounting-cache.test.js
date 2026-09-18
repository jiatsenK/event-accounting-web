'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function stubElement() {
  return {
    textContent: '', innerHTML: '', className: '', hidden: false, value: '',
    classList: { toggle() {}, add() {}, remove() {} },
    style: {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return stubElement(); },
    querySelectorAll() { return []; },
    focus() {}, scrollIntoView() {}, closest() { return null; },
    dataset: {}
  };
}

function setup(initialSearch) {
  const storage = new Map();
  const elements = new Map();
  const document = {
    querySelector(sel) {
      if (!elements.has(sel)) elements.set(sel, stubElement());
      return elements.get(sel);
    },
    querySelectorAll() { return []; },
    createElement() { return stubElement(); },
    body: { appendChild() {}, append() {} }
  };
  const context = {
    document,
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k)
    },
    location: { search: initialSearch || '', origin: 'https://example.test' },
    URLSearchParams,
    console,
    EventApiConfig: {
      resolveApiUrl: () => 'https://example.test/exec',
      tokenStorageKey: () => 'eventAccountingToken:test'
    },
    EventAccountingDomain: {
      summarizeDashboard: () => ({
        budget: 0, actualExpense: 0, budgetRemaining: 0,
        pettyCashAdvance: null, pettyCashUsed: null, pettyCashRemaining: null,
        budgetBreakdown: { items: [], unassignedTotal: 0 }, pendingAdvances: []
      }),
      expenseEditableFieldsEqual: () => false
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname + '/../app-core.js', 'utf8'), context);
  return { context, storage, elements };
}

test('帳務快取按活動隔離；損毀／localStorage 停用時安全降級', () => {
  const { context, storage } = setup();
  assert.equal(context.getCachedAccounting('a'), null);
  context.cacheAccounting('a', { activity: { name: '活動一' }, expenses: [] });
  assert.equal(context.getCachedAccounting('a').activity.name, '活動一');
  assert.equal(context.getCachedAccounting('b'), null);

  const key = [...storage.keys()][0];
  storage.set(key, '{bad');
  assert.equal(context.getCachedAccounting('a'), null);

  context.localStorage.getItem = () => { throw new Error('blocked'); };
  context.localStorage.setItem = () => { throw new Error('quota'); };
  assert.equal(context.getCachedAccounting('a'), null);
  assert.doesNotThrow(() => context.cacheAccounting('a', {}));
});

test('開頁先顯示快取、背景更新成功後就地覆蓋快取與畫面', async () => {
  const { context } = setup('?activity_id=a');
  context.cacheAccounting('a', { activity: { activity_id: 'a', name: '活動一' }, expenses: [], capabilities: [] });
  context.localStorage.setItem('eventAccountingToken:test', 'test-token');

  let resolveRead;
  context.apiRead = () => new Promise(resolve => { resolveRead = resolve; });
  context.loadConfig();

  assert.equal(context.document.querySelector('#activityName').textContent, '活動一');
  assert.match(context.document.querySelector('#status').textContent, /上次資料/);

  resolveRead({ activity: { activity_id: 'a', name: '活動二' }, expenses: [], capabilities: [] });
  await Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());

  assert.equal(context.document.querySelector('#activityName').textContent, '活動二');
  assert.equal(context.getCachedAccounting('a').activity.name, '活動二');
});

test('背景更新失敗時仍保留並回傳快取資料，同時提示已顯示舊資料', async () => {
  const { context } = setup();
  context.cacheAccounting('a', { activity: { activity_id: 'a', name: '活動一' }, expenses: [], capabilities: [] });
  context.localStorage.setItem('eventAccountingToken:test', 'test-token');
  context.apiRead = () => Promise.reject(new Error('連線逾時'));

  // refresh() 讀取 state.activityId；先用 loadConfig 依網址帶入 activity_id=a
  context.location.search = '?activity_id=a';
  context.loadConfig();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(context.document.querySelector('#activityName').textContent, '活動一');
  assert.match(context.document.querySelector('#status').textContent, /上次資料/);
  assert.equal(context.getCachedAccounting('a').activity.name, '活動一');
});

test('切換活動時，較舊的 refresh() 晚完成也不會覆蓋較新活動的畫面與快取', async () => {
  const { context } = setup('?activity_id=a');
  context.localStorage.setItem('eventAccountingToken:test', 'test-token');
  const resolvers = [];
  context.apiRead = () => new Promise(resolve => resolvers.push(resolve));

  context.loadConfig(); // 第一次 refresh()：activity_id=a
  context.location.search = '?activity_id=b';
  context.loadConfig(); // 模擬切換活動：activity_id=b

  resolvers[1]({ activity: { activity_id: 'b', name: '活動 B' }, expenses: [], capabilities: [] });
  await Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());
  assert.equal(context.document.querySelector('#activityName').textContent, '活動 B');

  resolvers[0]({ activity: { activity_id: 'a', name: '活動 A（過時回應）' }, expenses: [], capabilities: [] });
  await Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());
  assert.equal(context.document.querySelector('#activityName').textContent, '活動 B');
  assert.equal(context.getCachedAccounting('b').activity.name, '活動 B');
});

test('寫入成功（apiWrite 回傳最新資料）就地更新快取', () => {
  const { context } = setup();
  const activityId = 'midyear2026'; // state.activityId 預設值，未經 loadConfig 帶入網址參數
  context.render({ activity: { activity_id: activityId, name: '活動一' }, expenses: [], capabilities: [] });
  context.render({ activity: { activity_id: activityId, name: '活動一（已修改）' }, expenses: [{ expense_id: 'e1' }], capabilities: [] });
  assert.equal(context.getCachedAccounting(activityId).activity.name, '活動一（已修改）');
  assert.equal(context.getCachedAccounting(activityId).expenses.length, 1);
});
