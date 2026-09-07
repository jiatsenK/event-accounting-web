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

test('新增任務採用收據 ID、不重讀；失敗保留草稿', async () => {
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
      assert.equal(options.receipt, true);
      return { task_id: 'new' };
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
test('點選與拖曳排序只留本機，儲存一次送整串；失敗重讀', async () => {
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
  const save = { handlers:{}, addEventListener(name,fn){this.handlers[name]=fn;} };
  host.querySelectorAll = selector => selector === '[data-action="save-draft"]' ? [save] : [];
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
  assert.equal(ctrl.state.busy,false);
  assert.equal(sent.length,0);
  await pending;
  const saving = save.handlers.click();
  assert.equal(ctrl.state.busy,true);
  release(); await saving;
  assert.equal(reads,0);
  assert.equal(sent.length,1);
  assert.equal(sent[0].action,'save_rundown_order');
  assert.deepEqual(JSON.parse(sent[0].data),{order:[{segment_id:'c',順序:10},{segment_id:'a',順序:20},{segment_id:'b',順序:30}]});
  global.PlanningCore.apiWrite=async()=>{throw new Error('offline');};
  handles[1].handlers.click();
  await handles[2].handlers.click();
  await save.handlers.click();
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


function perfHarness(raw) {
  const host=stubElement(), controls=new Map();
  const control=key=>{if(!controls.has(key)) controls.set(key,{...stubElement(),handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});return controls.get(key);};
  const fields=['節目內容','duration_min'].map(field=>({...control(field),dataset:{field},value:field==='節目內容'?raw.segments[0].title:String(raw.segments[0].duration_min),closest:()=>({dataset:{seg:raw.segments[0].segment_id}})}));
  const handles=raw.segments.map(seg=>({...stubElement(),handlers:{},setAttribute(){},closest:()=>({dataset:{seg:seg.segment_id},classList:{add(){},remove(){}}}),addEventListener(name,fn){this.handlers[name]=fn;}}));
  const body={...stubElement(),querySelectorAll:()=>handles};
  host.querySelector=selector=>selector==='.rd-segments'?body:control(selector);
  host.querySelectorAll=selector=>selector==='.rd-segments [data-field]'?fields:selector.startsWith('[data-action=')?[control(selector)]:[];
  const ctrl=views.createController(host,{activityId:'perf'});ctrl.state.source='backend';ctrl.state.data=RundownCore.normalize(raw);ctrl.render();
  return {host,ctrl,fields,handles,click:name=>control('[data-action="'+name+'"]').handlers.click()};
}
const eighteen={config:{official_start:'18:00'},segments:Array.from({length:18},(_,i)=>({segment_id:'s'+i,title:'節目'+i,duration_min:5,order:(i+1)*10}))};

test('18 段拖曳與多欄草稿一次儲存、不夾帶其他欄位；快取立即更新',async()=>{
  const sent=[],cached=[];let reads=0;
  global.PlanningCore={apiWrite:async(f,o)=>{sent.push(f);assert.equal(o.receipt,true);return {saved:true};},fetchRundown:async()=>{reads++;return eighteen;},cacheRundown:(id,d)=>cached.push(JSON.parse(JSON.stringify(d)))};
  try {
    const h=perfHarness(eighteen);
    h.fields[0].value='新節目';h.fields[0].handlers.input({target:h.fields[0]});
    h.fields[1].value='12';h.fields[1].handlers.input({target:h.fields[1]});
    const started=performance.now();h.handles[17].handlers.click();h.handles[0].handlers.click();
    assert.ok(performance.now()-started<1000,'本機 18 段即時重排');
    assert.equal(sent.length,0);assert.equal(cached.length,0);assert.equal(h.ctrl.state.data.segments[1].title,'新節目');
    await h.click('save-draft');
    assert.equal(sent.length,1);assert.equal(reads,0);assert.equal(cached.length,1);assert.equal(h.ctrl.state.dirty,false);
    const data=JSON.parse(sent[0].data);assert.equal(data.order.length,18);
    assert.deepEqual(data.edits,[{segment_id:'s0',節目內容:'新節目',duration_min:12}]);
    assert.equal(cached[0].segments[0].segment_id,'s17');assert.equal(cached[0].segments[1].duration_min,12);
  } finally {global.PlanningCore=PlanningCore;}
});

test('無效草稿不送出；取消／失敗且重讀失敗保留已確認快照',async()=>{
  let writes=0,reads=0;global.PlanningCore={apiWrite:async()=>{writes++;throw Error('offline');},fetchRundown:async()=>{reads++;throw Error('offline');}};
  try {
    const h=perfHarness(eighteen);
    h.fields[1].value='';h.fields[1].handlers.input({target:h.fields[1]});await h.click('save-draft');
    assert.equal(writes,0);assert.equal(h.ctrl.state.dirty,true);
    h.click('cancel-draft');assert.equal(h.ctrl.state.data.segments[0].duration_min,5);
    h.fields[0].value='未保存';h.fields[0].handlers.input({target:h.fields[0]});
    await h.click('reload');assert.equal(reads,0,'不讓重讀丟棄草稿');
    await h.click('save-draft');assert.equal(writes,1);assert.equal(reads,1);
    assert.equal(h.ctrl.state.data.segments[0].title,'節目0');assert.equal(h.ctrl.state.error,true);assert.match(h.ctrl.state.message,/上次已確認/);
  }finally{global.PlanningCore=PlanningCore;}
});

test('快取先畫、員工查詢不阻塞；背景結果不覆蓋草稿或剛儲存資料',async()=>{
  let finish;const cache=[];
  global.PlanningCore={getCachedRundown:()=>eighteen,fetchRundown:()=>new Promise(resolve=>{finish=resolve;}),apiRead:()=>new Promise(()=>{}),apiWrite:async()=>({saved:true}),cacheRundown:(id,d)=>cache.push(JSON.parse(JSON.stringify(d)))};
  try{
    const h=perfHarness(eighteen);const loading=h.ctrl.load('backend');
    assert.match(h.host.innerHTML,/節目17/);assert.equal(h.ctrl.state.busy,false);
    h.fields[0].value='本機新標題';h.fields[0].handlers.input({target:h.fields[0]});
    await h.click('save-draft');finish(eighteen);await loading;
    assert.equal(h.ctrl.state.data.segments[0].title,'本機新標題');assert.equal(cache.length,1);
    const fresh=h.ctrl.load('backend');finish({...eighteen,segments:[{...eighteen.segments[0],title:'遠端新標題'}]});await fresh;
    assert.equal(h.ctrl.state.data.segments[0].title,'遠端新標題');assert.equal(cache.at(-1).segments[0].title,'遠端新標題');
  }finally{global.PlanningCore=PlanningCore;}
});


test('切回同活動保留草稿，切換活動後較晚回覆不覆蓋新畫面',async()=>{
  const host=stubElement();let loads=0;
  const field={...stubElement(),dataset:{field:'節目內容'},value:'未存標題',handlers:{},closest:()=>({dataset:{seg:'s0'}}),addEventListener(name,fn){this.handlers[name]=fn;}};
  host.querySelectorAll=selector=>selector==='.rd-segments [data-field]'?[field]:[];
  global.PlanningCore={getCachedRundown:()=>eighteen,apiRead:async()=>({staff:[]}),fetchRundown:async()=>{loads++;return eighteen;}};
  try{
    await views.rundown.mount(host,{activityId:'a'});field.handlers.input({target:field});
    await views.rundown.mount(host,{activityId:'a'});assert.equal(loads,1);assert.match(host.innerHTML,/未存標題/);
    let finishOld;
    global.PlanningCore.fetchRundown=()=>new Promise(resolve=>{finishOld=resolve;});
    const oldLoad=views.rundown.mount(host,{activityId:'old'});
    global.PlanningCore.fetchRundown=async()=>({...eighteen,segments:[{...eighteen.segments[0],title:'新活動標題'}]});
    await views.rundown.mount(host,{activityId:'new'});finishOld(eighteen);await oldLoad;
    assert.match(host.innerHTML,/新活動標題/);assert.doesNotMatch(host.innerHTML,/節目17/);
  }finally{global.PlanningCore=PlanningCore;}
});


// #71 interaction harness: exercise event handlers with the existing transport stub.
function redesignHarness() {
  const host=stubElement(), controls=new Map();
  const element=(key,dataset={})=>{
    if(!controls.has(key)) controls.set(key,{...stubElement(),dataset,handlers:{},value:'',textContent:'',
      addEventListener(type,fn){this.handlers[type]=fn;}, focus(){this.focused=true;}, select(){}, setAttribute(){},
      parentElement:{querySelector:()=>stubElement()}, getBoundingClientRect(){return {height:120};}});
    return controls.get(key);
  };
  const row=element('row',{seg:'a'}),anchor=element('anchor',{field:'錨定時間'});
  anchor.value='19:30';row.querySelector=()=>anchor;
  host.querySelector=selector=>selector==='.rd-segments'?element('segments'):element(selector);
  host.querySelectorAll=selector=>{
    if(selector==='[data-stage]')return [element('stage',{stage:'彩排'})];
    if(selector.startsWith('[data-action='))return [element(selector)];
    return [];
  };
  const ctrl=views.createController(host,{activityId:'redesign'});
  ctrl.state.source='backend';ctrl.state.data=RundownCore.normalize({config:{official_start:'18:00'},
    segments:[{segment_id:'a',title:'迎賓',duration_min:30,order:10,stage:'正式',anchor_time:'18:00',note:'保留備註',prize_ids:['p']},{segment_id:'b',title:'開場',duration_min:10,order:20}],
    roles:[{role:'主持'}],tasks:[{task_id:'t',segment_id:'a',role:'主持',content:'引導來賓'}],prizes:[{prize_id:'p',tier:'頭獎',amount:5000,count:2,presenter:'頒獎人'}]});
  ctrl.render();
  for(const el of controls.values())el.closest=()=>row;
  const click=name=>{const el=element('[data-action="'+name+'"]');el.closest=()=>row;return el.handlers.click({target:el,currentTarget:el});};
  return {host,ctrl,controls,element,row,anchor,click};
}

test('#71 工具列層級、單一匯入、角色與獎項收進選單',()=>{
  const h=redesignHarness();
  assert.match(h.host.innerHTML,/class="rd-primary" data-action="add-segment"/);
  assert.doesNotMatch(h.host.innerHTML,/class="rd-modes"|class="rd-status|data-quick-segment|✕/);
  assert.equal((h.host.innerHTML.match(/帶入起始流程/g)||[]).length,1);
  assert.match(h.host.innerHTML,/rd-role-manager/);assert.match(h.host.innerHTML,/rd-prize-popover/);
  assert.match(h.host.innerHTML,/aria-pressed="true" data-action="toggle-prize"/);
  assert.match(h.host.innerHTML,/頭獎 \$5,000 × 2名／頒獎人/);
});

test('#71 階段與錨定沿用完整時段契約，不遺失其餘欄位',async()=>{
  const sent=[];global.PlanningCore={apiWrite:async fields=>{sent.push(fields);return {segment_id:'a'};}};
  try{
    const h=redesignHarness(),stage=h.element('stage');
    await stage.handlers.click({currentTarget:stage});
    assert.equal(sent[0].階段,'彩排');assert.equal(sent[0].節目內容,'迎賓');assert.equal(sent[0].duration_min,30);
    assert.equal(sent[0].錨定時間,'18:00');assert.equal(sent[0].prize_ids,'p');assert.equal(sent[0].備註,'保留備註');
    await h.click('save-anchor');assert.equal(sent[1].錨定時間,'19:30');assert.equal(sent[1].階段,'彩排');
    assert.equal(h.ctrl.state.data.segments[0].anchor_time,'19:30');
  }finally{global.PlanningCore=PlanningCore;}
});

test('#71 新增接在焦點段後並沿用長度、成功使用收據 ID',async()=>{
  const sent=[];global.PlanningCore={apiWrite:async fields=>{sent.push(fields);return {segment_id:'new'};}};
  try{
    const h=redesignHarness();h.ctrl.state.focusedSegment='a';await h.click('add-segment');
    assert.equal(sent.length,1);assert.equal(sent[0].duration_min,30);assert.equal(sent[0].順序,15);
    assert.deepEqual(h.ctrl.state.data.segments.map(s=>s.segment_id),['a','new','b']);
  }finally{global.PlanningCore=PlanningCore;}
});

test('#71 刪除先保留資料 8 秒，原位復原不寫入也不移除任務',async()=>{
  const set=global.setTimeout,clear=global.clearTimeout;let timer,delay,writes=0,cancelled=false;
  global.setTimeout=(fn,ms)=>{timer=fn;delay=ms;return 1;};global.clearTimeout=()=>{cancelled=true;};
  global.PlanningCore={apiWrite:async()=>{writes++;return {};}};
  try{
    const h=redesignHarness();await h.click('del-seg');assert.equal(delay,8000);assert.equal(writes,0);
    assert.match(h.host.innerHTML,/已刪除「迎賓」· 含 1 個任務/);assert.equal(h.ctrl.state.data.tasks.length,1);
    await h.click('undo-delete');await timer();assert.equal(cancelled,true);assert.equal(writes,0);
    assert.equal(h.ctrl.state.pendingDelete,null);assert.equal(h.ctrl.state.data.segments.length,2);
  }finally{global.setTimeout=set;global.clearTimeout=clear;global.PlanningCore=PlanningCore;}
});

test('#71 復原期限結束才送一次既有刪除，成功移除關聯任務',async()=>{
  const set=global.setTimeout;let timer;const sent=[];global.setTimeout=fn=>{timer=fn;return 1;};
  global.PlanningCore={apiWrite:async fields=>{sent.push(fields);return {};}};
  try{
    const h=redesignHarness();h.click('del-seg');await timer();
    assert.equal(sent.length,1);assert.equal(sent[0]._delete,'1');assert.equal(sent[0].segment_id,'a');
    assert.equal(h.ctrl.state.data.tasks.length,0);assert.deepEqual(h.ctrl.state.data.segments.map(s=>s.segment_id),['b']);
  }finally{global.setTimeout=set;global.PlanningCore=PlanningCore;}
});

test('#71 刪除失敗還原原位資料並提供就地錯誤',async()=>{
  const set=global.setTimeout;let timer;global.setTimeout=fn=>{timer=fn;return 1;};
  global.PlanningCore={apiWrite:async()=>{throw Error('刪除失敗');},fetchRundown:async()=>{throw Error('offline');}};
  try{
    const h=redesignHarness();h.click('del-seg');await timer();assert.equal(h.ctrl.state.error,true);
    assert.equal(h.ctrl.state.data.tasks.length,1);assert.equal(h.ctrl.state.data.segments.length,2);
    assert.match(h.ctrl.state.feedback.selector,/data-seg="a"/);assert.equal(h.ctrl.state.pendingDelete,null);
  }finally{global.setTimeout=set;global.PlanningCore=PlanningCore;}
});

test('#71 活動已卸載時不執行延後刪除，草稿存在時不開始刪除',async()=>{
  const set=global.setTimeout;let timer,writes=0;global.setTimeout=fn=>{timer=fn;return 1;};
  global.PlanningCore={apiWrite:async()=>{writes++;return {};}};
  try{
    const h=redesignHarness();h.ctrl.state.dirty=true;h.click('del-seg');assert.equal(timer,undefined);
    h.ctrl.state.dirty=false;h.click('del-seg');h.ctrl.state.disposed=true;await timer();assert.equal(writes,0);
  }finally{global.setTimeout=set;global.PlanningCore=PlanningCore;}
});

test('#71 鍵盤上下移動沿用草稿排序並播報新位置與時間',()=>{
  const h=perfHarness(eighteen);let prevented=false;
  h.handles[0].handlers.keydown({key:'ArrowDown',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(h.ctrl.state.data.segments[1].segment_id,'s0');assert.equal(h.ctrl.state.dirty,true);
  assert.match(h.host.querySelector('[data-rd-live]').textContent,/第 2 個時段，18:05–18:10/);
});

test('#71 CSS 保留 token、焦點 outline、44px 觸控與 reduced-motion',()=>{
  const fs=require('node:fs'),path=require('node:path');const css=fs.readFileSync(path.join(__dirname,'../rundown.css'),'utf8');
  assert.doesNotMatch(css,/oklch\(|#[0-9a-f]{3,8}\b/i);assert.match(css,/macrostructure: Workbench/);
  assert.match(css,/:focus-visible \{ outline: 2px solid var\(--color-accent\)/);
  assert.match(css,/min-height: 2\.75rem/);assert.match(css,/@media \(max-width: 52rem\)/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);assert.doesNotMatch(css,/min-width: 1340px/);
});

test('#106 改名合併整組依順序編號，一次送出並更新快取', async () => {
  const sent=[];global.PlanningCore={apiWrite:async f=>{sent.push(f);return {};}};
  try {
    const h=perfHarness({segments:[{segment_id:'a',title:'開場',duration_min:5,order:30},{segment_id:'b',title:'抽獎',duration_min:5,order:10}]});
    h.fields[0].value='抽獎';h.fields[0].handlers.input({target:h.fields[0]});
    assert.equal(sent.length,0);await h.click('save-draft');
    assert.equal(sent.length,1);assert.equal(sent[0].action,'save_rundown_order');
    assert.deepEqual(JSON.parse(sent[0].data).edits,[{segment_id:'a',節目內容:'抽獎（二）'},{segment_id:'b',節目內容:'抽獎（一）'}]);
    assert.equal(h.ctrl.state.data.segments.find(s=>s.segment_id==='a').title,'抽獎（二）');
  } finally {global.PlanningCore=PlanningCore;}
});

test('#106 改名離開同名組後移除單段編號；單改長度不重編', async () => {
  const sent=[];global.PlanningCore={apiWrite:async f=>{sent.push(JSON.parse(f.data));return {};}};
  try {
    const raw={segments:[{segment_id:'a',title:'抽獎（一）',duration_min:5,order:10},{segment_id:'b',title:'抽獎(二)',duration_min:5,order:20}]};
    const h=perfHarness(raw);h.fields[1].value='6';h.fields[1].handlers.input({target:h.fields[1]});await h.click('save-draft');
    assert.deepEqual(sent[0].edits,[{segment_id:'a',duration_min:6}]);
    h.fields[0].value='唱歌';h.fields[0].handlers.input({target:h.fields[0]});await h.click('save-draft');
    assert.deepEqual(sent[1].edits,[{segment_id:'a',節目內容:'唱歌'},{segment_id:'b',節目內容:'抽獎'}]);
  } finally {global.PlanningCore=PlanningCore;}
});

test('#106 新增第二個同名時段只留編號草稿，儲存一次送兩段', async () => {
  const sent=[];global.PlanningCore={apiWrite:async f=>{sent.push(f);return {segment_id:'new'};}};
  try {
    const h=redesignHarness();h.ctrl.state.data.segments[0].title='新時段';
    await h.click('add-segment');assert.equal(sent.length,1);assert.equal(h.ctrl.state.dirty,true);
    assert.deepEqual(h.ctrl.state.data.segments.filter(s=>s.title.startsWith('新時段')).map(s=>s.title),['新時段（一）','新時段（二）']);
    await h.click('save-draft');assert.equal(sent.length,2);assert.equal(JSON.parse(sent[1].data).edits.length,2);
  } finally {global.PlanningCore=PlanningCore;}
});
