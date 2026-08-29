const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbyLKDauNZi4zQzztda_agrJF84ILNSL6mXBsTe6e7DUx7dIbNN3GKwSWkDURQjYxkf_aA/exec';
const TOKEN_STORAGE_KEY = 'eventAccountingToken:' + DEFAULT_API_URL;
const state = {
  apiUrl: DEFAULT_API_URL,
  token: '',
  activityId: 'midyear2026',
  activity: {},
  expenses: [],
  editingExpenseId: '',
  backendVersion: '',
  capabilities: []
};
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

function handleExpenseError(err) {
  if (err && err.message === '無權限') {
    requestToken('存取碼不正確，請重新輸入。');
    return;
  }
  setExpenseStatus(err && err.message ? err.message : '儲存失敗', true);
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
  const onMessage = (event) => {
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
      if (action === 'update_expense') {
        const updated = after.expenses.find(row => String(row.expense_id || '') === String(fields.expense_id || ''));
        if (updated && expenseMatches(updated, fields)) return after;
      } else {
        const afterCount = after.expenses.filter(row => expenseMatches(row, fields)).length;
        if (afterCount > beforeCount) return after;
      }
    }
    if (serverResult && !serverResult.ok) throw new Error(serverResult.error || 'GAS 寫入失敗');
    throw new Error('尚未確認寫入結果，請不要重送；先重新載入明細確認');
  } finally {
    window.removeEventListener('message', onMessage);
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
  state.activity = activity;
  state.expenses = expenses;
  state.backendVersion = String(data.backend_version || '');
  state.capabilities = Array.isArray(data.capabilities) ? data.capabilities : [];
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
  setSignedMoneyMetric('#pettyCashRemaining', summary.pettyCashRemaining);

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
  const submitButton = $('#submitExpenseButton');
  submitButton.disabled = true;
  try {
    const expense = formExpense();
    const duplicate = EventAccountingDomain.findDuplicateExpense(state.expenses, expense, state.editingExpenseId);
    if (duplicate) throw new Error('疑似重複支出：已有相同日期、項目與金額的紀錄');

    if (state.editingExpenseId) {
      if (!state.capabilities.includes('update_expense')) {
        throw new Error('目前 GAS 後端尚未更新到支援修改支出的版本，請先更新目前部署。');
      }
      const current = state.expenses.find(row => String(row.expense_id || '') === state.editingExpenseId);
      if (!current) throw new Error('找不到要修改的支出，請重新載入頁面');
      if (EventAccountingDomain.expenseEditableFieldsEqual(current, expense)) {
        setExpenseStatus('沒有需要儲存的變更');
        return;
      }

      setExpenseStatus('正在儲存修改…');
      const confirmed = await apiWrite({ action: 'update_expense', expense_id: state.editingExpenseId, ...expense });
      resetExpenseForm();
      render(confirmed);
      setExpenseStatus('已儲存修改');
      return;
    }

    setExpenseStatus('正在登記支出…');
    const confirmed = await apiWrite({ action: 'add_expense', ...expense });
    resetExpenseForm();
    render(confirmed);
    setExpenseStatus('已登記支出');
  } catch (err) {
    handleExpenseError(err);
  } finally {
    submitButton.disabled = false;
  }
}

function startEditExpense(expenseId) {
  if (!state.capabilities.includes('update_expense')) {
    setExpenseStatus('目前 GAS 後端尚未更新到支援修改支出的版本，請先更新目前部署。', true);
    $('#expenseEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const row = state.expenses.find(expense => String(expense.expense_id || '') === String(expenseId || ''));
  if (!row) {
    setExpenseStatus('找不到要修改的支出，請重新載入頁面', true);
    return;
  }

  state.editingExpenseId = String(row.expense_id || '');
  const form = $('#expenseForm');
  const setFieldValue = (name, value) => {
    const field = form.querySelector(`[name="${name}"]`);
    if (field) field.value = value ?? '';
  };
  setFieldValue('date', row.date);
  setFieldValue('item', row.item);
  setFieldValue('category', row.category);
  setFieldValue('amount', row.amount);
  setFieldValue('payment_method', row.payment_method);
  setFieldValue('payer', row.payer);
  setFieldValue('note', row.note);
  $('#expenseFormTitle').textContent = '修改支出';
  $('#submitExpenseButton').textContent = '儲存修改';
  $('#cancelEdit').hidden = false;
  setExpenseStatus('');
  $('#expenseEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetExpenseForm() {
  state.editingExpenseId = '';
  $('#expenseForm').reset();
  $('#expenseFormTitle').textContent = '新增支出';
  $('#submitExpenseButton').textContent = '登記支出';
  $('#cancelEdit').hidden = true;
}

function formatLocalDateTime(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function safeFileName(value) {
  return String(value || '活動').replace(/[\\/:*?"<>|]/g, '_').trim() || '活動';
}

function settlementItemLabel(row) {
  if (row.payment_method === '個人代墊') {
    const payer = String(row.payer || '').trim();
    return `${row.item}${payer ? `｜${payer}代墊` : '｜個人代墊'}`;
  }
  return `${row.item}｜活動零用金`;
}

function generatePettyCashReport() {
  const button = $('#generatePettyCashReport');
  button.disabled = true;
  setReportStatus('正在產生 Excel…');

  try {
    if (typeof XLSX === 'undefined') throw new Error('Excel 產生工具載入失敗，請重新整理頁面');
    const activity = state.activity || {};
    const applicationDate = String(activity.petty_cash_application_date || '').trim();
    if (!applicationDate) throw new Error('尚未讀到零用金申請日，請先更新 GAS 後端');

    const settlement = EventAccountingDomain.summarizePettyCashSettlement(activity, state.expenses);
    if (settlement.advance === null) throw new Error('尚未登記零用金金額');

    const generatedAt = new Date();
    const rows = [
      ['零用金支出表', '', ''],
      ['活動名稱', activity.name || '', ''],
      ['活動 ID', activity.activity_id || state.activityId, ''],
      ['零用金申請日', applicationDate, ''],
      ['零用金金額', '', settlement.advance],
      ['產生時間', formatLocalDateTime(generatedAt), ''],
      ['', '', ''],
      ['日期', '項目／支付人', '金額'],
      ...settlement.items.map(row => [row.date, settlementItemLabel(row), -row.amount]),
      ['', '', ''],
      ['扣抵合計', '', -settlement.deductionTotal],
      ['需沖銷金額', '', settlement.settlementAmount],
      ['沖銷方向', settlement.settlementAmount >= 0 ? '繳回公司' : '公司補款', '']
    ];

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    sheet['!cols'] = [{ wch: 14 }, { wch: 42 }, { wch: 16 }];

    const signFormat = '+#,##0;-#,##0;0';
    Object.keys(sheet).forEach(address => {
      if (address[0] === '!') return;
      const cell = sheet[address];
      if (address.startsWith('C') && typeof cell.v === 'number') cell.z = signFormat;
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '零用金支出表');
    const stamp = `${generatedAt.getFullYear()}${String(generatedAt.getMonth() + 1).padStart(2, '0')}${String(generatedAt.getDate()).padStart(2, '0')}`;
    const fileName = `${safeFileName(activity.name || state.activityId)}_零用金支出表_${stamp}.xlsx`;
    XLSX.writeFile(workbook, fileName, { compression: true });
    setReportStatus(`Excel 已下載；需沖銷金額 ${signedMoney(settlement.settlementAmount)}`);
  } catch (err) {
    setReportStatus(err && err.message ? err.message : '下載失敗', true);
  } finally {
    button.disabled = false;
  }
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

function setSignedMoneyMetric(selector, value) {
  const el = $(selector);
  el.className = 'value';
  el.textContent = value === null || value === undefined ? '尚未登記' : signedMoney(value);
}

function setStatus(text, error = false) {
  const el = $('#status');
  el.textContent = text;
  el.className = error ? 'status error' : 'status';
}

function setExpenseStatus(text, error = false) {
  const el = $('#expenseStatus');
  el.textContent = text;
  el.className = error ? 'status form-status error' : 'status form-status';
}

function setReportStatus(text, error = false) {
  const el = $('#reportStatus');
  el.textContent = text;
  el.className = error ? 'status form-status error' : 'status form-status';
}

function money(v) {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(Number(v));
}

function signedMoney(v) {
  const number = Number(v);
  if (number > 0) return '+' + money(number);
  return money(number);
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

$('#saveConfig').addEventListener('click', saveConfig);
$('#tokenInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') saveConfig(); });
$('#expenseForm').addEventListener('submit', submitExpense);
$('#cancelEdit').addEventListener('click', () => { resetExpenseForm(); setExpenseStatus(''); });
$('#generatePettyCashReport').addEventListener('click', generatePettyCashReport);
$('#expenseRows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-edit-expense]');
  if (button) startEditExpense(button.dataset.editExpense);
});
loadConfig();