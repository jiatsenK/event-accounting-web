// Issue #17 frontend compatibility layer. Loaded after accounting-ui.js by the accounting mount.
(function applyIssue17Compatibility() {
  const reimbursementStatuses = ['待核銷', '已核銷', '已請款', '已支付'];

  const oldFilters = document.querySelector('#activityStatusFilters');
  if (oldFilters) oldFilters.remove();

  const pettyDownload = document.querySelector('#generatePettyCashReport');
  if (pettyDownload) pettyDownload.textContent = '下載零用金明細';

  const hint = document.querySelector('.inline-hint');
  if (hint) hint.textContent = '直接點表格欄位即可原地修改；核銷狀態也可逐筆調整。完成全部核銷後可在總覽鎖定帳務。';

  const overviewPanel = document.querySelector('[data-tab-panel="overview"]');
  if (overviewPanel && !document.querySelector('#reimbursementStateBar')) {
    const bar = document.createElement('div');
    bar.id = 'reimbursementStateBar';
    bar.className = 'card';
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 14px;padding:14px 18px';
    bar.innerHTML = '<div><div class="section-label">核銷狀態</div><div id="reimbursementStateText" style="font-size:18px;font-weight:760;margin-top:3px">尚未完成核銷</div><div id="reimbursementStateNote" class="muted" style="margin-top:2px"></div></div><button id="finalizeReimbursements" type="button">完成核銷並鎖定</button>';
    overviewPanel.insertBefore(bar, overviewPanel.firstChild);
  }

  function sortedExpenses(expenses) {
    return (Array.isArray(expenses) ? expenses : []).map((row, index) => ({ row, index })).sort((a, b) => {
      const dateOrder = String(a.row.date || '').localeCompare(String(b.row.date || ''));
      return dateOrder || a.index - b.index;
    }).map(entry => entry.row);
  }

  function renderSimpleActivitySelector() {
    const select = document.querySelector('#activitySelector');
    if (!select) return;
    const list = Array.isArray(state.activities) && state.activities.length
      ? state.activities
      : (state.activity && state.activity.activity_id ? [state.activity] : []);
    select.innerHTML = list.length ? list.map(activity => {
      const id = String(activity.activity_id || '');
      const date = String(activity.date || '').trim();
      const label = `${activity.name || id}${date ? ` (${date})` : ''}`;
      return `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`;
    }).join('') : '<option value="">目前沒有可選活動</option>';
    if (list.some(activity => String(activity.activity_id || '') === String(state.activityId || ''))) select.value = state.activityId;
    select.disabled = list.length <= 1;
  }

  if (typeof window.loadActivityList === 'function') {
    const originalLoadActivityList = window.loadActivityList;
    window.loadActivityList = async function issue17LoadActivityList(fallbackActivity) {
      await originalLoadActivityList(fallbackActivity);
      renderSimpleActivitySelector();
    };
  }

  async function postReimbursementAction(fields, verify) {
    if (!state.apiUrl || !state.token) throw new Error('尚未輸入存取碼');
    const iframeName = 'gas-reimbursement-' + Date.now();
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = state.apiUrl;
    form.target = iframeName;
    form.style.display = 'none';
    form.setAttribute('aria-hidden', 'true');
    const values = { ...fields, token: state.token, origin: location.origin };
    Object.entries(values).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.name = name;
      input.value = value ?? '';
      form.appendChild(input);
    });
    let serverResult = null;
    const onMessage = event => {
      if (event.source !== iframe.contentWindow) return;
      const message = event.data;
      if (!message || message.type !== 'event-accounting-result') return;
      serverResult = message.payload || { ok: false, error: 'GAS 回覆格式錯誤' };
    };
    window.addEventListener('message', onMessage);
    document.body.append(iframe, form);
    form.submit();
    try {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await sleep(attempt === 0 ? 500 : 750);
        if (serverResult && !serverResult.ok) throw new Error(serverResult.error || 'GAS 寫入失敗');
        const after = await apiRead('activity', { activity_id: fields.activity_id });
        if (verify(after)) return after;
      }
      throw new Error('尚未確認寫入結果，請重新整理後確認');
    } finally {
      window.removeEventListener('message', onMessage);
      form.remove();
      iframe.remove();
    }
  }

  if (typeof window.renderInlineExpenseRows === 'function') {
    window.renderInlineExpenseRows = function issue17RenderInlineExpenseRows(expenses) {
      const rows = sortedExpenses(expenses);
      const locked = Boolean(state.activity && state.activity.reimbursement_locked);
      const canStatusEdit = state.capabilities.includes('reimbursement_status_edit') && !locked;
      const tbody = document.querySelector('#expenseRows');
      tbody.innerHTML = rows.length ? rows.map(row => {
        const id = escapeHtml(row.expense_id);
        const editableCell = (field, extra = '') => {
          const value = field === 'amount' ? money(row.amount) : (String(row[field] || '').trim() || '—');
          if (locked) return `<td class="${extra} readonly-cell">${escapeHtml(value)}</td>`;
          return `<td class="${extra}"><button type="button" class="inline-value ${field === 'amount' ? 'num' : ''}" data-inline-edit-expense="${id}" data-inline-edit-field="${field}">${escapeHtml(value)}</button></td>`;
        };
        const statusCell = canStatusEdit
          ? `<td><button type="button" class="inline-value" data-inline-edit-expense="${id}" data-inline-edit-field="reimbursement_status">${escapeHtml(row.reimbursement_status || '—')}</button></td>`
          : `<td class="readonly-cell">${escapeHtml(row.reimbursement_status || '—')}</td>`;
        return `<tr data-expense-id="${id}" data-payment-method="${escapeHtml(row.payment_method)}">${editableCell('date')}${editableCell('item')}${editableCell('category')}${editableCell('budget_item')}${editableCell('payment_method')}${editableCell('payer')}${statusCell}${editableCell('amount','num')}${editableCell('note')}<td></td></tr>`;
      }).join('') : '<tr><td colspan="10" class="empty">目前沒有支出</td></tr>';
      if (typeof window.applyExpenseFilters === 'function') window.applyExpenseFilters();
    };
  }

  if (typeof window.inlineExpenseEditor === 'function') {
    const originalInlineExpenseEditor = window.inlineExpenseEditor;
    window.inlineExpenseEditor = function issue17InlineExpenseEditor(field, expense) {
      if (field === 'reimbursement_status') {
        const current = String(expense.reimbursement_status || '');
        return `<select class="inline-editor" data-inline-field="reimbursement_status">${reimbursementStatuses.map(value => `<option value="${escapeHtml(value)}" ${value === current ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select>`;
      }
      return originalInlineExpenseEditor(field, expense);
    };
  }

  if (typeof window.saveInlineExpense === 'function') {
    const originalSaveInlineExpense = window.saveInlineExpense;
    window.saveInlineExpense = async function issue17SaveInlineExpense(expenseId, field, td) {
      if (field !== 'reimbursement_status') return originalSaveInlineExpense(expenseId, field, td);
      if (state.activity && state.activity.reimbursement_locked) {
        setInlineExpenseStatus('此活動核銷已鎖定，不能再修改。', true);
        return;
      }
      if (!state.capabilities.includes('reimbursement_status_edit')) {
        setInlineExpenseStatus('新版核銷後端尚未部署，暫時不能修改核銷狀態。', true);
        return;
      }
      const editor = td && td.querySelector('[data-inline-field="reimbursement_status"]');
      if (!editor) return;
      const status = String(editor.value || '').trim();
      setInlineExpenseStatus('正在更新核銷狀態…');
      try {
        const confirmed = await postReimbursementAction({
          action: 'update_reimbursement_status',
          activity_id: state.activityId,
          expense_id: expenseId,
          reimbursement_status: status
        }, after => {
          const row = (after.expenses || []).find(item => String(item.expense_id || '') === String(expenseId || ''));
          return row && String(row.reimbursement_status || '') === status;
        });
        render(confirmed);
        setInlineExpenseStatus('核銷狀態已更新');
      } catch (err) {
        setInlineExpenseStatus(err && err.message ? err.message : '核銷狀態更新失敗', true);
      }
    };
  }

  async function finalizeAllReimbursements() {
    if (state.activity && state.activity.reimbursement_locked) return;
    if (!state.capabilities.includes('finalize_reimbursements')) {
      setInlineExpenseStatus('新版核銷後端尚未部署，暫時不能完成核銷。', true);
      return;
    }
    const pending = (state.expenses || []).filter(row => String(row.reimbursement_status || '') === '待核銷');
    const message = pending.length
      ? `將 ${pending.length} 筆待核銷改為「已核銷」，並永久鎖定此活動帳務。確定繼續？`
      : '目前沒有待核銷項目。執行後仍會永久鎖定此活動帳務。確定繼續？';
    if (!window.confirm(message)) return;
    const button = document.querySelector('#finalizeReimbursements');
    if (button) button.disabled = true;
    setInlineExpenseStatus('正在完成核銷並鎖定帳務…');
    try {
      const confirmed = await postReimbursementAction({ action: 'finalize_reimbursements', activity_id: state.activityId }, after => Boolean(after.activity && after.activity.reimbursement_locked));
      render(confirmed);
      setInlineExpenseStatus('已核銷完成，帳務已鎖定。');
    } catch (err) {
      setInlineExpenseStatus(err && err.message ? err.message : '完成核銷失敗', true);
      if (button) button.disabled = false;
    }
  }

  document.querySelector('#finalizeReimbursements')?.addEventListener('click', finalizeAllReimbursements);

  function renderAdvanceCardForState() {
    const container = document.querySelector('#pendingAdvances');
    if (!container) return;
    const card = container.closest('.card');
    const heading = card && card.querySelector('.section-heading');
    const title = heading && heading.querySelector('h2');
    const subtitle = heading && heading.querySelector('.muted');
    const totalLabel = card && card.querySelector('.pending-total .label');
    const totalValue = document.querySelector('#pendingAdvanceTotal');
    const locked = Boolean(state.activity && state.activity.reimbursement_locked);
    if (!locked) {
      if (title) title.textContent = '待核銷代墊';
      if (subtitle) subtitle.textContent = '尚未完成核銷的個人代墊';
      if (totalLabel) totalLabel.textContent = '待核銷合計';
      return;
    }
    if (title) title.textContent = '已核銷代墊';
    if (subtitle) subtitle.textContent = '本活動已完成核銷的個人代墊';
    if (totalLabel) totalLabel.textContent = '代墊核銷合計';
    const groups = new Map();
    (state.expenses || []).filter(row => String(row.payment_method || '') === '個人代墊').forEach(row => {
      const payer = String(row.payer || '').trim() || '未填支付人';
      groups.set(payer, (groups.get(payer) || 0) + Number(row.amount || 0));
    });
    const total = Array.from(groups.values()).reduce((sum, amount) => sum + amount, 0);
    if (totalValue) setMoneyMetric('#pendingAdvanceTotal', total);
    container.innerHTML = groups.size
      ? Array.from(groups, ([payer, amount]) => `<div class="advance-row"><span>${escapeHtml(payer)}</span><strong>${money(amount)}</strong></div>`).join('')
      : '<div class="empty compact">本活動沒有個人代墊</div>';
  }

  function applyReimbursementLockState() {
    const locked = Boolean(state.activity && state.activity.reimbursement_locked);
    const addButton = document.querySelector('#showExpenseEditor');
    if (addButton) {
      addButton.disabled = locked;
      addButton.title = locked ? '此活動核銷已鎖定' : '';
    }
    const stateText = document.querySelector('#reimbursementStateText');
    const stateNote = document.querySelector('#reimbursementStateNote');
    const finalize = document.querySelector('#finalizeReimbursements');
    if (locked) {
      if (stateText) stateText.textContent = '已核銷完成';
      if (stateNote) stateNote.textContent = state.activity.reimbursement_locked_at ? `帳務已鎖定：${state.activity.reimbursement_locked_at}` : '帳務已鎖定，支出資料不可再修改。';
      if (finalize) {
        finalize.disabled = true;
        finalize.textContent = '已核銷完成';
        finalize.title = '此活動帳務已鎖定';
      }
    } else {
      if (stateText) stateText.textContent = '尚未完成核銷';
      if (stateNote) stateNote.textContent = '確認所有核銷狀態後，再完成核銷並鎖定帳務。';
      if (finalize) {
        finalize.disabled = !state.capabilities.includes('finalize_reimbursements');
        finalize.textContent = '完成核銷並鎖定';
        finalize.title = !state.capabilities.includes('finalize_reimbursements') ? '需先部署新版 GAS 後端' : '';
      }
    }
    const editor = document.querySelector('#expenseEditor');
    if (locked && editor) editor.hidden = true;
    if (typeof window.renderInlineExpenseRows === 'function') window.renderInlineExpenseRows(state.expenses || []);
    renderAdvanceCardForState();
  }

  if (typeof window.buildAllocationSheet === 'function') {
    const originalBuildAllocationSheet = window.buildAllocationSheet;
    window.buildAllocationSheet = function issue17BuildAllocationSheet(...args) {
      const sheet = originalBuildAllocationSheet(...args);
      if (sheet && sheet.pageSetup) {
        sheet.pageSetup.fitToPage = true;
        sheet.pageSetup.fitToWidth = 1;
        sheet.pageSetup.fitToHeight = 0;
      }
      return sheet;
    };
  }

  const currentRender = window.render;
  if (typeof currentRender === 'function') {
    window.render = function issue17Render(data) {
      currentRender(data);
      renderSimpleActivitySelector();
      applyReimbursementLockState();
    };
  }

  renderSimpleActivitySelector();
  applyReimbursementLockState();
})();
