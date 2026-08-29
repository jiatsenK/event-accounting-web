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
renderBudgetOptions(activity);
renderBudgetBreakdown(summary.budgetBreakdown);
$('#pendingAdvances').innerHTML = summary.pendingAdvances.length
? summary.pendingAdvances.map(row => `
<div class="advance-row"><span>${escapeHtml(row.payer)}</span><strong>${money(row.amount)}</strong></div>
`).join('')
: '<div class="empty compact">目前沒有待核銷代墊</div>';
$('#expenseRows').innerHTML = expenses.length ? expenses.map(r => `
<tr>
<td>${escapeHtml(r.date)}</td>
<td>${escapeHtml(r.item)}</td>
<td>${escapeHtml(r.budget_item || '尚未歸類')}</td>
<td>${escapeHtml(r.payment_method)}</td>
<td>${escapeHtml(r.payer || '—')}</td>
<td>${escapeHtml(r.reimbursement_status || '—')}</td>
<td class="num">${money(r.amount)}</td>
<td><button type="button" class="table-action" data-edit-expense="${escapeHtml(r.expense_id)}">修改</button></td>
</tr>
`).join('') : '<tr><td colspan="8" class="empty">目前沒有支出</td></tr>';
}
function renderBudgetOptions(activity) {
const select = $('#expenseForm').querySelector('[name="budget_item"]');
if (!select) return;
const current = select.value;
const items = Array.isArray(activity && activity.budget_items) ? activity.budget_items : [];
select.innerHTML = '<option value="">選擇預算項目</option>' + items.map(item =>
`<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`
).join('');
if (items.some(item => item.name === current)) select.value = current;
}
function renderBudgetBreakdown(breakdown) {
const data = breakdown || { items: [], unassignedTotal: 0 };
const items = Array.isArray(data.items) ? data.items : [];
const over = items.filter(item => Number(item.remaining) < 0);
const alertParts = over.map(item => `${item.name}超出 ${money(Math.abs(item.remaining))}`);
if (Number(data.unassignedTotal || 0) > 0) alertParts.push(`尚未歸類 ${money(data.unassignedTotal)}`);
const alert = $('#budgetAlert');
if (!items.length) {
alert.textContent = '尚未設定預算項目';
alert.className = 'budget-alert warning';
} else if (alertParts.length) {
alert.textContent = `目前超支來源：${alertParts.join('、')}`;
alert.className = 'budget-alert danger';
} else {
alert.textContent = '目前沒有預算項目超支';
alert.className = 'budget-alert ok';
}
$('#budgetRows').innerHTML = items.length ? items.map(item => {
const remaining = Number(item.remaining);
const status = remaining < 0
? `<span class="budget-over">超出 ${money(Math.abs(remaining))}</span>`
: remaining > 0
? `<span class="budget-under">剩 ${money(remaining)}</span>`
: '<span class="budget-even">剛好</span>';
return `<tr><td>${escapeHtml(item.name)}</td><td class="num">${money(item.budget)}</td><td class="num">${money(item.actual)}</td><td class="num">${status}</td></tr>`;
}).join('') : '<tr><td colspan="4" class="empty">尚未設定預算項目</td></tr>';
}
function formExpense() {
const form = new FormData($('#expenseForm'));
return EventAccountingDomain.validateExpense({
activity_id: state.activityId,
date: form.get('date'),
item: form.get('item'),
category: form.get('category'),
budget_item: form.get('budget_item'),
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
setFieldValue('budget_item', row.budget_item);
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
function safeFileName(value) {
return String(value || '活動').replace(/[\\/:*?"<>|]/g, '_').trim() || '活動';
}
function parseReportDate(value) {
const text = String(value || '').trim();
const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : text;
}
function reportNote(row) {
const parts = [];
if (row.payment_method === '個人代墊' && row.payer) parts.push(`${row.payer}代墊`);
if (row.note) parts.push(row.note);
return parts.join('；');
}
function reportCategory(row) {
return String(row.category || row.budget_item || '').trim();
}
function downloadBuffer(buffer, fileName) {
const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = fileName;
link.style.display = 'none';
document.body.appendChild(link);
link.click();
link.remove();
setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function generatePettyCashReport() {
const button = $('#generatePettyCashReport');
button.disabled = true;
setReportStatus('正在產生 Excel…');
try {
if (typeof ExcelJS === 'undefined') throw new Error('Excel 產生工具載入失敗，請重新整理頁面');
const activity = state.activity || {};
const applicationDate = String(activity.petty_cash_application_date || '').trim();
if (!applicationDate) throw new Error('尚未讀到零用金申請日，請先更新 GAS 後端');
const settlement = EventAccountingDomain.summarizePettyCashSettlement(activity, state.expenses);
if (settlement.advance === null) throw new Error('尚未登記零用金金額');
const deductions = settlement.items.slice().sort((a, b) => {
const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
return dateCompare || String(a.item || '').localeCompare(String(b.item || ''));
});
const workbook = new ExcelJS.Workbook();
workbook.creator = 'event-accounting';
workbook.created = new Date();
const sheet = workbook.addWorksheet('零用金費用', {
views: [{ showGridLines: false }],
pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
});
sheet.mergeCells('A1:K1');
const title = sheet.getCell('A1');
title.value = `${activity.name || state.activityId}零用金費用明細`;
title.font = { name: 'Microsoft JhengHei', size: 22, bold: true };
title.alignment = { horizontal: 'center', vertical: 'middle' };
sheet.getRow(1).height = 54;
const headers = ['編號', '日期', '抬頭', '廠商統編', '項目', '發票號碼', '支付金額', '收入金額', '結餘', '分類', '備註'];
const dataRows = [];
const formulas = [];
let balance = settlement.advance;
dataRows.push(['', parseReportDate(applicationDate), '零用金請款', '', '', '', '', settlement.advance, balance, '', '活動零用金暫支']);
formulas.push({ row: 3, formula: 'H3-G3', result: balance });
deductions.forEach((row, index) => {
balance -= row.amount;
const excelRow = 4 + index;
dataRows.push([
index + 1,
parseReportDate(row.date),
row.vendor || row.item,
String(row.tax_id || ''),
row.item,
String(row.invoice_no || ''),
row.amount,
'',
balance,
reportCategory(row),
reportNote(row)
]);
formulas.push({ row: excelRow, formula: `I${excelRow - 1}-G${excelRow}+H${excelRow}`, result: balance });
});
const finalRowNumber = 4 + deductions.length;
if (settlement.settlementAmount > 0) {
dataRows.push(['', '', '零用金匯回', '', '', '', settlement.settlementAmount, '', 0, '', '']);
formulas.push({ row: finalRowNumber, formula: `I${finalRowNumber - 1}-G${finalRowNumber}+H${finalRowNumber}`, result: 0 });
} else if (settlement.settlementAmount < 0) {
dataRows.push(['', '', '公司補款', '', '', '', '', Math.abs(settlement.settlementAmount), 0, '', '']);
formulas.push({ row: finalRowNumber, formula: `I${finalRowNumber - 1}-G${finalRowNumber}+H${finalRowNumber}`, result: 0 });
} else {
dataRows.push(['', '', '沖銷完成', '', '', '', '', '', 0, '', '']);
formulas.push({ row: finalRowNumber, formula: `I${finalRowNumber - 1}`, result: 0 });
}
sheet.addTable({
name: 'PettyCashTable',
ref: 'A2',
headerRow: true,
totalsRow: false,
style: { theme: 'TableStyleLight8', showRowStripes: true, showFirstColumn: false, showLastColumn: false },
columns: headers.map(name => ({ name })),
rows: dataRows
});
formulas.forEach(entry => {
sheet.getCell(`I${entry.row}`).value = { formula: entry.formula, result: entry.result };
});
const widths = [9, 17, 45, 12, 18, 16, 15, 15, 15, 20, 30];
widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
for (let rowIndex = 2; rowIndex <= finalRowNumber; rowIndex += 1) {
const row = sheet.getRow(rowIndex);
row.height = 30;
row.font = { name: 'Microsoft JhengHei', size: 16 };
row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
}
sheet.getRow(2).font = { name: 'Microsoft JhengHei', size: 16, bold: true };
sheet.getColumn(2).numFmt = 'yyyy/mm/dd';
['G', 'H', 'I'].forEach(column => { sheet.getColumn(column).numFmt = '#,##0;[Red](#,##0);-'; });
const categories = new Map();
deductions.forEach(row => {
const name = reportCategory(row) || '未分類';
categories.set(name, (categories.get(name) || 0) + row.amount);
});
sheet.getCell('O2').value = '分類名稱';
sheet.getCell('P2').value = '小計金額';
sheet.getRow(2).getCell(15).font = { name: 'Microsoft JhengHei', size: 12, bold: true };
sheet.getRow(2).getCell(16).font = { name: 'Microsoft JhengHei', size: 12, bold: true };
let categoryRow = 3;
categories.forEach((amount, name) => {
sheet.getCell(`O${categoryRow}`).value = name;
sheet.getCell(`P${categoryRow}`).value = amount;
categoryRow += 1;
});
sheet.getCell(`O${categoryRow}`).value = '總額';
sheet.getCell(`P${categoryRow}`).value = settlement.deductionTotal;
sheet.getCell(`P${categoryRow}`).font = { name: 'Microsoft JhengHei', size: 12, bold: true };
sheet.getColumn(15).width = 24;
sheet.getColumn(16).width = 16;
sheet.getColumn(16).numFmt = '#,##0;[Red](#,##0);-';
for (let r = 2; r <= categoryRow; r += 1) {
for (let c = 15; c <= 16; c += 1) {
const cell = sheet.getCell(r, c);
cell.font = { name: 'Microsoft JhengHei', size: 12, bold: r === 2 || r === categoryRow };
cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
cell.border = {
top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }
};
}
}
sheet.pageSetup.printArea = `A1:K${finalRowNumber}`;
sheet.headerFooter.oddFooter = `&L零用金申請日：${applicationDate}&R需沖銷：${signedMoney(settlement.settlementAmount)}`;
const buffer = await workbook.xlsx.writeBuffer();
const fileName = `${safeFileName(activity.name || state.activityId)}_零用金費用明細.xlsx`;
downloadBuffer(buffer, fileName);
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
