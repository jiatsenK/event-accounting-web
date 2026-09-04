'use strict';
const assert = require('node:assert/strict');
const views = require('../app-views.js');

assert.deepEqual(
  views.AREAS.accounting.views.map(item => item.label),
  ['總覽', '支出明細', '廠商主檔', '核銷整理']
);
assert.deepEqual(
  views.AREAS.planning.views.map(item => item.label),
  ['歷史紀錄', '規劃試算', '流程表']
);

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
