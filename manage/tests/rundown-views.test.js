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

test('時段與角色共用任務，預設無新增表單且編輯區不重複活動名稱', () => {
  const host = stubElement();
  const ctrl = views.createController(host, { activityId: 'test', activity: { name: '唯一活動名稱' } });
  ctrl.state.source = 'backend';
  ctrl.state.data = RundownCore.normalize({
    config: { official_start: '16:00' },
    segments: [{ segment_id: 's1', title: '開場', duration_min: 30, order: 10 }, { segment_id: 's2', title: '抽獎', duration_min: 15, order: 20 }],
    roles: [{ role: '音控' }, { role: '主持' }],
    tasks: [{ task_id: 't1', segment_id: 's1', role: '音控', content: '播放音樂', audience: '工作人員' },
      { task_id: 't2', segment_id: 's1', role: '主持', content: '介紹來賓', audience: '全部' },
      { task_id: 't3', segment_id: 's2', role: '音控', content: '播放音效', audience: '全部' }]
  });
  ctrl.render();
  assert.equal((host.innerHTML.match(/<article data-seg=/g) || []).length, 2);
  assert.equal((host.innerHTML.match(/data-task-details/g) || []).length, 2);
  assert.match(host.innerHTML, /16:00–16:30/);
  assert.doesNotMatch(host.innerHTML, /data-task-form|唯一活動名稱|rd-table/);
  ctrl.state.taskDraft = { segmentId: 's1', role: '音控', content: '草稿', audience: '全部' };
  ctrl.state.expandedSegments.add('s1');
  ctrl.render();
  assert.equal((host.innerHTML.match(/data-task-form/g) || []).length, 1);
  assert.match(host.innerHTML, /data-task-details open/);
  ctrl.state.taskView = 'role';
  ctrl.state.selectedRole = '音控';
  ctrl.render();
  assert.match(host.innerHTML, /播放音樂/);
  assert.match(host.innerHTML, /播放音效/);
  assert.doesNotMatch(host.innerHTML, /介紹來賓/);
  assert.ok(host.innerHTML.indexOf('播放音樂') < host.innerHTML.indexOf('播放音效'));
  ctrl.state.data.tasks[0].content = '更新後音樂';
  ctrl.state.data.assignments.push({ role: '音控', person: '測試人員' });
  ctrl.state.data.crew.push({ name: '測試人員' });
  ctrl.render();
  assert.match(host.innerHTML, /更新後音樂/);
  assert.match(host.innerHTML, /測試人員/);
  ctrl.state.mode = 'assign'; ctrl.render();
  assert.match(host.innerHTML, /更新後音樂/);
});

test('顯示層拒絕異常時間，保留跨日鐘面格式', () => {
  const host = stubElement();
  const ctrl = views.createController(host, { activityId: 'test' });
  ctrl.state.data = RundownCore.normalize({ config: { official_start: '23:50' }, segments: [{ segment_id: 's', duration_min: 30 }] });
  ctrl.render();
  assert.match(host.innerHTML, /23:50–翌 00:20/);
  const invalid = 'Sat Dec 30 1899 16:00:00 GMT+0800';
  const badRow = { time: invalid, start: invalid, end: invalid, tasks: [], prizeLabels: [] };
  global.RundownCore = { ...RundownCore,
    calculateTimeline: segments => segments.map(s => ({ ...s, time: new Date('1899-12-30T08:00:00Z') })),
    projectControl: () => ({ stages: [{ stage: '正式', segments: [badRow] }], unassignedRoles: [] }),
    projectCrew: () => ({ people: [{ name: '測試人員', roles: [], rows: [badRow] }], idlePeople: [] }),
    projectVenue: () => ({ rows: [badRow] }),
    projectDesigner: () => ({ segments: [badRow] })
  };
  try {
    for (const mode of ['edit', 'assign', 'print']) {
      ctrl.state.mode = mode;
      for (const version of ['control', 'crew', 'venue', 'designer']) {
        ctrl.state.printVersion = version; ctrl.render();
        assert.doesNotMatch(host.innerHTML, /1899|GMT|Sat Dec|Invalid Date/);
      }
    }
  } finally { global.RundownCore = RundownCore; }
});

test('新增任務回讀需確認新 ID、角色與對象，失敗保留草稿', async () => {
  const host = stubElement();
  const form = { ...stubElement(), handlers: {}, reportValidity: () => true,
    closest: () => ({ dataset: { seg: 's' } }),
    querySelectorAll: () => Object.entries({ 角色: '音控', 任務內容: '播放', 對象: '全部' }).map(([key, value]) => ({ dataset: { new: key }, value })),
    addEventListener(name, fn) { this.handlers[name] = fn; }
  };
  host.querySelectorAll = selector => selector === '[data-task-form]' ? [form] : [];
  const ctrl = views.createController(host, { activityId: 'test' });
  const old = { task_id: 'old', segment_id: 's', role: '音控', content: '播放', audience: '全部' };
  const raw = { segments: [{ segment_id: 's' }], roles: [{ role: '音控' }], tasks: [old] };
  let fresh = raw;
  ctrl.state.data = RundownCore.normalize(raw); ctrl.state.source = 'backend';
  ctrl.state.taskDraft = { segmentId: 's', role: '音控', content: '播放', audience: '全部' };
  ctrl.render();
  global.PlanningCore = {
    fetchRundown: async () => fresh,
    apiWrite: async (fields, options) => {
      assert.equal(fields.segment_id, 's');
      assert.equal(await options.confirm(), false, '不能把原有同文任務當新增成功');
      fresh = { ...raw, tasks: [old, { ...old, task_id: 'new', role: '主持' }] };
      assert.equal(await options.confirm(), false, '角色必須吻合');
      fresh.tasks[1] = { ...old, task_id: 'new', audience: '飯店' };
      assert.equal(await options.confirm(), false, '對象必須吻合');
      fresh.tasks[1] = { ...old, task_id: 'new' };
      assert.equal(await options.confirm(), true);
    }
  };
  try {
    await form.handlers.submit({ preventDefault() {}, currentTarget: form });
    assert.equal(ctrl.state.taskDraft, null);
    assert.equal(ctrl.state.data.tasks.length, 2);
    ctrl.state.taskDraft = { segmentId: 's', role: '音控', content: '播放', audience: '全部' };
    global.PlanningCore.apiWrite = async () => { throw new Error('offline'); };
    await form.handlers.submit({ preventDefault() {}, currentTarget: form });
    assert.equal(ctrl.state.taskDraft.content, '播放');
    assert.equal(ctrl.state.error, true);
  } finally { global.PlanningCore = PlanningCore; }
});

// Exercise the actual click handlers and deferred transport, not source matching.
test('點選排序立即重算，只送順序；成功不重讀，失敗重讀', async () => {
  let handles=[];
  const host=stubElement();
  const body=stubElement();
  body.handlers={};
  body.addEventListener=(name,fn)=>{body.handlers[name]=fn;};
  body.querySelectorAll=()=>handles;
  host.querySelector=selector=>selector === '.rd-segments' ? body : stubElement();
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
  host.querySelectorAll=selector=>selector === '.rd-segments > article[data-seg]' ? ['b','c','a'].map(seg=>({dataset:{seg}})) : [];
  handles[0].handlers.dragstart({dataTransfer:{setData(){}}});
  await body.handlers.drop({preventDefault(){}});
  assert.deepEqual(ctrl.state.data.segments.map(s=>s.segment_id),['b','c','a']);
  assert.deepEqual(ctrl.state.data.segments.map(s=>s.order),[10,20,30]);
  assert.equal(reads,1,'拖曳成功也不重讀');
  global.PlanningCore=PlanningCore;
});
