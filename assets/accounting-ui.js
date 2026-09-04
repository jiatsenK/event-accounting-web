const LF='_-"$"* #,##0_-;\\-"$"* #,##0_-;_-"$"* "-"??_-;_-@_-',LM='#,##0;[Red](#,##0);0';
function lb(s='thin'){return{style:s,color:{argb:'FF000000'}}}function lc(o={}){return{left:lb(o.left||'thin'),right:lb(o.right||'thin'),top:lb(o.top||'thin'),bottom:lb(o.bottom||'thin')}}
function lr(r,n,o={}){r.height=o.height||40.8;r.font={name:'Microsoft JhengHei',size:o.size||16,bold:!!o.bold};r.alignment={horizontal:o.horizontal||'center',vertical:'middle',wrapText:true};for(let c=1;c<=n;c++)r.getCell(c).border=lc({left:c===1&&o.outer?'medium':'thin',right:c===n&&o.outer?'medium':'thin',top:o.top||'thin',bottom:o.bottom||'thin'})}
function lh(r,n){lr(r,n,{bold:true,outer:true,top:'medium',bottom:'medium'})}function lt(s,t,n,o={}){s.mergeCells(1,1,1,n);let c=s.getCell(1,1);c.value=t;c.font={name:'Microsoft JhengHei',size:o.size||22,bold:o.bold!==false};c.alignment={horizontal:'center',vertical:'middle'};s.getRow(1).height=o.height||40.8}
function lp(s,orientation='landscape',o={}){Object.assign(s.pageSetup,{paperSize:9,orientation,horizontalCentered:true,verticalCentered:false,margins:o.margins||{left:.7087,right:.7087,top:.748,bottom:.748,header:.315,footer:.315}});if(o.fit){Object.assign(s.pageSetup,{fitToPage:true,fitToWidth:o.w??1,fitToHeight:o.h??0})}if(o.scale)s.pageSetup.scale=o.scale}
function xd(v){let t=String(v||'').trim(),m=t.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):t}
state.exportGroupOverrides={};state.exportOverridesActivityId='';
function exportOverrideStorageKey() {
  return `eventAccountingExportOverrides:${state.activityId}`;
}

function loadExportGroupOverrides() {
  if (state.exportOverridesActivityId === state.activityId) return;
  state.exportOverridesActivityId = state.activityId;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(exportOverrideStorageKey()) || '{}');
    state.exportGroupOverrides = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    state.exportGroupOverrides = {};
  }
}

function persistExportGroupOverrides() {
  sessionStorage.setItem(exportOverrideStorageKey(), JSON.stringify(state.exportGroupOverrides || {}));
}

function exportSourceSummary(rows) {
  return (rows || []).map(row => {
    const vendor = String(row.vendor || '').trim();
    const item = String(row.item || '').trim() || '未命名支出';
    return `${vendor ? `${vendor}／` : ''}${item} ${money(row.amount)}`;
  }).join('、');
}

function setExportPreviewStatus(text, error = false) {
  const el = $('#exportPreviewStatus');
  if (!el) return;
  el.textContent = text;
  el.className = error ? 'status form-status error' : 'status form-status';
}

function renderExportPreview() {
  const container = $('#exportPreview');
  if (!container) return;
  const overview = EventAccountingDomain.buildReimbursementOverview(state.expenses || [], state.exportGroupOverrides || {});
  const mainRows = overview.mainVendors.length
    ? overview.mainVendors.map(group => `
      <tr>
        <td>${escapeHtml(group.vendor)}</td>
        <td><span class="preview-fixed">依廠商合併</span><div class="preview-source">匯出品項：${escapeHtml((group.items || []).map(item => `${item.item} ${money(item.amount)}`).join('、') || '未命名')}</div><div class="preview-source">來源：${escapeHtml(exportSourceSummary(group.rows))}</div></td>
        <td class="num">${money(group.total)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="3" class="empty compact">沒有公司直接付款的主要廠商</td></tr>';

  const pettyItems = overview.pettyCash ? overview.pettyCash.items : [];
  const pettyRows = pettyItems.length
    ? pettyItems.map(group => `
      <tr>
        <td><input type="checkbox" data-export-group-select="${escapeHtml(group.id)}" aria-label="選取 ${escapeHtml(group.label)}"></td>
        <td><input class="export-group-name" data-export-group-label="${escapeHtml(group.id)}" value="${escapeHtml(group.label)}" aria-label="匯出項目名稱"></td>
        <td><div>${group.rows.length} 筆來源</div><div class="preview-source">${escapeHtml(exportSourceSummary(group.rows))}</div></td>
        <td class="num">${money(group.total)}</td>
        <td>${group.rows.length > 1 ? `<button type="button" class="table-action" data-export-group-split="${escapeHtml(group.id)}">拆開</button>` : '—'}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="5" class="empty compact">沒有需要以零用金用途彙總的支出</td></tr>';

  container.innerHTML = `
    <div class="preview-block">
      <div class="preview-heading">主要廠商</div>
      <div class="muted">公司直接付款依廠商合併；不同廠商不會互相合併。零用金若是主要廠商尾款，也會回到原廠商。</div>
      <div class="preview-scroll"><table><thead><tr><th>廠商</th><th>來源</th><th class="num">匯出總額</th></tr></thead><tbody>${mainRows}</tbody></table></div>
    </div>
    <div class="preview-block">
      <div class="preview-heading">JDC活動零用金</div>
      <div class="muted">這裡依用途彙總，不按廠商拆。勾選兩個以上項目可合併；「拆開」會回到逐筆支出。名稱可直接改。</div>
      <div class="preview-actions"><button id="mergeExportGroups" type="button" class="secondary">合併選取</button><button id="resetExportGroups" type="button" class="secondary">還原預設</button></div>
      <div class="preview-scroll"><table><thead><tr><th></th><th>匯出項目</th><th>來源</th><th class="num">金額</th><th></th></tr></thead><tbody>${pettyRows}</tbody></table></div>
    </div>
    <div class="preview-total">預覽合計 <strong>${money(overview.total)}</strong></div>
    <div class="muted">此處調整只影響這次瀏覽器工作階段的核銷 Excel，不會改寫原始帳務明細。</div>
  `;
}

function findPettyExportGroup(groupId) {
  const overview = EventAccountingDomain.buildReimbursementOverview(state.expenses || [], state.exportGroupOverrides || {});
  return overview.pettyCash && overview.pettyCash.items.find(group => group.id === groupId) || null;
}

function renameExportGroup(groupId, label) {
  const group = findPettyExportGroup(groupId);
  const name = String(label || '').trim();
  if (!group || !name) return renderExportPreview();
  group.rows.forEach(row => {
    const expenseId = String(row.expense_id || '').trim();
    if (!expenseId) return;
    state.exportGroupOverrides[expenseId] = { group_id: group.id, label: name };
  });
  persistExportGroupOverrides();
  renderExportPreview();
}

function splitExportGroup(groupId) {
  const group = findPettyExportGroup(groupId);
  if (!group || group.rows.length < 2) return;
  group.rows.forEach(row => {
    const expenseId = String(row.expense_id || '').trim();
    if (!expenseId) return;
    state.exportGroupOverrides[expenseId] = {
      group_id: `split:${expenseId}`,
      label: String(row.item || row.category || '零用金').trim() || '零用金'
    };
  });
  persistExportGroupOverrides();
  renderExportPreview();
}

function mergeSelectedExportGroups() {
  const selectedIds = Array.from(document.querySelectorAll('[data-export-group-select]:checked')).map(input => input.dataset.exportGroupSelect);
  if (selectedIds.length < 2) {
    setExportPreviewStatus('請先勾選至少兩個零用金項目再合併', true);
    return;
  }
  const overview = EventAccountingDomain.buildReimbursementOverview(state.expenses || [], state.exportGroupOverrides || {});
  const selected = overview.pettyCash ? overview.pettyCash.items.filter(group => selectedIds.includes(group.id)) : [];
  if (selected.length < 2) return;
  const defaultName = selected.map(group => group.label).join('＋');
  const label = String(window.prompt('合併後要在核銷總表顯示什麼名稱？', defaultName) || '').trim();
  if (!label) return;
  const groupId = `custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  selected.flatMap(group => group.rows).forEach(row => {
    const expenseId = String(row.expense_id || '').trim();
    if (expenseId) state.exportGroupOverrides[expenseId] = { group_id: groupId, label };
  });
  persistExportGroupOverrides();
  setExportPreviewStatus('已更新匯出預覽，原始帳務沒有變更');
  renderExportPreview();
}

function resetExportGroups() {
  state.exportGroupOverrides = {};
  persistExportGroupOverrides();
  setExportPreviewStatus('已還原系統預設彙總規則');
  renderExportPreview();
}

async function loadActivityList(fallbackActivity) {
  const select = $('#activitySelector');
  if (!select) return;
  try {
    const data = await apiRead('activities');
    const activities = Array.isArray(data && data.activities) ? data.activities : [];
    const list = activities.length ? activities : (fallbackActivity && fallbackActivity.activity_id ? [fallbackActivity] : []);
    state.activities = list;
    select.innerHTML = list.length ? list.map(activity => {
      const id = String(activity.activity_id || '');
      const suffix = [activity.date, activity.status].filter(Boolean).join(' · ');
      const label = `${activity.name || id}${suffix ? ` (${suffix})` : ''}`;
      return `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`;
    }).join('') : '<option value="">目前沒有可選活動</option>';
    if (list.some(activity => String(activity.activity_id || '') === String(state.activityId || ''))) select.value = state.activityId;
    select.disabled = list.length <= 1;
  } catch (_) {
    const list = fallbackActivity && fallbackActivity.activity_id ? [fallbackActivity] : [];
    state.activities = list;
    select.innerHTML = list.length ? `<option value="${escapeHtml(fallbackActivity.activity_id)}">${escapeHtml(fallbackActivity.name || fallbackActivity.activity_id)}</option>` : '<option value="">目前沒有可選活動</option>';
    select.disabled = true;
  }
}

async function switchActivity(activityId) {
  const next = String(activityId || '').trim();
  if (!next || next === state.activityId) return;
  state.activityId = next;
  state.editingExpenseId = '';
  const url = new URL(location.href);
  url.searchParams.set('activity_id', next);
  history.replaceState(null, '', url);
  await refresh();
}

const renderWithoutFrontendEnhancements=render;
function renderFrontendSummary(data) {
  const activity = data.activity || {};
  const expenses = data.expenses || [];
  const summary = EventAccountingDomain.summarizeDashboard(activity, expenses);
  const pendingAdvanceTotal = summary.pendingAdvances.reduce((total, row) => total + Number(row.amount || 0), 0);
  setMoneyMetric('#pendingAdvanceTotal', pendingAdvanceTotal);
  const headcount = Number(data.allocation && data.allocation.total_headcount);
  const perCapita = Number.isFinite(headcount) && headcount > 0 ? Number(summary.actualExpense || 0) / headcount : null;
  $('#perCapitaExpense').textContent = perCapita === null ? '—' : money(perCapita);
  $('#participantCount').textContent = Number.isFinite(headcount) && headcount > 0 ? `參加總人數 ${headcount} 人` : '尚未取得參加總人數';
  const recentExpenses = expenses.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 5);
  $('#recentExpenseRows').innerHTML = recentExpenses.length ? recentExpenses.map(row => `
    <tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.item)}</td><td class="num">${money(row.amount)}</td></tr>
  `).join('') : '<tr><td colspan="3" class="empty compact">目前沒有支出</td></tr>';
}

render=function(data){renderWithoutFrontendEnhancements(data);renderFrontendSummary(data);renderInlineExpenseRows(data.expenses||[]);loadExportGroupOverrides();renderExportPreview();void loadActivityList(data.activity||{})}
function sg(expenses,overrides){
  let o=EventAccountingDomain.buildReimbursementOverview(expenses,overrides||{}),gs=[];
  for(let base of o.mainVendors){
    let notes=[];
    for(let row of base.rows){let n=paymentExplanation(row);if(n&&!notes.includes(n))notes.push(n)}
    if(base.settlementNote)notes=[base.settlementNote];
    gs.push({vendor:base.vendor,rows:base.items,total:base.total,notes,settlement:null});
  }
  if(o.pettyCash){gs.push({vendor:o.pettyCash.vendor,rows:o.pettyCash.items.map(x=>({item:x.label,unitPrice:x.total,quantity:1,amount:x.total})),total:o.pettyCash.total,notes:['零用金付款'],settlement:null})}
  return gs
}
function buildOverviewSheet(w,a,e,overrides){let s=w.addWorksheet('核銷總覽',{views:[{zoomScale:70}]});lp(s,'landscape',{fit:true,w:2});let p=EventAccountingDomain.summarizePaymentMethods(e),cl=EventAccountingDomain.summarizeCurrentClaim(e);lt(s,`${a.name||state.activityId} 結算費用`,8);let hs=['活動名稱','廠商','品項','單價(加服務費)','數量','金額(含稅)','總額','備註'],hr=s.getRow(3);hs.forEach((x,i)=>hr.getCell(i+1).value=x);lh(hr,8);let rn=4;for(let g of sg(e,overrides||state.exportGroupOverrides||{})){let st=rn,rs=g.rows;for(let r of rs){let x=s.getRow(rn++);x.values=['',g.vendor,r.item||'',r.unitPrice,r.quantity,r.amount,'',''];lr(x,8,{height:48.6,outer:true});x.getCell(4).numFmt=LF;x.getCell(6).numFmt=LF}let en=rn-1;if(en>st){s.mergeCells(`B${st}:B${en}`);s.mergeCells(`G${st}:G${en}`);s.mergeCells(`H${st}:H${en}`)}s.getCell(`B${st}`).value=g.vendor;s.getCell(`G${st}`).value=g.total;s.getCell(`G${st}`).numFmt=LF;s.getCell(`H${st}`).value=g.notes.join('\n');s.getCell(`H${st}`).alignment={horizontal:'center',vertical:'middle',wrapText:true};for(let c=2;c<=8;c++){s.getRow(st).getCell(c).border={...s.getRow(st).getCell(c).border,top:lb('double')};s.getRow(en).getCell(c).border={...s.getRow(en).getCell(c).border,bottom:lb('double')}}}let last=Math.max(4,rn-1);if(e.length)s.mergeCells(`A4:A${last}`);s.getCell('A4').value=a.name||state.activityId;s.getCell('A4').font={name:'Microsoft JhengHei',size:16};s.getCell('A4').alignment={horizontal:'center',vertical:'middle',wrapText:true};let tr=s.getRow(rn);s.mergeCells(`B${rn}:F${rn}`);tr.getCell(2).value='總計';tr.getCell(7).value=cl.actualTotal;lr(tr,8,{bold:true,outer:true,bottom:'medium'});tr.getCell(7).numFmt=LF;s.mergeCells('K3:M3');let st=s.getCell('K3');st.value=`${a.name||state.activityId} 費用彙總`;st.font={name:'Microsoft JhengHei',size:16};st.alignment={horizontal:'center',vertical:'middle'};st.border=lc();['L3','M3'].forEach(x=>s.getCell(x).border=lc());let sm=[['活動總支出',cl.actualTotal],['已另行提報',cl.alreadySubmittedTotal],['本次請款',cl.currentClaimTotal],...p.items.map(x=>[`${x.payment_method}小計`,x.amount])];sm.forEach((x,i)=>{let r=4+i;s.mergeCells(`K${r}:L${r}`);s.getCell(`K${r}`).value=x[0];s.getCell(`M${r}`).value=x[1];['K','L','M'].forEach(c=>{let z=s.getCell(`${c}${r}`);z.font={name:'Microsoft JhengHei',size:16};z.alignment={horizontal:'center',vertical:'middle',wrapText:true};z.border=lc()});s.getCell(`M${r}`).numFmt=LF;s.getRow(r).height=40.8});[14.95,30.58,38.89,25.73,30.58,30.58,14,48.1].forEach((x,i)=>s.getColumn(i+1).width=x);Object.assign(s.getColumn('J'),{width:6.1});s.getColumn('K').width=20.89;s.getColumn('L').width=10.89;s.getColumn('M').width=23.1;s.pageSetup.printArea=`A1:M${Math.max(rn,4+sm.length)}`;return s}
function buildPettyCashSheet(w,a,e,o={}){let d=String(a&&a.petty_cash_application_date||'').trim();if(!d)throw Error('尚未讀到零用金申請日，請先更新 GAS 後端');let z=EventAccountingDomain.summarizePettyCashSettlement(a,e);if(z.advance===null)throw Error('尚未登記零用金金額');let es=z.items.slice().sort((x,y)=>String(x.date||'').localeCompare(String(y.date||''))||String(x.item||'').localeCompare(String(y.item||''))),s=w.addWorksheet(o.sheetName||'零用金費用',{views:[{showGridLines:false,zoomScale:60}]});lp(s,'portrait',{fit:true,w:1,h:1,margins:{left:.25,right:.25,top:.45,bottom:.45,header:.2,footer:.2}});s.mergeCells('A1:K1');let t=s.getCell('A1');t.value=`${a.name||state.activityId}零用金費用明細`;t.font={name:'Microsoft JhengHei',size:22,bold:true};t.alignment={horizontal:'center',vertical:'middle'};s.getRow(1).height=54;let hs=['編號','日期','抬頭','廠商統編','項目','發票號碼','支付金額','收入金額','結餘','分類','備註'],h=s.getRow(2);hs.forEach((x,i)=>h.getCell(i+1).value=x);h.height=30;h.font={name:'Microsoft JhengHei',size:16,bold:true};h.alignment={horizontal:'center',vertical:'middle',wrapText:true};let f=s.getRow(3);f.values=['',xd(d),'零用金請款','','','',0,z.advance,'','',''];f.getCell(9).value={formula:'H3-G3',result:z.advance};lr(f,11,{height:30});let bal=z.advance;es.forEach((x,i)=>{let rn=4+i,r=s.getRow(rn),v=x.vendor||x.item,note=reportNote(x);bal-=x.amount;r.values=[i+1,xd(x.date),v,String(x.tax_id||''),x.item,String(x.invoice_no||''),x.amount,0,bal,reportCategory(x),note];r.getCell(9).value={formula:`I${rn-1}-G${rn}+H${rn}`,result:bal};lr(r,11,{height:Math.max(String(v).length,String(x.item||'').length,String(note).length)>45?83.1:Math.max(String(v).length,String(x.item||'').length,String(note).length)>28?61.2:30})});let fr=4+es.length,r=s.getRow(fr);r.values=z.settlementAmount>0?['','','零用金匯回','','','',z.settlementAmount,0,0,'','']:z.settlementAmount<0?['','','公司補款','','','',0,Math.abs(z.settlementAmount),0,'','']:['','','沖銷完成','','','',0,0,0,'',''];r.getCell(9).value={formula:`I${fr-1}-G${fr}+H${fr}`,result:0};lr(r,11,{height:30});for(let c=1;c<=9;c++)s.getRow(fr-1).getCell(c).border={...s.getRow(fr-1).getCell(c).border,bottom:lb('double')};[13,19.82,28.23,22.18,18,22.41,15,13,23.47,20,62.94].forEach((x,i)=>s.getColumn(i+1).width=x);s.getColumn('B').numFmt='yyyy/mm/dd';['G','H','I'].forEach(c=>s.getColumn(c).numFmt=LM);let sr1=fr+2,sr2=fr+3,nf=x=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(+x||0),db=EventAccountingDomain.summarizeDashboard(a,e);s.mergeCells(`A${sr1}:I${sr1}`);s.getCell(`A${sr1}`).value=`${a.name||state.activityId}-總計支出總額：$${nf(db.actualExpense)}元整，費用明細詳附件。`;s.mergeCells(`A${sr2}:I${sr2}`);s.getCell(`A${sr2}`).value=z.settlementAmount>0?`費用支付說明：暫支撥款$${nf(z.advance)}元整-支付金額$${nf(z.deductionTotal)}元=$${nf(z.settlementAmount)}元整(回沖款項)`:z.settlementAmount<0?`費用支付說明：支付金額$${nf(z.deductionTotal)}元整-暫支撥款$${nf(z.advance)}元=$${nf(Math.abs(z.settlementAmount))}元整(補款款項)`:`費用支付說明：暫支撥款$${nf(z.advance)}元整-支付金額$${nf(z.deductionTotal)}元=$0元整(無需沖銷)`;[sr1,sr2].forEach((q,i)=>{let c=s.getCell(`A${q}`);c.font={name:'Microsoft JhengHei',size:16,bold:i===0};c.alignment={horizontal:'left',vertical:'middle',wrapText:true};s.getRow(q).height=45.9});s.pageSetup.printArea=`A1:I${sr2}`;return{sheet:s,settlement:z,finalRowNumber:fr,summaryRow2:sr2}}
function buildAllocationSheet(w,a,e,al){if(!al||!Array.isArray(al.units)||!al.units.length)throw Error('尚未讀到分攤資料，請先更新 GAS 後端');let total=EventAccountingDomain.summarizeExpenses(e),x=EventAccountingDomain.allocateAmount(total,al),nt=e.length&&e.every(r=>r.net_amount!==null&&r.net_amount!==undefined&&r.net_amount!=='')?e.reduce((s,r)=>s+ +r.net_amount,0):null,nx=nt===null?null:EventAccountingDomain.allocateAmount(nt,al),s=w.addWorksheet('分攤表',{views:[{zoomScale:70}]});lp(s,'portrait',{fit:true});let last=nx?4:3;s.mergeCells(1,1,1,last);let t=s.getCell(1,1);t.value=`${a.name||state.activityId} 費用分攤表`;t.font={name:'Microsoft JhengHei',size:16};t.alignment={horizontal:'center',vertical:'middle'};t.border=lc();s.getRow(1).height=40.8;let tr=s.getRow(3);tr.values=['總計','含稅',total];if(nx)tr.getCell(4).value=nt;lr(tr,last);tr.getCell(3).numFmt=LF;if(nx)tr.getCell(4).numFmt=LF;let hs=nx?['分攤單位','人數','各單位小計','未稅分攤']:['分攤單位','人數','各單位小計'],h=s.getRow(5);hs.forEach((v,i)=>h.getCell(i+1).value=v);lr(h,hs.length);x.rows.forEach((v,i)=>{let r=s.getRow(6+i);r.values=[v.name,al.method==='人數比例'?v.headcount:'',v.amount];if(nx)r.getCell(4).value=nx.rows[i].amount;lr(r,hs.length);r.getCell(3).numFmt=LF;if(nx)r.getCell(4).numFmt=LF});let rr=6+x.rows.length,r=s.getRow(rr);r.values=['合計',al.method==='人數比例'?x.rows.reduce((s,v)=>s+(+v.headcount||0),0):'',x.rows.reduce((s,v)=>s+v.amount,0)];if(nx)r.getCell(4).value=nx.rows.reduce((s,v)=>s+v.amount,0);lr(r,hs.length,{bold:true,top:'double'});r.getCell(3).numFmt=LF;if(nx)r.getCell(4).numFmt=LF;let ad=x.rows.find(v=>+v.adjustment);[['F1','分攤方式'],['G1',al.method],['F2','人數來源'],['G2',al.source==='external'?'外部平台即時資料':'分攤單位備援'],['F3','總人數'],['G3',al.method==='人數比例'?al.total_headcount:'不參與計算'],['F4','尾差調整'],['G4',ad?`${ad.name} ${ad.adjustment>0?'+':''}${ad.adjustment}`:'0']].forEach(([c,v])=>{s.getCell(c).value=v});if(!nx){s.getCell('F5').value='未稅分攤';s.getCell('G5').value='原始未稅資料不完整，未推算'}if(al.warning){s.getCell('F6').value='資料提示';s.getCell('G6').value=al.warning}for(let q=1;q<=(al.warning?6:5);q++)['F','G'].forEach(c=>{let z=s.getCell(`${c}${q}`);if(z.value!=null){z.font={name:'Microsoft JhengHei',size:12,bold:c==='F'};z.alignment={horizontal:'center',vertical:'middle',wrapText:true};z.border=lc()}});[20.89,10.89,23.1,18].slice(0,hs.length).forEach((v,i)=>s.getColumn(i+1).width=v);s.getColumn('F').width=16;s.getColumn('G').width=32;s.pageSetup.printArea=`A1:G${Math.max(rr,al.warning?6:5)}`;return s}
$('#exportPreview').addEventListener('click', (event) => {
  const split = event.target.closest('[data-export-group-split]');
  if (split) return splitExportGroup(split.dataset.exportGroupSplit);
  if (event.target.closest('#mergeExportGroups')) return mergeSelectedExportGroups();
  if (event.target.closest('#resetExportGroups')) return resetExportGroups();
});
$('#exportPreview').addEventListener('change', (event) => {
  const input = event.target.closest('[data-export-group-label]');
  if (input) renameExportGroup(input.dataset.exportGroupLabel, input.value);
});

function activateAccountingTab(name) {
  const valid = ['overview', 'budget', 'expenses', 'vendors', 'reimbursement'];
  const target = valid.includes(name) ? name : 'overview';
  document.querySelectorAll('[data-tab]').forEach(button => { const active = button.dataset.tab === target; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
  document.querySelectorAll('[data-tab-panel]').forEach(panel => { panel.hidden = panel.dataset.tabPanel !== target; });
  try { sessionStorage.setItem('eventAccountingActiveTab', target); } catch (_) {}
}

document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => activateAccountingTab(button.dataset.tab)));
document.addEventListener('click', event => {
  const opener = event.target.closest('[data-open-tab]');
  if (opener) activateAccountingTab(opener.dataset.openTab);
});
try { activateAccountingTab(sessionStorage.getItem('eventAccountingActiveTab') || 'overview'); } catch (_) { activateAccountingTab('overview'); }

const vendorSearch = $('#vendorSearch');
if (vendorSearch) vendorSearch.addEventListener('input', event => renderVendors(event.target.value));

const expenseEditorPanel = $('#expenseEditor');
$('#showExpenseEditor').addEventListener('click', () => {
  resetExpenseForm();
  setExpenseStatus('');
  expenseEditorPanel.hidden = false;
  expenseEditorPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#cancelEdit').addEventListener('click', () => { expenseEditorPanel.hidden = true; });
$('#closeExpenseEditor').addEventListener('click', () => { resetExpenseForm(); setExpenseStatus(''); expenseEditorPanel.hidden = true; });
function setInlineExpenseStatus(text, error = false) {
  const el = $('#inlineExpenseStatus');
  if (!el) return;
  el.textContent = text || '';
  el.className = error ? 'status form-status error' : 'status form-status';
}

function inlineDisplayValue(row, field) {
  if (field === 'amount') return money(row.amount);
  return String(row[field] || '').trim() || '—';
}

function renderInlineExpenseRows(expenses) {
  const rows = Array.isArray(expenses) ? expenses : [];
  $('#expenseRows').innerHTML = rows.length ? rows.map(row => {
    const id = escapeHtml(row.expense_id);
    const cell = (field, extra = '') => `<td class="${extra}"><button type="button" class="inline-value ${field === 'amount' ? 'num' : ''}" data-inline-edit-expense="${id}" data-inline-edit-field="${field}">${escapeHtml(inlineDisplayValue(row, field))}</button></td>`;
    return `<tr data-expense-id="${id}" data-payment-method="${escapeHtml(row.payment_method)}">${cell('date')}${cell('item')}${cell('category')}${cell('budget_item')}${cell('payment_method')}${cell('payer')}<td class="readonly-cell">${escapeHtml(row.reimbursement_status || '—')}</td>${cell('amount','num')}${cell('note')}<td></td></tr>`;
  }).join('') : '<tr><td colspan="10" class="empty">目前沒有支出</td></tr>';
  if (typeof window.applyExpenseFilters === 'function') window.applyExpenseFilters();
}

function inlineOptions(values, current) {
  return values.map(value => `<option value="${escapeHtml(value)}" ${String(value) === String(current || '') ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
}

function inlineExpenseEditor(field, expense) {
  const current = expense[field] ?? '';
  if (field === 'budget_item') {
    const budgetItems = Array.isArray(state.activity && state.activity.budget_items) ? state.activity.budget_items.map(item => item.name) : [];
    return `<select class="inline-editor" data-inline-field="${field}">${inlineOptions(budgetItems, current)}</select>`;
  }
  if (field === 'payment_method') {
    return `<select class="inline-editor" data-inline-field="${field}">${inlineOptions(['公司轉帳','活動零用金','個人代墊'], current)}</select>`;
  }
  if (field === 'date') return `<input class="inline-editor" data-inline-field="${field}" type="date" value="${escapeHtml(current)}">`;
  if (field === 'amount') return `<input class="inline-editor" data-inline-field="${field}" type="number" min="1" step="1" value="${escapeHtml(current)}">`;
  return `<input class="inline-editor ${field === 'item' ? 'item' : field === 'note' ? 'note' : ''}" data-inline-field="${field}" value="${escapeHtml(current)}">`;
}

function beginInlineExpenseEdit(expenseId, field) {
  if (!state.capabilities.includes('update_expense')) {
    setInlineExpenseStatus('目前 GAS 後端尚未支援修改支出，請先更新部署。', true);
    return;
  }
  const expense = state.expenses.find(row => String(row.expense_id || '') === String(expenseId || ''));
  if (!expense) return;
  renderInlineExpenseRows(state.expenses);
  const button = Array.from(document.querySelectorAll('#expenseRows [data-inline-edit-expense]')).find(el =>
    String(el.dataset.inlineEditExpense || '') === String(expenseId || '') && el.dataset.inlineEditField === field
  );
  if (!button) return;
  const td = button.closest('td');
  td.innerHTML = `<div class="inline-cell-editor">${inlineExpenseEditor(field, expense)}<div class="inline-actions"><button type="button" data-inline-save="${escapeHtml(expense.expense_id)}" data-inline-save-field="${escapeHtml(field)}" aria-label="儲存">✓</button><button type="button" class="secondary" data-inline-cancel aria-label="取消">×</button></div></div>`;
  const editor = td.querySelector('[data-inline-field]');
  if (editor) { editor.focus(); if (editor.select) editor.select(); }
}

async function saveInlineExpense(expenseId, field, td) {
  const current = state.expenses.find(row => String(row.expense_id || '') === String(expenseId || ''));
  const editor = td && td.querySelector(`[data-inline-field="${field}"]`);
  if (!current || !editor) return;
  const saveButton = td.querySelector('[data-inline-save]');
  if (saveButton) saveButton.disabled = true;
  try {
    const draft = {
      activity_id: state.activityId,
      date: current.date,
      item: current.item,
      category: current.category,
      budget_item: current.budget_item,
      amount: current.amount,
      payment_method: current.payment_method,
      payer: current.payer,
      note: current.note
    };
    draft[field] = editor.value;
    const expense = EventAccountingDomain.validateExpense(draft);
    const duplicate = EventAccountingDomain.findDuplicateExpense(state.expenses, expense, expenseId);
    if (duplicate) throw new Error('疑似重複支出：已有相同日期、項目與金額的紀錄');
    if (EventAccountingDomain.expenseEditableFieldsEqual(current, expense)) {
      renderInlineExpenseRows(state.expenses);
      setInlineExpenseStatus('沒有需要儲存的變更');
      return;
    }
    setInlineExpenseStatus('正在儲存修改…');
    const confirmed = await apiWrite({ action: 'update_expense', expense_id: expenseId, ...expense });
    render(confirmed);
    setInlineExpenseStatus('已儲存修改');
  } catch (err) {
    setInlineExpenseStatus(err && err.message ? err.message : '儲存失敗', true);
    if (saveButton) saveButton.disabled = false;
  }
}

$('#expenseRows').addEventListener('click', event => {
  const edit = event.target.closest('[data-inline-edit-expense]');
  if (edit) return beginInlineExpenseEdit(edit.dataset.inlineEditExpense, edit.dataset.inlineEditField);
  const save = event.target.closest('[data-inline-save]');
  if (save) return saveInlineExpense(save.dataset.inlineSave, save.dataset.inlineSaveField, save.closest('td'));
  if (event.target.closest('[data-inline-cancel]')) renderInlineExpenseRows(state.expenses);
});
$('#expenseRows').addEventListener('keydown', event => {
  const td = event.target.closest('td');
  if (!td || !td.querySelector('[data-inline-field]')) return;
  if (event.key === 'Escape') { event.preventDefault(); renderInlineExpenseRows(state.expenses); }
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); const save = td.querySelector('[data-inline-save]'); if (save) save.click(); }
});

window.applyExpenseFilters = function applyExpenseFilters() {
  const query = String($('#expenseSearch').value || '').trim().toLowerCase();
  const payment = String($('#expensePaymentFilter').value || '').trim();
  document.querySelectorAll('#expenseRows tr').forEach(row => {
    if (row.querySelector('.empty')) return;
    const matchesQuery = !query || row.textContent.toLowerCase().includes(query);
    const matchesPayment = !payment || String(row.dataset.paymentMethod || '') === payment;
    row.hidden = !(matchesQuery && matchesPayment);
  });
};
$('#expenseSearch').addEventListener('input', window.applyExpenseFilters);
$('#expensePaymentFilter').addEventListener('change', window.applyExpenseFilters);
$('#activitySelector').addEventListener('change', event => switchActivity(event.target.value).catch(handleError));

