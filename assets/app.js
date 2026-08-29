const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbyLKDauNZi4zQzztda_agrJF84ILNSL6mXBsTe6e7DUx7dIbNN3GKwSWkDURQjYxkf_aA/exec';
const TOKEN_STORAGE_KEY = 'eventAccountingToken:' + DEFAULT_API_URL;
const state = { apiUrl: DEFAULT_API_URL, token: '', activityId: 'midyear2026', expenses: [], editingExpenseId: '' };
const $ = (sel) => document.querySelector(sel);

function loadConfig() {
  const params = new URLSearchParams(location.search);
  state.activityId = params.get('activity_id') || 'midyear2026';
  state.token = sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
  const configured = Boolean(state.token);
  $('#configPanel').hidden = configured;
  $('#appContent').hidden = !configured;
  if (configured) refresh();
}

function saveConfig() {
  const token = $('#tokenInput').value.trim();
  if (!token) return;
  state.token = token;
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  $('#tokenInput').value = '';
  $('#configPanel').hidden = true;
  $('#appContent').hidden = false;
  refresh();
}

function requestToken(message) {
  state.token = '';
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  $('#configPanel').hidden = false;
  $('#appContent').hidden = true;
  const note = $('#configPanel .config-note');
  if (message && note) note.textContent = message;
  $('#tokenInput').focus();
}

function handleError(err) {
  if (err && err.message === '無權限') {
    requestToken('存取碼不正確，請重新輸入。');
    return;
  }
  setStatus(err && err.message ? err.message : '發生錯誤', true);
}

function apiRead(action, args = {}) {
  return new Promise((resolve, reject) => {
    if (!state.apiUrl || !state.token) return reject(new Error('尚未輸入存取碼'));
    const callback = '__eventAccounting_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const params = new URLSearchParams({ action, token: state.token, callback, ...args });
    window[callback] = (result) => {
      cleanup();
      result.ok ? resolve(result.data) : reject(new Error(result.error || '讀取失敗'));
    };
    const cleanup = () => { delete window[callback]; script.remove(); };
    script.onerror = () => { cleanup(); reject(new Error('無法連線到 GAS')); };
    script.src = state.apiUrl + (state.apiUrl.includes('?') ? '&' : '?') + params;
    document.body.appendChild(script);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function expenseMatches(row, expense) {
  return EventAccountingDomain.expenseEditableFieldsEqual(row, expense);
}

async function apiWrite(fields) {
  if (!state.apiUrl || !state.token) throw new Error('尚未輸入存取碼');

  const before = await apiRead('activity', { activity_id: fields.activity_id });
  const action = fields.action;
  const beforeCount = action === 'add_expense'
    ? before.expenses.filter(row => expenseMatches(row, fields)).length
    : 0;

  const iframeName = 'gas-write-' + Date.now();
  const iframe = document.createElement('iframe');
  iframe.name = iframeName;
  iframe.hidden = true;
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = state.apiUrl;
  form.target = iframeName;
  form.hidden = true;
  const values = { ...fields, token: state.token, origin: location.origin };
  Object.entries(values).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.name = name;
    input.value = value ?? '';
    form.appendChild(input);
  });

  document.body.append(iframe, form);
  form.submit();

  try {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await sleep(attempt === 0 ? 500 : 750);
      const after = await apiRead('activity', { activity_id: fields.activity_id });
      if (action === 'update_expense') {
        const updated = after.expenses.find(row => String(row.expense_id || '') === String(fields.expense_id || ''));
        if (updated && expenseMatches(updated, fields)) return after;
      } else {
        const afterCount = after.expenses.filter(row => expenseMatches(row, fields)).length;
        if (afterCount > beforeCount) return after;
      }
    }
    throw new Error('寫入失敗或無法確認結果，請重新載入明細後再決定是否重送');
  } finally {
    form.remove();
    iframe.remove();
  }
}

async function refresh() {
  setStatus('正在讀取活動帳務…');
  try {
    const data = await apiRead('activity', { activity_id: state.activityId });
    render(data);
    setStatus('');
    return data;
  } catch (err) {
    handleError(err);
    throw err;
  }
}

function render(data) {
  const activity = data.activity || {};
  const expenses = data.expenses || [];
  state.expenses = expenses;
  const summary = EventAccountingDomain.summarizeDashboard(activity, expenses);

  $('#activityName').textContent = activity.name || '活動名稱未設定';
  $('#activityMeta').textContent = [
    activity.date ? `活動日期 ${activity.date}` : '活動日期未設定',
    activity.status || '狀態未設定'
  ].join(' · ');

  setMoneyMetric('#budget', summary.budget);
  setMoneyMetric('#actualExpense', summary.actualExpense);
  setBalanceMetric('#budgetRemaining', summary.budgetRemaining);
  setMoneyMetric('#pettyCashAdvance', summary.pettyCashAdvance);
  setMoneyMetric('#pettyCashUsed', summary.pettyCashUsed);
  setBalanceMetric('#pettyCashRemaining', summary.pettyCashRemaining);

  $('#pendingAdvances').innerHTML = summary.pendingAdvances.length
    ? summary.pendingAdvances.map(row => `
      <div class="advance-row"><span>${escapeHtml(row.payer)}</span><strong>${money(row.amount)}</strong></div>
    `).join('')
    : '<div class="empty compact">目前沒有待核銷代墊</div>';

  $('#expenseRows').innerHTML = expenses.length ? expenses.map(r => `
    <tr>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.item)}</td>
      <td>${escapeHtml(r.payment_method)}</td>
      <td>${escapeHtml(r.payer || '—')}</td>
      <td>${escapeHtml(r.reimbursement_status || '—')}</td>
      <td class="num">${money(r.amount)}</td>
      <td><button type="button" class="table-action" data-edit-expense="${escapeHtml(r.expense_id)}">修改</button></td>
    </tr>
  `).join('') : '<tr><td colspan="7" class="empty">目前沒有支出</td></tr>';
}

function formExpense() {
  const form = new FormData($('#expenseForm'));
  return EventAccountingDomain.validateExpense({
    activity_id: state.activityId,
    date: form.get('date'),
    item: form.get('item'),
    category: form.get('category'),
    amount: form.get('amount'),
    payment_method: form.get('payment_method'),
    payer: form.get('payer'),
    note: form.get('note')
  });
}

async function submitExpense(event) {
  event.preventDefault();
  try {
    const expense = formExpense();
    const duplicate = EventAccountingDomain.findDuplicateExpense(state.expenses, expense, state.editingExpenseId);
    if (duplicate) throw new Error('疑似重複支出：已有相同日期、項目與金額的紀錄');

    if (state.editingExpenseId) {
      const current = state.expenses.find(row => String(row.expense_id || '') === state.editingExpenseId);
      if (!current) throw new Error('找不到要修改的支出，請重新載入頁面');
      if (EventAccountingDomain.expenseEditableFieldsEqual(current, expense)) {
        setStatus('沒有需要儲存的變更');
        return;
      }

      setStatus('正在儲存修改…');
      const confirmed = await apiWrite({ action: 'update_expense', expense_id: state.editingExpenseId, ...expense });
      resetExpenseForm();
      render(confirmed);
      setStatus('已更新');
      return;
    }

    setStatus('正在登記支出…');
    const confirmed = await apiWrite({ action: 'add_expense', ...expense });
    resetExpenseForm();
    render(confirmed);
    setStatus('已登記');
  } catch (err) {
    handleError(err);
  }
}

function startEditExpense(expenseId) {
  const row = state.expenses.find(expense => String(expense.expense_id || '') === String(expenseId || ''));
  if (!row) {
    setStatus('找不到要修改的支出，請重新載入頁面', true);
    return;
  }

  state.editingExpenseId = String(row.expense_id || '');
  const form = $('#expenseForm');
  form.elements.date.value = row.date || '';
  form.elements.item.value = row.item || '';
  form.elements.category.value = row.category || '';
  form.elements.amount.value = row.amount || '';
  form.elements.payment_method.value = row.payment_method || '';
  form.elements.payer.value = row.payer || '';
  form.elements.note.value = row.note || '';
  $('#expenseFormTitle').textContent = '修改支出';
  $('#submitExpenseButton').textContent = '儲存修改';
  $('#cancelEdit').hidden = false;
  $('#expenseEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetExpenseForm() {
  state.editingExpenseId = '';
  $('#expenseForm').reset();
  $('#expenseFormTitle').textContent = '新增支出';
  $('#submitExpenseButton').textContent = '登記支出';
  $('#cancelEdit').hidden = true;
}

function setMoneyMetric(selector, value) {
  const el = $(selector);
  el.className = 'value';
  el.textContent = value === null || value === undefined ? '尚未登記' : money(value);
}

function setBalanceMetric(selector, value) {
  const el = $(selector);
  el.className = 'value';
  if (value === null || value === undefined) {
    el.textContent = '尚未登記';
    return;
  }
  if (value < 0) {
    el.textContent = `超出 ${money(Math.abs(value))}`;
    el.classList.add('danger');
    return;
  }
  el.textContent = money(value);
}

function setStatus(text, error = false) {
  const el = $('#status');
  el.textContent = text;
  el.className = error ? 'status error' : 'status';
}

function money(v) {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(Number(v));
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

$('#saveConfig').addEventListener('click', saveConfig);
$('#tokenInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') saveConfig(); });
$('#expenseForm').addEventListener('submit', submitExpense);
$('#cancelEdit').addEventListener('click', () => { resetExpenseForm(); setStatus(''); });
$('#expenseRows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-edit-expense]');
  if (button) startEditExpense(button.dataset.editExpense);
});
loadConfig();
