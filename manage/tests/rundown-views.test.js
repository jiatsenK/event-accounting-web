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

test('流程表畫面不再顯示方案控制或方案欄位', () => {
  const ctrl = views.createController(container, { activityId: 'yearend2026' });
  ctrl.state.data = RundownCore.rundown2026();
  ctrl.state.mode = 'edit';
  ctrl.render();
  assert.doesNotMatch(container.innerHTML, /data-plan-pick|data-import="plan"|<th>方案<\/th>/);
});

test('時段編輯只寫 duration 與錨定時間，牆上時間唯讀顯示', () => {
  const ctrl = views.createController(container, { activityId: 'yearend2026' });
  ctrl.state.data = RundownCore.rundown2026();
  ctrl.state.source = 'backend';
  ctrl.state.mode = 'edit';
  ctrl.render();
  assert.match(container.innerHTML, /data-field="duration_min"/);
  assert.match(container.innerHTML, /data-field="錨定時間"/);
  assert.match(container.innerHTML, /18:20–18:30/);
  assert.doesNotMatch(container.innerHTML, /data-field="開始時間"|data-field="結束時間"/);
  assert.match(container.innerHTML, /data-config="正式_基準開始"/);
});

console.log('rundown-views tests PASS');

// Exercise the actual click handlers and deferred transport, not source matching.
test('點選排序立即重算，只送順序；成功不重讀，失敗重讀', async () => {
  let handles=[];
  const host=stubElement();
  const body=stubElement();
  body.handlers={};
  body.addEventListener=(name,fn)=>{body.handlers[name]=fn;};
  body.querySelectorAll=()=>handles;
  host.querySelector=selector=>selector === '.rd-table tbody' ? body : stubElement();
  const ctrl=views.createController(host,{activityId:'test'});
  const raw={config:{official_start:'18:00'},segments:[
    {segment_id:'a',order:10,title:'A',duration_min:10,stage:'正式'},
    {segment_id:'b',order:20,title:'B',duration_min:20,stage:'正式'},
    {segment_id:'c',order:30,title:'C',duration_min:30,stage:'正式'}]};
  ctrl.state.data=RundownCore.normalize(raw);
  ctrl.state.source='backend';
  handles=['a','b','c'].map(id=>({
    ...stubElement(), handlers:{}, setAttribute(){},
    closest(){return {dataset:{seg:id},classList:{add(){},remove(){}}};},
    addEventListener(name,fn){this.handlers[name]=fn;}
  }));
  ctrl.render();
  let release, reads=0;
  const sent=[];
  global.PlanningCore={apiWrite:fields=>{sent.push(fields); return sent.length===1 ? new Promise(resolve=>{release=resolve;}) : Promise.resolve();},fetchRundown:async()=>{reads++;return raw;}};
  handles[2].handlers.click();
  const pending=handles[0].handlers.click();
  assert.deepEqual(ctrl.state.data.segments.map(s=>s.segment_id),['c','a','b']);
  assert.match(host.innerHTML,/18:30–18:40/);
  assert.match(host.innerHTML,/18:40–19:00/);
  assert.doesNotMatch(host.innerHTML,/GMT|Sat Dec|1899/);
  assert.equal(ctrl.state.busy,true);
  release(); await pending;
  assert.equal(reads,0);
  assert.equal(sent.length,3);
  sent.forEach((fields,i)=>{
    assert.deepEqual(Object.keys(fields).sort(),['action','activity_id','segment_id','順序'].sort());
    assert.equal(fields['順序'],(i+1)*10);
  });
  global.PlanningCore.apiWrite=async()=>{throw new Error('offline');};
  handles[1].handlers.click();
  await handles[2].handlers.click();
  assert.equal(reads,1);
  assert.deepEqual(ctrl.state.data.segments.map(s=>s.segment_id),['a','b','c']);
  assert.equal(ctrl.state.error,true);
  const beforeCancel=ctrl.state.data;
  handles[0].handlers.dragstart({dataTransfer:{setData(){}}});
  handles[0].handlers.dragend();
  await body.handlers.drop({preventDefault(){}});
  assert.equal(ctrl.state.data,beforeCancel,'取消拖曳不寫入');
  global.PlanningCore.apiWrite=async fields=>{sent.push(fields);};
  host.querySelectorAll=selector=>selector === '.rd-table tbody tr[data-seg]' ? ['b','c','a'].map(seg=>({dataset:{seg}})) : [];
  handles[0].handlers.dragstart({dataTransfer:{setData(){}}});
  await body.handlers.drop({preventDefault(){}});
  assert.deepEqual(ctrl.state.data.segments.map(s=>s.segment_id),['b','c','a']);
  assert.deepEqual(ctrl.state.data.segments.map(s=>s.order),[10,20,30]);
  assert.equal(reads,1,'拖曳成功也不重讀');
  global.PlanningCore=PlanningCore;
});
