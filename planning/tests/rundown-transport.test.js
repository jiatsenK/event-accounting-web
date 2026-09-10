'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function browser() {
  const storage = new Map(), timers = new Map(), listeners = new Map(), scripts = [], posts = [];
  let next = 0;
  const element = tag => ({ tag, style: {}, children: [], setAttribute() {}, remove() {},
    appendChild(child) { this.children.push(child); },
    submit() { posts.push(Object.fromEntries(this.children.map(x => [x.name, x.value]))); }
  });
  const root = { URLSearchParams, console,
    sessionStorage: {getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    localStorage: {getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    setTimeout(fn,delay) {timers.set(++next,{fn,delay});return next;},clearTimeout:id=>timers.delete(id),
    addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key),
    location:{origin:'https://example.test',search:''},
    document:{createElement:element,body:{append(){},appendChild(script){scripts.push(script);}}}
  };
  root.window=root;vm.createContext(root);
  vm.runInContext(fs.readFileSync(__dirname+'/../../assets/api-config.js','utf8'),root);
  vm.runInContext(fs.readFileSync(__dirname+'/../core.js','utf8'),root);
  const api=root.PlanningCore; storage.set(api.TOKEN_STORAGE_KEY,'test-token');
  const runTimer=async()=>{const [id,timer]=timers.entries().next().value;timers.delete(id);timer.fn();await Promise.resolve();return timer.delay;};
  const reply=value=>{const script=scripts.at(-1);const params=new URL(script.src).searchParams;root[params.get('callback')](value);return params;};
  return {root,api,storage,timers,listeners,scripts,posts,runTimer,reply};
}

test('session 快取按活動隔離；損毀／停用安全降級，讀取成功可更新',async()=>{
  const b=browser();b.api.cacheRundown('a',{segments:[{segment_id:'s'}]});
  assert.equal(b.api.getCachedRundown('a').segments[0].segment_id,'s');assert.equal(b.api.getCachedRundown('b'),null);
  const pending=b.api.fetchRundown('b');b.reply({ok:true,data:{activity_id:'b',segments:[]}});await pending;
  assert.equal(b.api.getCachedRundown('b').activity_id,'b');
  const k=[...b.storage.keys()].find(k=>k.endsWith(':a'));b.storage.set(k,'{bad');assert.equal(b.api.getCachedRundown('a'),null);
  b.root.sessionStorage.getItem=()=>{throw Error('blocked');};b.root.sessionStorage.setItem=()=>{throw Error('quota');};
  assert.equal(b.api.getCachedRundown('a'),null);assert.doesNotThrow(()=>b.api.cacheRundown('a',{}));
});

test('postMessage 被擋時 400ms 查收據，只 POST 一次且不讀整份 rundown',async()=>{
  const b=browser();const pending=b.api.apiWrite({action:'save_rundown_order',activity_id:'a',data:'{}'},{receipt:true});
  assert.equal(b.posts.length,1);assert.equal(await b.runTimer(),400);
  const params=b.reply({ok:true,data:{ok:true,data:{saved:true}}});const result=await pending;
  assert.equal(params.get('action'),'rundown_write_result');assert.equal(params.get('nonce'),b.posts[0].nonce);
  assert.equal(params.get('write_action'),'save_rundown_order');assert.equal(result.saved,true);
  assert.equal(b.posts.length,1);assert.equal(b.timers.size,0);assert.equal(b.listeners.size,0);
});

test('失敗收據立即拒絕，缺收據不誤判成功；postMessage 可先完成並取消輪詢',async()=>{
  const b=browser();const pending=b.api.apiWrite({action:'save_rundown_order',activity_id:'a'},{receipt:true});
  const rejected=assert.rejects(pending,/invalid order/);await b.runTimer();b.reply({ok:true,data:{pending:true}});
  await Promise.resolve();await Promise.resolve();assert.equal(b.posts.length,1);
  await b.runTimer();b.reply({ok:true,data:{ok:false,error:'invalid order'}});await rejected;
  const c=browser();const saved=c.api.apiWrite({action:'save_rundown_order',activity_id:'a'},{receipt:true});
  c.listeners.get('message')({data:{type:'event-accounting-result',nonce:c.posts[0].nonce,payload:{ok:true,data:{saved:true}}}});
  assert.equal((await saved).saved,true);assert.equal(c.timers.size,0);assert.equal(c.scripts.length,0);
});
