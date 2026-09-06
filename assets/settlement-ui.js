(function (root) {
  'use strict';
  let sequence = 0;
  let settlement = null;
  const fields = ['暫支金額', '零用金已用合計', '最終沖銷金額'];
  function renderSettlement(data) {
    const container = document.querySelector('#pettySettlement');
    if (!container) return;
    settlement = data.petty_cash_settlement || null;
    if (!state.capabilities.includes('petty_cash_settlement')) {
      container.innerHTML = '<p class="muted">後端尚未提供零用金結算紀錄。</p>';
      return;
    }
    if (settlement) {
      container.innerHTML = '<p>結算已凍結，金額不隨核銷狀態改變。</p><dl>' +
        fields.map(key => `<dt>${key}</dt><dd>${money(settlement[key])}</dd>`).join('') +
        `<dt>沖銷方向</dt><dd>${escapeHtml(settlement['沖銷方向'])}</dd><dt>沖銷狀態</dt><dd>${escapeHtml(settlement['沖銷狀態'])}</dd><dt>沖銷日期</dt><dd>${escapeHtml(settlement['沖銷日期'] || '—')}</dd><dt>備註</dt><dd>${escapeHtml(settlement['備註'] || '—')}</dd></dl>` +
        (state.activity.reimbursement_locked ? `<form id="settlementForm"><label>沖銷日期<input name="settlement_date" type="date" value="${escapeHtml(settlement['沖銷日期'] || '')}" required></label><label>備註<input name="note" value="${escapeHtml(settlement['備註'] || '')}"></label><button type="submit" ${state.capabilities.includes('update_petty_cash_settlement') ? '' : 'disabled'}>${settlement['沖銷狀態'] === '已沖銷' ? '儲存沖銷日期與備註' : '確認匯款完成，記為已沖銷'}</button></form>` : '<p>結算已保存，請再次按「完成核銷並鎖定」完成鎖定。</p>') +
        '<div id="settlementStatus" class="status" aria-live="polite"></div>';
      // Keep the overview metrics consistent with the authoritative frozen record.
      setMoneyMetric('#pettyCashAdvance', settlement['暫支金額']);
      setMoneyMetric('#pettyCashUsed', settlement['零用金已用合計']);
      setMoneyMetric('#pettyCashRemaining', settlement['最終沖銷金額']);
    } else if (state.activity.reimbursement_locked) {
      container.innerHTML = '<p>此活動已鎖定，但沒有凍結結算紀錄。需依原始資料確認歷史金額。</p>';
      setMoneyMetric('#pettyCashRemaining', null);
    } else {
      const rows = state.expenses.filter(row => row.payment_method === '個人代墊');
      container.innerHTML = '<p>鎖定前請勾選所有由零用金核銷的個人代墊（包含已逐筆核銷者）；直接向公司請款的代墊不要勾選。活動零用金直接支付會自動計入。</p>' +
        rows.map(row => `<label class="advance-row"><span><input type="checkbox" data-petty-expense="${escapeHtml(row.expense_id)}"> ${escapeHtml(row.payer || '未填支付人')} · ${escapeHtml(row.date)} · ${escapeHtml(row.item)} · ${escapeHtml(row.reimbursement_status)} · 請款單 ${escapeHtml(row.payment_request_id || '無')}</span><strong>${money(row.amount)}</strong></label>`).join('') +
        '<p id="pettySelectionTotal"></p><label><input id="pettySelectionConfirmed" type="checkbox"> 我已確認零用金核銷清單（若無個人代墊使用零用金，保持全部未勾選）</label>';
      updateSelectionTotal();
    }
    const label = document.querySelector('#pettyCashRemaining')?.parentElement?.querySelector('.label');
    if (label) label.textContent = settlement ? `最終沖銷金額（${settlement['沖銷狀態']}）` : state.activity.reimbursement_locked ? '無凍結紀錄' : '剩餘待沖銷';
  }
  function selectedIds() {
    return Array.from(document.querySelectorAll('[data-petty-expense]:checked'), element => element.dataset.pettyExpense);
  }
  function updateSelectionTotal() {
    const output = document.querySelector('#pettySelectionTotal');
    if (!output) return;
    const ids = selectedIds();
    const used = state.expenses.filter(row => row.payment_method === '活動零用金' || ids.includes(String(row.expense_id)))
      .reduce((sum,row) => sum + Number(row.amount),0);
    const advance = state.activity.petty_cash_advance;
    output.textContent = `選定零用金已用合計 ${money(used)}；最終沖銷金額 ${advance == null ? '暫支未填，請先填寫' : money(advance - used)}`;
  }
  root.pettyCashFinalizeFields = function () {
    if (!state.capabilities.includes('petty_cash_settlement')) throw new Error('後端尚未提供零用金結算，請先更新後端再鎖定。');
    if (settlement) return {}; // Resume a previously frozen finalization.
    if (!document.querySelector('#pettySelectionConfirmed')?.checked) throw new Error('請先在零用金結算區確認代墊核銷清單。');
    if (state.activity.petty_cash_advance == null) throw new Error('請先填寫活動零用金暫支（無暫支填 0）。');
    return { petty_cash_expense_ids: JSON.stringify(selectedIds()) };
  };
  function renderGroups(groups) {
    const body = document.querySelector('#personalAdvanceGroups');
    if (!body) return;
    body.innerHTML = groups.length ? groups.map(group => {
      const t = group.totals;
      return `<section class="preview-block"><h3>${escapeHtml(group.payer || '未填支付人')}</h3><p>代墊總額 ${money(t.total)} ／ 已核銷 ${money(t.reimbursed)} ／ 待核銷 ${money(t.pending)} ／ 已請款 ${money(t.claimed)} ／ 代墊未請款 ${money(t.unclaimed)}</p><div class="preview-scroll"><table><thead><tr><th>活動</th><th>日期</th><th>項目</th><th>金額</th><th>發票</th><th>預算項目</th><th>核銷狀態</th><th>請款單編號</th></tr></thead><tbody>` +
        group.expenses.map(row => `<tr><td>${escapeHtml(row.activity_name || row.activity_id)}</td><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.item)}</td><td>${money(row.amount)}</td><td>${escapeHtml(row.invoice_no || '—')}</td><td>${escapeHtml(row.budget_item || '—')}</td><td>${escapeHtml(row.reimbursement_status || '—')}</td><td>${escapeHtml(row.payment_request_id || '—')}</td></tr>`).join('') + '</tbody></table></div></section>';
    }).join('') : '<p class="empty">查無個人代墊紀錄。</p>';
  }
  async function loadPersonalAdvances(allActivities) {
    const body = document.querySelector('#personalAdvanceGroups');
    if (!body) return;
    const requestSequence = ++sequence;
    const activityId = state.activityId;
    const payer = String(document.querySelector('#advancePayer').value || '').trim();
    if (!state.capabilities.includes('personal_advances')) { body.textContent = '後端尚未提供個人代墊明細。'; return; }
    if (allActivities && !payer) { body.textContent = '跨活動查詢請輸入完整代墊人姓名。'; return; }
    body.textContent = '讀取中…';
    try {
      const data = await apiRead('personal_advances', allActivities ? {payer} : {activity_id: activityId, payer});
      if (requestSequence !== sequence || activityId !== state.activityId) return;
      renderGroups(data.groups || []);
    } catch (error) {
      if (requestSequence === sequence && activityId === state.activityId) body.textContent = '個人代墊讀取失敗：' + error.message;
    }
  }
  document.querySelector('#advanceQuery')?.addEventListener('submit', event => { event.preventDefault(); loadPersonalAdvances(document.querySelector('#advanceHistory').checked); });
  document.querySelector('#pettySettlement')?.addEventListener('change', event => {
    if (event.target.matches('[data-petty-expense]')) {
      document.querySelector('#pettySelectionConfirmed').checked = false;
      updateSelectionTotal();
    }
  });
  document.querySelector('#pettySettlement')?.addEventListener('submit', async event => {
    event.preventDefault();
    const id = state.activityId;
    const form = event.target;
    const button = form.querySelector('button');
    const message = document.querySelector('#settlementStatus');
    button.disabled = true; message.textContent = '正在儲存…';
    try {
      const confirmed = await apiWrite({action:'update_petty_cash_settlement', activity_id:id, settlement_status:'已沖銷',
        settlement_date:form.elements.settlement_date.value, note:form.elements.note.value});
      if (id === state.activityId) render(confirmed);
    } catch (error) {
      if (id === state.activityId) { message.textContent = error.message; button.disabled = false; }
    }
  });
  const previousRender = root.render;
  root.render = function (data) {
    previousRender(data);
    renderSettlement(data);
    const payer = document.querySelector('#advancePayer');
    if (payer) payer.value = '';
    const history = document.querySelector('#advanceHistory');
    if (history) history.checked = false;
    loadPersonalAdvances(false);
  };
})(window);
