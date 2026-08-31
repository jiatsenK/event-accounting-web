// Issue #17 frontend compatibility layer. Runs after the inline enhancements in index.html are defined.
document.addEventListener('DOMContentLoaded', () => {
  const reimbursementStatuses = ['待核銷', '已核銷', '已請款', '已支付'];
  state.activityStatusFilter = '全部';

  const switcher = document.querySelector('.activity-switcher');
  if (switcher && !document.querySelector('#activityStatusFilters')) {
    const filters = document.createElement('div');
    filters.id = 'activityStatusFilters';
    filters.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:3px';
    ['全部', '進行中', '已結案'].forEach(status => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.activityStatusFilter = status;
      button.textContent = status;
      button.className = 'secondary';
      button.style.cssText = 'padding:5px 9px;font-size:12px';
      filters.appendChild(button);
    });
    switcher.insertBefore(filters, switcher.querySelector('select'));
  }

  const pettyDownload = document.querySelector('#generatePettyCashReport');
  if (pettyDownload) pettyDownload.textContent = '下載零用金明細';

  const hint = document.querySelector('.inline-hint');
  if (hint) hint.textContent = '直接點表格欄位即可原地修改；核銷狀態也可逐筆調整。完成全部核銷後可一鍵鎖定帳務。';

  const expenseHeading = document.querySelector('[data-tab-panel="expenses"] .section-heading');
  if (expenseHeading && !document.querySelector('#finalizeReimbursements')) {
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    const addButton = document.querySelector('#showExpenseEditor');
    if (addButton && addButton.parentNode === expenseHeading) actions.appendChild(addButton);
    const finalize = document.createElement('button');
    finalize.id = 'finalizeReimbursements';
    finalize.type = 'button';
    finalize.textContent = '一鍵核銷所有內容';
    actions.appendChild(finalize);
    expenseHeading.appendChild(actions);
  }

  function sortedExpenses(expenses) {
    return (Array.isArray(expenses) ? expenses : []).map((row, index) => ({ row, index })).sort((a, b) => {
      const dateOrder = String(a.row.date || '').localeCompare(String(b.row.date || ''));
      return dateOrder || a.index - b.index;
    }).map(entry => entry.row);
  }

  function filteredActivities() {
    const all = Array.isArray(state.activities) ? state.activities : [];
    if (state.activityStatusFilter === '全部') return all;
    return all.filter(activity => String(activity.status || '').trim() === state.activityStatusFilter);
  }

  window.applyActivityStatusFilter = async function applyActivityStatusFilter(status, allowSwitch = true) {
    state.activityStatusFilter = status || '全部';
    document.querySelectorAll('[data-activity-status-filter]').forEach(button => {
      const active = button.dataset.activityStatusFilter === state.activityStatusFilter;
      button.style.background = active ? '#2f4858' : 'white';
      button.style.color = active ? 'white' : '#2f4858';
    });
    const select = document.querySelector('#activitySelector');
    if (!select) return;
    const list = filteredActivities();
    select.innerHTML = list.length ? list.map(activity => {
      const id = String(activity.activity_id || '');
      const suffix = [activity.date, activity.status].filter(Boolean).join(' · ');
      const label = `${activity.name || id}${suffix ? ` (${suffix})` : ''}`;
      return `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`;
    }).join('') : `<option value="">目前沒有${state.activityStatusFilter === '全部' ? '' : state.activityStatusFilter}活動</option>`;
    const currentIncluded = list.some(activity => String(activity.activity_id || '') === String(state.activityId || ''));
    if (currentIncluded) select.value = state.activityId;
    select.disabled = !list.length;
    if (allowSwitch && !currentIncluded && list.length && typeof window.switchActivity === 'function') {
      await window.switchActivity(list[0].activity_id);
    }
  };

  document.querySelector('#activityStatusFilters')?.addEventListener('click', event => {
    const button = event.target.closest('[data-activity-status-filter]');
    if (!button) return;
    window.applyActivityStatusFilter(button.dataset.activityStatusFilter).catch(handleError);
  });

  if (typeof window.loadActivityList === 'function') {
    const originalLoadActivityList = window.loadActivityList;
    window.loadActivityList = async function issue17LoadActivityList(fallbackActivity) {
      await originalLoadActivityList(fallbackActivity);
      await window.applyActivityStatusFilter(state.activityStatusFilter, false);
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
      setInlineExpenseStatus('新版核銷後端尚未部署，暫時不能一鍵核銷。', true);
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
      setInlineExpenseStatus('已完成全部核銷，帳務已鎖定。');
    } catch (err) {
      setInlineExpenseStatus(err && err.message ? err.message : '一鍵核銷失敗', true);
      if (button) button.disabled = false;
    }
  }

  document.querySelector('#finalizeReimbursements')?.addEventListener('click', finalizeAllReimbursements);

  function applyReimbursementLockState() {
    const locked = Boolean(state.activity && state.activity.reimbursement_locked);
    const addButton = document.querySelector('#showExpenseEditor');
    if (addButton) {
      addButton.disabled = locked;
      addButton.title = locked ? '此活動核銷已鎖定' : '';
    }
    const finalize = document.querySelector('#finalizeReimbursements');
    if (finalize) {
      finalize.disabled = locked || !state.capabilities.includes('finalize_reimbursements');
      finalize.textContent = locked ? '核銷已鎖定' : '一鍵核銷所有內容';
      finalize.title = !locked && !state.capabilities.includes('finalize_reimbursements') ? '需先部署新版 GAS 後端' : '';
    }
    const editor = document.querySelector('#expenseEditor');
    if (locked && editor) editor.hidden = true;
    if (typeof window.renderInlineExpenseRows === 'function') window.renderInlineExpenseRows(state.expenses || []);
  }

  const currentRender = window.render;
  if (typeof currentRender === 'function') {
    window.render = function issue17Render(data) {
      currentRender(data);
      applyReimbursementLockState();
      void window.applyActivityStatusFilter(state.activityStatusFilter, false);
    };
  }

  window.applyActivityStatusFilter('全部', false).catch(() => {});
  applyReimbursementLockState();
});