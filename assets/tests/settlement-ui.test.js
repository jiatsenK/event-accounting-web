'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup() {
  const elements = new Map();
  for (const id of ['pettySettlement','pettyCashRemaining','advancePayer','advanceHistory','personalAdvanceGroups','advanceQuery','pettySelectionConfirmed','pettySelectionTotal','settlementStatus']) {
    elements.set('#'+id,{innerHTML:'',textContent:'',value:'',checked:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}});
  }
  const calls=[]; const reads=[]; const metrics={}; let selected=[];
  const state={activityId:'a',activity:{},expenses:[],capabilities:[]};
  const window={render(data){Object.assign(state,{activity:data.activity,expenses:data.expenses || [],capabilities:data.capabilities || []});}};
  const context={window,state,document:{querySelector:key=>elements.get(key)||null,querySelectorAll:()=>selected},
    apiRead(action,args){calls.push({action,args}); return new Promise((resolve,reject)=>reads.push({resolve,reject}));},
    apiWrite:async()=>{throw new Error('rejected');},
    money:value=>String(value),setMoneyMetric:(key,value)=>metrics[key]=value,
    escapeHtml:value=>String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};
  context.render=data=>window.render(data);
  vm.createContext(context); vm.runInContext(fs.readFileSync(__dirname+'/../settlement-ui.js','utf8'),context);
  const data={activity:{activity_id:'a',petty_cash_advance:1000,reimbursement_locked:false},expenses:[
    {expense_id:'cash',payment_method:'活動零用金',amount:200},
    {expense_id:'p1',payment_method:'個人代墊',amount:300,payer:'<script>',item:'用品',date:'2026-01-01',reimbursement_status:'已核銷'}],
    capabilities:['petty_cash_settlement','update_petty_cash_settlement','personal_advances']};
  return {window,context,state,e:key=>elements.get('#'+key),calls,reads,metrics,data,select(ids){selected=ids.map(id=>({dataset:{pettyExpense:id}}));}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('finalize requires explicit funding confirmation, includes selected already reimbursed advances',()=>{
  const h=setup();h.window.render(h.data);
  assert.match(h.e('pettySettlement').innerHTML,/&lt;script>/);
  assert.throws(()=>h.window.pettyCashFinalizeFields(),/確認/);
  h.select(['p1']);h.e('pettySelectionConfirmed').checked=true;
  assert.equal(h.window.pettyCashFinalizeFields().petty_cash_expense_ids,'["p1"]');
  h.e('pettySettlement').handlers.change({target:{matches:()=>true}});
  assert.equal(h.e('pettySelectionConfirmed').checked,false);
  assert.match(h.e('pettySelectionTotal').textContent,/已用合計 500.*沖銷金額 500/);
});
test('locked snapshot preserves totals, direction, date and note; missing history never fabricates a balance',()=>{
  const h=setup(); h.data.activity.reimbursement_locked=true;
  h.data.petty_cash_settlement={'暫支金額':1000,'零用金已用合計':1400,'最終沖銷金額':-400,'沖銷方向':'公司補款','沖銷狀態':'已沖銷','沖銷日期':'2026-09-06','備註':'完成'};
  h.window.render(h.data);
  assert.equal(h.metrics['#pettyCashRemaining'],-400);
  assert.match(h.e('pettySettlement').innerHTML,/公司補款.*已沖銷.*2026-09-06.*完成/s);
  assert.deepEqual(JSON.parse(JSON.stringify(h.window.pettyCashFinalizeFields())),{});
  h.data.petty_cash_settlement=null;h.window.render(h.data);
  assert.match(h.e('pettySettlement').innerHTML,/沒有凍結/);
  assert.equal(h.metrics['#pettyCashRemaining'],null);
});
test('history query uses exact payer and no activity id, renders all detail columns and independent totals',async()=>{
  const h=setup();h.window.render(h.data);
  h.e('advancePayer').value='甲人'; h.e('advanceHistory').checked=true;
  h.e('advanceQuery').handlers.submit({preventDefault(){}});
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[1])),{action:'personal_advances',args:{payer:'甲人'}});
  h.reads[1].resolve({groups:[{payer:'甲人',totals:{total:500,reimbursed:200,pending:300,claimed:100,unclaimed:400},expenses:[{activity_name:'舊活動',date:'2025-01-01',item:'<unsafe>',amount:500,invoice_no:'AB123',budget_item:'其他',reimbursement_status:'待核銷',payment_request_id:'R1'}]}]});
  await tick();
  assert.match(h.e('personalAdvanceGroups').innerHTML,/代墊總額 500.*已核銷 200.*待核銷 300.*已請款 100.*代墊未請款 400/s);
  assert.match(h.e('personalAdvanceGroups').innerHTML,/舊活動.*2025-01-01.*&lt;unsafe>.*AB123.*其他.*待核銷.*R1/s);
  h.reads[0].resolve({groups:[]});await tick();
  assert.match(h.e('personalAdvanceGroups').innerHTML,/舊活動/); // Late initial response cannot overwrite history.
});
test('switching activities invalidates history; read errors stay local; old backend cannot finalize',async()=>{
  const h=setup();h.window.render(h.data);
  h.state.activityId='b'; h.window.render({...h.data,activity:{...h.data.activity,activity_id:'b'}});
  h.reads[0].resolve({groups:[]});await tick();assert.equal(h.e('personalAdvanceGroups').textContent,'讀取中…');
  h.reads[1].reject(new Error('offline'));await tick();assert.match(h.e('personalAdvanceGroups').textContent,/讀取失敗.*offline/);
  h.window.render({...h.data,capabilities:[]});
  assert.throws(()=>h.window.pettyCashFinalizeFields(),/後端尚未提供/);
});
test('failed settlement write reports error and permits retry',async()=>{
  const h=setup();h.window.render(h.data);const button={disabled:false};
  const form={querySelector:()=>button,elements:{settlement_date:{value:'2026-09-06'},note:{value:'done'}}};
  await h.e('pettySettlement').handlers.submit({preventDefault(){},target:form});
  assert.equal(button.disabled,false);assert.equal(h.e('settlementStatus').textContent,'rejected');
});
