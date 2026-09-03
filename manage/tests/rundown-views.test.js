'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// 最小 DOM stub：只覆蓋 rundown-views 的 render/bind 會碰到的介面。
function stubElement() {
  return {
    innerHTML: '',
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return stubElement(); },
    querySelectorAll() { return []; },
    closest() { return stubElement(); }
  };
}

const container = stubElement();
container.ownerDocument = { body: stubElement() };

global.window = undefined;
const RundownCore = require('../../planning/rundown-core.js');
const PlanningCore = require('../../planning/core.js');
global.RundownCore = RundownCore;
global.PlanningCore = PlanningCore;

const views = require('../rundown-views.js');

test('模組匯出 mount 與 createController', () => {
  assert.equal(typeof views.rundown.mount, 'function');
  assert.equal(typeof views.createController, 'function');
});

test('載入示範資料後，總控版 sheet 帶出獎項圖文字串與未排標記', () => {
  const ctrl = views.createController(container, { activityId: 'yearend2025', activity: { name: '2025年度 忘年會' } });
  // 直接注入示範資料，避免走瀏覽器 JSONP
  ctrl.state.data = RundownCore.demoRundown();
  ctrl.state.source = 'demo';
  ctrl.state.mode = 'print';
  ctrl.state.printVersion = 'control';
  ctrl.render();
  assert.match(container.innerHTML, /四等獎 \$5,000 × 15名／彭玉明協理/);
  assert.match(container.innerHTML, /未排/);
  assert.match(container.innerHTML, /彩排/);
  assert.match(container.innerHTML, /正式/);
});

test('設計師版 sheet 不含任務細節', () => {
  const ctrl = views.createController(container, { activityId: 'yearend2025' });
  ctrl.state.data = RundownCore.demoRundown();
  ctrl.state.mode = 'print';
  ctrl.state.printVersion = 'designer';
  ctrl.render();
  assert.match(container.innerHTML, /抽獎活動 四等獎/);
  assert.doesNotMatch(container.innerHTML, /籤筒上台/);
});

console.log('rundown-views tests PASS');
