'use strict';
const assert = require('node:assert/strict');
const views = require('../app-views.js');

const router = require('../app-router.js');

// #155：活動頁六個分頁，規劃分頁含三個子頁。
assert.deepEqual(
  views.AREAS.activity.tabs.map(item => item.label),
  ['總覽', '預算與廠商', '規劃', '款項申請', '支出', '核銷']
);
assert.deepEqual(
  views.AREAS.activity.tabs.find(item => item.id === 'planning').views.map(item => item.label),
  ['流程表', '獎項', '飲品']
);
assert.equal(views.tabForView('activity', 'prizes').id, 'planning');
assert.equal(views.tabForView('activity', 'close').label, '核銷');
// 分頁定義與 router 的 view 清單要一致，不然點分頁會被導回總覽。
Object.keys(router.AREA_VIEWS).forEach(area => {
  assert.deepEqual(views.areaViews(area).map(item => item.id), Array.from(router.AREA_VIEWS[area]));
  views.areaViews(area).forEach(item => assert.ok(views.DEFAULT_VIEW_MODULES[views.viewKey(area, item.id)], area + ':' + item.id));
});

(async () => {
  const okContainer = { innerHTML: '' };
  const ok = await views.mountView({ mount(container) { container.innerHTML = 'ready'; } }, okContainer, {});
  assert.equal(ok, true);
  assert.equal(okContainer.innerHTML, 'ready');

  const failedContainer = { innerHTML: '' };
  const failed = await views.mountView({ mount() { throw new Error('單一 view 失敗'); } }, failedContainer, {});
  assert.equal(failed, false);
  assert.match(failedContainer.innerHTML, /單一 view 失敗/);
  assert.match(failedContainer.innerHTML, /仍可切換其他頁面/);
  console.log('app-views tests PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
