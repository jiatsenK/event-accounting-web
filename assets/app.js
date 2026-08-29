const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycby7m4fJywm-J0Nm3bUtYVgVt2oGOzn-XaE4AvVMDRh-AWMFy6gZY69bZxMnykUE3JNP1Q/exec';
const TOKEN_STORAGE_KEY = 'eventAccountingToken:' + DEFAULT_API_URL;
const state = { apiUrl: DEFAULT_API_URL, token: '', activityId: 'midyear2026' };
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
  return String(row.date || '') === String(expense.date || '') &&
    String(row.item || '').trim() === String(expense.item || '').trim() &&
    Number(row.amount || 0) === Number(expense.amount || 0) &&
    String(row.payment_method || '') === String(expense.payment_method || '') &&
    String(row.payer || '').trim() === String(expense.payer || '').trim() &&
    String(row.note || '').trim() === String(expense.note || '').trim();
}

async function apiWrite(fields) {
  if (!state.apiUrl || !state.token) throw new Error('尚未輸入存取碼');

  const before = await apiRead('activity', { activity_id: fields.activity_id });
  const beforeCount = before.expenses.filter(row => expenseMatches(row, fields)).length;

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
      const afterCount = after.expenses.filter(row => expenseMatches(row, fields)).length;
      if (afterCount > beforeCount) return after;
    }
    throw new Error('尚未確認寫入結果，請重新整理明細後再決定是否重送');
  } finally {
    form.remove();
    iframe.remove();
  }
}

async function refresh() {
  setStatus('讀取中…');
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
  $('#activityName').textContent = data.activity.name || data.activity.activity_id;
  $('#budget').textContent = money(data.activity.budget);
  const total = EventAccountingDomain.summarizeExpenses(data.expenses);
  $('#total').textContent = money(total);
  $('#expenseRows').innerHTML = data.expenses.length ? data.expenses.map(r => `
    <tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.item)}</td><td>${escapeHtml(r.payment_method)}</td><td>${escapeHtml(r.payer || '')}</td><td class="num">${money(r.amount)}</td></tr>
  `).join('') : '<tr><td colspan="5" class="empty">目前沒有支出</td></tr>';
}

async function submitExpense(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const expense = EventAccountingDomain.validateExpense({
      activity_id: state.activityId,
      date: form.get('date'),
      item: form.get('item'),
      amount: form.get('amount'),
      payment_method: form.get('payment_method'),
      payer: form.get('payer'),
      note: form.get('note')
    });
    setStatus('寫入中…');
    const confirmed = await apiWrite({ action: 'add_expense', ...expense });
    event.currentTarget.reset();
    render(confirmed);
    setStatus('已登記');
  } catch (err) {
    handleError(err);
  }
}

function setStatus(text, error = false) {
  const el = $('#status');
  el.textContent = text;
  el.className = error ? 'status error' : 'status';
}

function money(v) {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(Number(v || 0));
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

$('#saveConfig').addEventListener('click', saveConfig);
$('#tokenInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') saveConfig(); });
$('#expenseForm').addEventListener('submit', submitExpense);
loadConfig();
