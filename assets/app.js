const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbzUzlcic8y8OhaxncTt8gc33TAsyemOy-3ezgUSelHeUtH85kY-dJ1tv5haD6Md6LIsQA/exec';
const state = { apiUrl: DEFAULT_API_URL, token: '', activityId: 'midyear2026' };
const $ = (sel) => document.querySelector(sel);

function loadConfig() {
  const params = new URLSearchParams(location.search);
  state.activityId = params.get('activity_id') || 'midyear2026';
  state.token = sessionStorage.getItem('eventAccountingToken') || '';
  const configured = Boolean(state.token);
  $('#configPanel').hidden = configured;
  $('#appContent').hidden = !configured;
  if (configured) refresh();
}

function saveConfig() {
  const token = $('#tokenInput').value.trim();
  if (!token) return;
  state.token = token;
  sessionStorage.setItem('eventAccountingToken', token);
  $('#tokenInput').value = '';
  $('#configPanel').hidden = true;
  $('#appContent').hidden = false;
  refresh();
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

function apiWrite(fields) {
  return new Promise((resolve, reject) => {
    if (!state.apiUrl || !state.token) return reject(new Error('尚未輸入存取碼'));
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
    const timer = setTimeout(() => finish(new Error('GAS 寫入逾時')), 15000);
    function onMessage(event) {
      if (event.source !== iframe.contentWindow) return;
      if (!event.data || event.data.type !== 'event-accounting-result') return;
      const result = event.data.payload;
      result.ok ? finish(null, result.data) : finish(new Error(result.error || '寫入失敗'));
    }
    function finish(err, data) {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      form.remove();
      iframe.remove();
      err ? reject(err) : resolve(data);
    }
    window.addEventListener('message', onMessage);
    document.body.append(iframe, form);
    form.submit();
  });
}

async function refresh() {
  setStatus('讀取中…');
  try {
    const data = await apiRead('activity', { activity_id: state.activityId });
    render(data);
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
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
    await apiWrite({ action: 'add_expense', ...expense });
    event.currentTarget.reset();
    await refresh();
    setStatus('已登記');
  } catch (err) {
    setStatus(err.message, true);
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
