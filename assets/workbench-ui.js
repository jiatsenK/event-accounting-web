// #155 活動工作台：把既有帳務畫面接成六個分頁，並補上核銷收尾清單與簽呈後改報價的原因檢查。
// 由 manage/accounting-views.js 在 issue17.js、settlement-ui.js、payment-request-ui.js 之後載入；
// 只接既有的畫面與後端 action，不新增資料欄位。
(function (root) {
  'use strict';
  if (!root || typeof document === 'undefined') return;

  // 分頁切換：改版後的分頁（款項申請、核銷）不在 accounting-ui.js 的舊清單裡，
  // 這裡改成「畫面上有哪些分頁就能切哪些」。
  root.activateAccountingTab = function activateWorkbenchTab(name) {
    const panels = Array.from(document.querySelectorAll('[data-tab-panel]'));
    const names = panels.map(panel => panel.dataset.tabPanel);
    const target = names.includes(name) ? name : 'overview';
    panels.forEach(panel => { panel.hidden = panel.dataset.tabPanel !== target; });
    try { sessionStorage.setItem('eventAccountingActiveTab', target); } catch (_) {}
  };

  // 完成核銷按鈕從頁首搬進核銷分頁的第 3 步；頁首不再放。
  const finalizeSlot = document.querySelector('#closeFinalizeSlot');
  const core = root.EventAccountingCore || {};
  if (finalizeSlot && typeof core.mountHeaderActions === 'function') {
    core.mountHeaderActions(finalizeSlot);
    core.mountHeaderActions = function () {};
  }

  // 完成核銷的進度訊息原本寫在支出分頁，核銷分頁也同步顯示一份。
  if (typeof root.setInlineExpenseStatus === 'function') {
    const originalSetInlineExpenseStatus = root.setInlineExpenseStatus;
    root.setInlineExpenseStatus = function workbenchSetInlineExpenseStatus(text, error) {
      originalSetInlineExpenseStatus(text, error);
      const mirror = document.querySelector('#closeFinalizeStatus');
      if (mirror) {
        mirror.textContent = text || '';
        mirror.className = error ? 'status form-status error' : 'status form-status';
      }
    };
  }

  const hint = document.querySelector('.inline-hint');
  if (hint) hint.textContent = '直接點表格欄位即可原地修改；核銷狀態也可逐筆調整。全部核銷完，到「核銷」分頁鎖定帳務。';

  const SETTLEMENT_STAGES = ['回沖', '零用金請款'];
  let latestData = null;

  function settlementRequest(requests) {
    return (requests || []).find(row => SETTLEMENT_STAGES.includes(String(row['付款階段'] || ''))) || null;
  }

  // 第 14 步的收尾狀態，全部由現有資料推得。
  function closeProgress(data, requests) {
    const activity = data && data.activity || {};
    const expenses = data && Array.isArray(data.expenses) ? data.expenses : [];
    const settlement = data && data.petty_cash_settlement || null;
    const locked = Boolean(activity.reimbursement_locked);
    const pending = expenses.filter(row => String(row.reimbursement_status || '') === '待核銷').length;
    const request = settlementRequest(requests);
    const noSettlementNeeded = Boolean(settlement && settlement['沖銷方向'] === '無需沖銷');
    return {
      expenses: { done: expenses.length > 0, note: expenses.length ? `共 ${expenses.length} 筆支出，待核銷 ${pending} 筆` : '還沒有支出' },
      petty: { done: locked, note: locked ? (settlement ? '已凍結結算金額' : '已鎖定') : '勾選由零用金核銷的代墊，再勾確認' },
      finalize: { done: locked, note: locked ? (activity.reimbursement_locked_at ? `已鎖定：${activity.reimbursement_locked_at}` : '已鎖定') : '鎖定後支出不能再改' },
      report: { done: false, note: '三張表一起下載，格式照送件版本' },
      reply: {
        done: noSettlementNeeded || Boolean(request),
        note: noSettlementNeeded ? '零用金剛好用完，不用開單' : request ? `已開「${request['付款階段']}」單：${request['簽核狀態']}` : locked ? '還沒開沖銷申請單' : '完成核銷後才算得出金額'
      },
      settle: {
        done: Boolean(settlement && (settlement['沖銷狀態'] === '已沖銷' || noSettlementNeeded)),
        note: settlement ? `${settlement['沖銷方向'] || ''}・${settlement['沖銷狀態'] || ''}${settlement['沖銷日期'] ? '（' + settlement['沖銷日期'] + '）' : ''}` : '完成核銷後才會有結算紀錄'
      }
    };
  }

  const STEP_LABELS = [
    ['expenses', 1, '確認支出都登記了'],
    ['petty', 2, '零用金結算'],
    ['finalize', 3, '完成核銷並鎖定'],
    ['report', 4, '下載結算表'],
    ['reply', 5, '回覆會計：沖銷申請單'],
    ['settle', 6, '結清']
  ];

  function renderCloseChecklist() {
    if (!latestData) return;
    const requests = typeof root.getPaymentRequests === 'function' ? root.getPaymentRequests() : [];
    const progress = closeProgress(latestData, requests);
    const list = document.querySelector('#closeChecklist');
    if (list) {
      list.innerHTML = STEP_LABELS.map(([key, number, label]) =>
        `<li class="${progress[key].done ? 'done' : ''}"><span class="close-step-mark" aria-hidden="true">${progress[key].done ? '✓' : number}</span>` +
        `<span><strong>${escapeHtml(label)}</strong><span class="muted">${escapeHtml(progress[key].note)}</span></span></li>`).join('');
    }
    STEP_LABELS.forEach(([key, number]) => {
      const step = document.querySelector(`[data-close-step="${number}"]`);
      if (!step) return;
      step.classList.toggle('done', progress[key].done);
      const note = step.querySelector('[data-close-step-note]');
      if (note) note.textContent = progress[key].note;
    });
    renderSettlementSummary(latestData, requests);
  }

  function settlementAmounts(data) {
    const settlement = data && data.petty_cash_settlement;
    if (!settlement) return null;
    const amount = Number(settlement['最終沖銷金額']);
    if (!Number.isFinite(amount)) return null;
    return { amount, direction: settlement['沖銷方向'] || '' };
  }

  function renderSettlementSummary(data, requests) {
    const box = document.querySelector('#closeSettlementSummary');
    const button = document.querySelector('#openSettlementRequest');
    if (!box || !button) return;
    const amounts = settlementAmounts(data);
    const existing = settlementRequest(requests);
    if (!amounts) {
      box.innerHTML = '<p class="muted">完成第 3 步後，系統會算出零用金要匯回公司還是跟公司補請，金額也在這裡。</p>';
      button.hidden = true;
      return;
    }
    const text = amounts.amount > 0 ? `零用金剩 ${money(amounts.amount)}，要匯回公司（回沖）。`
      : amounts.amount < 0 ? `零用金不夠 ${money(-amounts.amount)}，要跟公司補請（零用金請款）。`
        : '零用金剛好用完，不用開單。';
    box.innerHTML = `<p>${escapeHtml(text)}</p><p class="muted">分攤表在第 4 步的完整核銷檔裡，和申請單一起回覆會計。</p>` +
      (existing ? `<p class="muted">已開申請單：${escapeHtml(existing['付款階段'])} ${money(existing['金額合計'])}（${escapeHtml(existing['簽核狀態'])}）</p>` : '');
    button.hidden = amounts.amount === 0 || Boolean(existing);
  }

  function openSettlementRequest() {
    const amounts = settlementAmounts(latestData);
    if (!amounts || amounts.amount === 0 || typeof root.openPaymentRequestEditor !== 'function') return;
    const activityName = latestData && latestData.activity && latestData.activity.name || state.activityId;
    const refund = amounts.amount > 0;
    // 回沖是匯回公司，填負數；補請是公司補款，填正數。
    root.openPaymentRequestEditor({
      '付款階段': refund ? '回沖' : '零用金請款',
      '金額合計': -amounts.amount,
      '用途說明': `${activityName} 零用金${refund ? '回沖' : '補請'}`,
      '簽核狀態': '待申請'
    });
    // 申請單的編輯表單在款項申請分頁；借用既有的 data-open-tab 導頁。
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.hidden = true;
    jump.dataset.openTab = 'payment_requests';
    document.querySelector('[data-tab-panel="close"]').appendChild(jump);
    jump.click();
    jump.remove();
  }

  const settlementButton = document.querySelector('#openSettlementRequest');
  if (settlementButton) settlementButton.addEventListener('click', openSettlementRequest);

  root.onPaymentRequestsRendered = function () { renderCloseChecklist(); };

  // #155 第 3 項：預算核准後改金額，「備註／價差原因」一定要寫。沿用既有欄位，不存版本。
  let editingBudgetRow = null;
  document.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-budget-line]');
    if (edit) {
      const rows = state.activityBudget && Array.isArray(state.activityBudget.rows) ? state.activityBudget.rows : [];
      editingBudgetRow = rows.find(row => String(row.budget_line_id) === String(edit.dataset.editBudgetLine)) || null;
      markReasonField();
      return;
    }
    if (event.target.closest('#showBudgetEditor')) {
      editingBudgetRow = null;
      markReasonField();
    }
  });

  function budgetApproved() {
    const activity = state.activityBudget && state.activityBudget.activity || {};
    return String(activity.budget_status || '') === '已核准';
  }

  function markReasonField() {
    const note = document.querySelector('#activityBudgetForm [name="note"]');
    if (!note) return;
    const needsReason = budgetApproved();
    note.placeholder = needsReason ? '備註／價差原因（簽呈核准後改金額必填）' : '備註／價差原因';
  }

  function amountChanged(form, row) {
    if (!row) return true; // 核准後新增品項，也算報價變動
    return ['unit_price', 'quantity', 'amount'].some(name => {
      const field = form.querySelector(`[name="${name}"]`);
      return field && Number(field.value) !== Number(row[name]);
    });
  }

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!form || form.id !== 'activityBudgetForm' || !budgetApproved()) return;
    if (!amountChanged(form, editingBudgetRow)) return;
    const note = form.querySelector('[name="note"]');
    const before = String(editingBudgetRow && editingBudgetRow.note || '').trim();
    const after = String(note && note.value || '').trim();
    if (after && after !== before) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const status = document.querySelector('#activityBudgetFormStatus');
    if (status) {
      status.textContent = '預算已核准，改金額要在「備註／價差原因」寫下這次為什麼改。';
      status.className = 'status form-status error';
    }
    if (note) note.focus();
  }, true);

  const previousRender = root.render;
  root.render = function workbenchRender(data) {
    previousRender(data);
    latestData = data;
    renderCloseChecklist();
    markReasonField();
  };
})(typeof window !== 'undefined' ? window : null);
