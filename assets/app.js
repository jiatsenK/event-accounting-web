const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbyLKDauNZi4zQzztda_agrJF84ILNSL6mXBsTe6e7DUx7dIbNN3GKwSWkDURQjYxkf_aA/exec';
const TOKEN_STORAGE_KEY = 'eventAccountingToken:' + DEFAULT_API_URL;
const state = {
  apiUrl: DEFAULT_API_URL,
  token: '',
  activityId: 'midyear2026',
  activity: {},
  allocation: null,
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
  state.allocation = data.allocation || null;
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

function reportDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.replace(/-/g, '/') : text;
}

function reportNote(row) {
  if (row.payment_method !== '個人代墊') return '';
  const payer = String(row.payer || '').trim();
  return payer ? `${payer}代墊` : '個人代墊';
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

function applyLedgerRowStyle(row) {
  row.height = 24;
  row.font = { name: 'Microsoft JhengHei', size: 11 };
  row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  for (let c = 1; c <= 11; c += 1) {
    row.getCell(c).border = {
      top: { style: 'thin', color: { argb: 'FFB7B7B7' } },
      bottom: { style: 'thin', color: { argb: 'FFB7B7B7' } },
      left: { style: 'thin', color: { argb: 'FFB7B7B7' } },
      right: { style: 'thin', color: { argb: 'FFB7B7B7' } }
    };
  }
}

function buildPettyCashSheet(workbook, activity, expenses, options = {}) {
  const applicationDate = String(activity && activity.petty_cash_application_date || '').trim();
  if (!applicationDate) throw new Error('尚未讀到零用金申請日，請先更新 GAS 後端');
  const settlement = EventAccountingDomain.summarizePettyCashSettlement(activity, expenses);
  if (settlement.advance === null) throw new Error('尚未登記零用金金額');
  const deductions = settlement.items.slice().sort((a, b) => {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
    return dateCompare || String(a.item || '').localeCompare(String(b.item || ''));
  });
  const sheetName = options.sheetName || '零用金費用';
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      verticalCentered: false,
      margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }
    }
  });

  sheet.mergeCells('A1:I1');
  const title = sheet.getCell('A1');
  title.value = `${activity.name || state.activityId}零用金費用明細`;
  title.font = { name: 'Microsoft JhengHei', size: 18, bold: true };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 36;

  const headers = ['編號', '日期', '抬頭', '廠商統編', '項目', '發票號碼', '支付金額', '收入金額', '結餘', '分類', '備註'];
  const headerRow = sheet.getRow(2);
  headers.forEach((header, index) => { headerRow.getCell(index + 1).value = header; });
  applyLedgerRowStyle(headerRow);
  headerRow.font = { name: 'Microsoft JhengHei', size: 11, bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };

  const firstDataRow = 3;
  const first = sheet.getRow(firstDataRow);
  first.values = ['', reportDate(applicationDate), '零用金請款', '', '', '', 0, settlement.advance, '', '', ''];
  first.getCell(9).value = { formula: `H${firstDataRow}-G${firstDataRow}`, result: settlement.advance };
  applyLedgerRowStyle(first);

  let runningBalance = settlement.advance;
  deductions.forEach((row, index) => {
    const rowNumber = firstDataRow + 1 + index;
    runningBalance -= row.amount;
    const excelRow = sheet.getRow(rowNumber);
    excelRow.values = [
      index + 1,
      reportDate(row.date),
      row.vendor || row.item,
      String(row.tax_id || ''),
      row.item,
      String(row.invoice_no || ''),
      row.amount,
      0,
      runningBalance,
      reportCategory(row),
      reportNote(row)
    ];
    excelRow.getCell(9).value = { formula: `I${rowNumber - 1}-G${rowNumber}+H${rowNumber}`, result: runningBalance };
    applyLedgerRowStyle(excelRow);
  });

  const finalRowNumber = firstDataRow + 1 + deductions.length;
  const finalRow = sheet.getRow(finalRowNumber);
  if (settlement.settlementAmount > 0) {
    finalRow.values = ['', '', '零用金匯回', '', '', '', settlement.settlementAmount, 0, 0, '', ''];
  } else if (settlement.settlementAmount < 0) {
    finalRow.values = ['', '', '公司補款', '', '', '', 0, Math.abs(settlement.settlementAmount), 0, '', ''];
  } else {
    finalRow.values = ['', '', '沖銷完成', '', '', '', 0, 0, 0, '', ''];
  }
  finalRow.getCell(9).value = { formula: `I${finalRowNumber - 1}-G${finalRowNumber}+H${finalRowNumber}`, result: 0 };
  applyLedgerRowStyle(finalRow);
  finalRow.font = { name: 'Microsoft JhengHei', size: 11, bold: true };

  const lastExpenseRow = finalRowNumber - 1;
  if (lastExpenseRow >= 3) {
    for (let column = 1; column <= 9; column += 1) {
      const cell = sheet.getRow(lastExpenseRow).getCell(column);
      cell.border = { ...(cell.border || {}), bottom: { style: 'double', color: { argb: 'FF000000' } } };
    }
  }

  const widths = [7, 12, 26, 12, 20, 15, 13, 13, 13, 15, 18];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  ['G', 'H', 'I'].forEach(column => { sheet.getColumn(column).numFmt = '#,##0;[Red](#,##0);0'; });
  sheet.autoFilter = { from: 'A2', to: `K${finalRowNumber}` };

  const categories = new Map();
  deductions.forEach(row => {
    const name = reportCategory(row) || '未分類';
    categories.set(name, (categories.get(name) || 0) + row.amount);
  });
  sheet.getCell('O2').value = '分類名稱';
  sheet.getCell('P2').value = '小計金額';
  let categoryRow = 3;
  categories.forEach((amount, name) => {
    sheet.getCell(`O${categoryRow}`).value = name;
    sheet.getCell(`P${categoryRow}`).value = amount;
    categoryRow += 1;
  });
  sheet.getCell(`O${categoryRow}`).value = '總額';
  sheet.getCell(`P${categoryRow}`).value = settlement.deductionTotal;
  sheet.getColumn(15).width = 24;
  sheet.getColumn(16).width = 16;
  sheet.getColumn(16).numFmt = '#,##0;[Red](#,##0);-';

  const dashboard = EventAccountingDomain.summarizeDashboard(activity, expenses);
  const numberText = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
  const summaryRow1 = finalRowNumber + 2;
  const summaryRow2 = finalRowNumber + 3;
  sheet.mergeCells(`A${summaryRow1}:I${summaryRow1}`);
  sheet.getCell(`A${summaryRow1}`).value = `${activity.name || state.activityId}-總計支出總額：$${numberText(dashboard.actualExpense)}元整，費用明細詳附件。`;
  sheet.mergeCells(`A${summaryRow2}:I${summaryRow2}`);
  if (settlement.settlementAmount > 0) {
    sheet.getCell(`A${summaryRow2}`).value = `費用支付說明：暫支撥款$${numberText(settlement.advance)}元整-支付金額$${numberText(settlement.deductionTotal)}元=$${numberText(settlement.settlementAmount)}元整(回沖款項)`;
  } else if (settlement.settlementAmount < 0) {
    sheet.getCell(`A${summaryRow2}`).value = `費用支付說明：支付金額$${numberText(settlement.deductionTotal)}元整-暫支撥款$${numberText(settlement.advance)}元=$${numberText(Math.abs(settlement.settlementAmount))}元整(補款款項)`;
  } else {
    sheet.getCell(`A${summaryRow2}`).value = `費用支付說明：暫支撥款$${numberText(settlement.advance)}元整-支付金額$${numberText(settlement.deductionTotal)}元=$0元整(無需沖銷)`;
  }
  [summaryRow1, summaryRow2].forEach((rowNumber, index) => {
    const cell = sheet.getCell(`A${rowNumber}`);
    cell.font = { name: 'Microsoft JhengHei', size: 11, bold: index === 0 };
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    sheet.getRow(rowNumber).height = 28;
  });

  sheet.pageSetup.printArea = `A1:I${summaryRow2}`;
  sheet.pageSetup.printTitlesRow = '1:2';
  sheet.headerFooter.oddFooter = `&L零用金申請日：${applicationDate}&R需沖銷：${signedMoney(settlement.settlementAmount)}`;
  return { sheet, settlement, finalRowNumber, summaryRow2 };
}

function addSheetTitle(sheet, titleText, lastColumn) {
  sheet.mergeCells(1, 1, 1, lastColumn);
  const cell = sheet.getCell(1, 1);
  cell.value = titleText;
  cell.font = { name: 'Microsoft JhengHei', size: 16, bold: true };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 32;
}

function applyTableHeader(row, columns) {
  columns.forEach((text, index) => { row.getCell(index + 1).value = text; });
  row.font = { name: 'Microsoft JhengHei', size: 11, bold: true };
  row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
  row.height = 24;
  columns.forEach((_, index) => {
    row.getCell(index + 1).border = {
      top: { style: 'thin', color: { argb: 'FFB7B7B7' } }, bottom: { style: 'thin', color: { argb: 'FFB7B7B7' } },
      left: { style: 'thin', color: { argb: 'FFB7B7B7' } }, right: { style: 'thin', color: { argb: 'FFB7B7B7' } }
    };
  });
}

function applySimpleRow(row, columnCount) {
  row.font = { name: 'Microsoft JhengHei', size: 11 };
  row.alignment = { vertical: 'middle', wrapText: true };
  for (let c = 1; c <= columnCount; c += 1) {
    row.getCell(c).border = {
      top: { style: 'thin', color: { argb: 'FFD6D6D6' } }, bottom: { style: 'thin', color: { argb: 'FFD6D6D6' } },
      left: { style: 'thin', color: { argb: 'FFD6D6D6' } }, right: { style: 'thin', color: { argb: 'FFD6D6D6' } }
    };
  }
}

function createWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'event-accounting';
  workbook.created = new Date();
  return workbook;
}

function paymentExplanation(row) {
  if (row.payment_method === '公司轉帳') return row.reimbursement_status || '公司付款';
  if (row.payment_method === '活動零用金') return '活動零用金支付';
  if (row.payment_method === '個人代墊') {
    const payer = String(row.payer || '').trim() || '個人';
    return `${payer}代墊${row.reimbursement_status ? `／${row.reimbursement_status}` : ''}`;
  }
  return row.reimbursement_status || '';
}

function buildOverviewSheet(workbook, activity, expenses) {
  const sheet = workbook.addWorksheet('核銷總覽', { views: [{ showGridLines: false }] });
  const payment = EventAccountingDomain.summarizePaymentMethods(expenses);
  const claim = EventAccountingDomain.summarizeCurrentClaim(expenses);
  addSheetTitle(sheet, `${activity.name || state.activityId}｜核銷總覽`, 8);
  const summary = [
    ['活動總支出', claim.actualTotal],
    ['已另行提報', claim.alreadySubmittedTotal],
    ['本次請款', claim.currentClaimTotal]
  ];
  payment.items.forEach(item => summary.push([`${item.payment_method}小計`, item.amount]));
  summary.forEach((entry, index) => {
    const row = sheet.getRow(3 + index);
    row.values = [entry[0], entry[1]];
    row.getCell(1).font = { name: 'Microsoft JhengHei', size: 11, bold: true };
    row.getCell(2).font = { name: 'Microsoft JhengHei', size: 11 };
    row.getCell(2).numFmt = '#,##0';
  });
  const headerRowNumber = 4 + summary.length;
  const headers = ['項次', '廠商', '項目', '實際金額', '支付方式', '支付說明', '核銷狀態', '本次請款'];
  applyTableHeader(sheet.getRow(headerRowNumber), headers);
  expenses.forEach((row, index) => {
    const excelRow = sheet.getRow(headerRowNumber + 1 + index);
    excelRow.values = [
      index + 1, row.vendor || '', row.item || '', Number(row.amount), row.payment_method || '', paymentExplanation(row),
      row.reimbursement_status || '', EventAccountingDomain.isAlreadySubmittedExpense(row) ? '否（已另行提報）' : '是'
    ];
    applySimpleRow(excelRow, headers.length);
    excelRow.getCell(4).numFmt = '#,##0';
  });
  [7, 25, 34, 14, 15, 24, 14, 18].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.freezePanes = { ySplit: headerRowNumber };
  return sheet;
}

function buildBudgetSheet(workbook, activity, expenses) {
  const sheet = workbook.addWorksheet('預算與結算', { views: [{ showGridLines: false }] });
  const breakdown = EventAccountingDomain.summarizeBudgetBreakdown(activity, expenses);
  addSheetTitle(sheet, `${activity.name || state.activityId}｜預算與結算`, 5);
  const headers = ['預算項目', '核准預算', '實際支出', '差異', '結果'];
  applyTableHeader(sheet.getRow(3), headers);
  let rowNumber = 4;
  breakdown.items.forEach(item => {
    const row = sheet.getRow(rowNumber++);
    row.values = [item.name, item.budget, item.actual, item.budget - item.actual, item.actual > item.budget ? '超支' : item.actual < item.budget ? '節省' : '剛好'];
    applySimpleRow(row, headers.length);
  });
  if (breakdown.unassignedTotal > 0) {
    const row = sheet.getRow(rowNumber++);
    row.values = ['尚未歸類', 0, breakdown.unassignedTotal, -breakdown.unassignedTotal, '超支'];
    applySimpleRow(row, headers.length);
  }
  const totalBudget = activity.budget == null ? breakdown.totalBudget : Number(activity.budget);
  const total = sheet.getRow(rowNumber);
  total.values = ['合計', totalBudget, breakdown.totalActual, totalBudget - breakdown.totalActual, breakdown.totalActual > totalBudget ? '超支' : breakdown.totalActual < totalBudget ? '節省' : '剛好'];
  applySimpleRow(total, headers.length);
  total.font = { name: 'Microsoft JhengHei', size: 11, bold: true };
  ['B', 'C', 'D'].forEach(col => { sheet.getColumn(col).numFmt = '#,##0;[Red](#,##0);0'; });
  [24, 16, 16, 16, 14].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  return sheet;
}

function buildInvoiceSheet(workbook, activity, expenses) {
  const sheet = workbook.addWorksheet('核銷憑證', { views: [{ showGridLines: false }] });
  addSheetTitle(sheet, `${activity.name || state.activityId}｜核銷憑證`, 12);
  const headers = ['項次', '憑證編號', '憑證日期', '廠商', '廠商統編', '憑證類別', '未稅額', '稅額', '憑證金額', '項目', '核銷狀態', '本次請款'];
  applyTableHeader(sheet.getRow(3), headers);
  expenses.forEach((row, index) => {
    const excelRow = sheet.getRow(4 + index);
    excelRow.values = [
      index + 1,
      row.invoice_no || '',
      reportDate(row.invoice_date || ''),
      row.vendor || '',
      String(row.tax_id || ''),
      row.invoice_type || '',
      row.net_amount == null ? '' : Number(row.net_amount),
      row.tax_amount == null ? '' : Number(row.tax_amount),
      row.invoice_amount == null ? Number(row.amount) : Number(row.invoice_amount),
      row.item || '',
      row.reimbursement_status || '',
      EventAccountingDomain.isAlreadySubmittedExpense(row) ? '否（已另行提報）' : '是'
    ];
    applySimpleRow(excelRow, headers.length);
  });
  ['G', 'H', 'I'].forEach(col => { sheet.getColumn(col).numFmt = '#,##0;[Red](#,##0);0'; });
  [7, 16, 13, 26, 13, 14, 13, 13, 13, 34, 14, 18].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  return sheet;
}

function completeNetTotal(expenses) {
  if (!expenses.length) return null;
  if (!expenses.every(row => row.net_amount !== null && row.net_amount !== undefined && row.net_amount !== '')) return null;
  return expenses.reduce((sum, row) => sum + Number(row.net_amount), 0);
}

function buildAllocationSheet(workbook, activity, expenses, allocation) {
  if (!allocation || !Array.isArray(allocation.units) || !allocation.units.length) throw new Error('尚未讀到分攤資料，請先更新 GAS 後端');
  const total = EventAccountingDomain.summarizeExpenses(expenses);
  const allocated = EventAccountingDomain.allocateAmount(total, allocation);
  const netTotal = completeNetTotal(expenses);
  const netAllocated = netTotal === null ? null : EventAccountingDomain.allocateAmount(netTotal, allocation);
  const sheet = workbook.addWorksheet('分攤表', { views: [{ showGridLines: false }] });
  addSheetTitle(sheet, `${activity.name || state.activityId}｜分攤表`, netAllocated ? 7 : 6);
  const sourceText = allocation.source === 'external' ? '外部平台即時資料' : '分攤單位備援';
  const settings = [
    ['分攤方式', allocation.method],
    ['人數來源', sourceText],
    ['總人數', allocation.method === '人數比例' ? allocation.total_headcount : '不參與計算'],
    ['活動總支出', total]
  ];
  if (allocation.warning) settings.push(['資料提示', allocation.warning]);
  settings.forEach((entry, index) => {
    const row = sheet.getRow(3 + index);
    row.values = [entry[0], entry[1]];
    row.getCell(1).font = { name: 'Microsoft JhengHei', size: 11, bold: true };
    row.getCell(2).font = { name: 'Microsoft JhengHei', size: 11 };
  });
  const headerRowNumber = 4 + settings.length;
  const headers = ['單位', '人數', '比例', '分攤金額', '尾差調整', '備註'];
  if (netAllocated) headers.push('未稅分攤');
  applyTableHeader(sheet.getRow(headerRowNumber), headers);
  allocated.rows.forEach((row, index) => {
    const values = [
      row.name,
      allocation.method === '人數比例' ? row.headcount : '',
      row.ratio,
      row.amount,
      row.adjustment,
      row.adjustment ? '含尾差調整' : ''
    ];
    if (netAllocated) values.push(netAllocated.rows[index].amount);
    const excelRow = sheet.getRow(headerRowNumber + 1 + index);
    excelRow.values = values;
    applySimpleRow(excelRow, headers.length);
    excelRow.getCell(3).numFmt = '0.00%';
    excelRow.getCell(4).numFmt = '#,##0';
    excelRow.getCell(5).numFmt = '#,##0;[Red](#,##0);0';
    if (netAllocated) excelRow.getCell(7).numFmt = '#,##0';
  });
  const totalRow = sheet.getRow(headerRowNumber + 1 + allocated.rows.length);
  const values = [
    '合計',
    allocation.method === '人數比例' ? allocated.rows.reduce((sum, row) => sum + Number(row.headcount || 0), 0) : '',
    1,
    allocated.rows.reduce((sum, row) => sum + row.amount, 0),
    allocated.rows.reduce((sum, row) => sum + row.adjustment, 0),
    netAllocated ? '' : '未稅資料不完整，未進行未稅分攤'
  ];
  if (netAllocated) values.push(netAllocated.rows.reduce((sum, row) => sum + row.amount, 0));
  totalRow.values = values;
  applySimpleRow(totalRow, headers.length);
  totalRow.font = { name: 'Microsoft JhengHei', size: 11, bold: true };
  totalRow.getCell(3).numFmt = '0.00%';
  totalRow.getCell(4).numFmt = '#,##0';
  totalRow.getCell(5).numFmt = '#,##0;[Red](#,##0);0';
  if (netAllocated) totalRow.getCell(7).numFmt = '#,##0';
  [24, 10, 12, 16, 14, 32, 16].slice(0, headers.length).forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  return sheet;
}

async function generatePettyCashReport() {
  const button = $('#generatePettyCashReport');
  button.disabled = true;
  setReportStatus('正在產生 Excel…');
  try {
    if (typeof ExcelJS === 'undefined') throw new Error('Excel 產生工具載入失敗，請重新整理頁面');
    const workbook = createWorkbook();
    const result = buildPettyCashSheet(workbook, state.activity || {}, state.expenses, { sheetName: '零用金費用' });
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `${safeFileName(state.activity.name || state.activityId)}_零用金費用明細.xlsx`;
    downloadBuffer(buffer, fileName);
    setReportStatus(`Excel 已下載；需沖銷金額 ${signedMoney(result.settlement.settlementAmount)}`);
  } catch (err) {
    setReportStatus(err && err.message ? err.message : '下載失敗', true);
  } finally {
    button.disabled = false;
  }
}

async function generateReimbursementReport() {
  const button = $('#generateReimbursementReport');
  button.disabled = true;
  setReportStatus('正在產生完整核銷 Excel…');
  try {
    if (typeof ExcelJS === 'undefined') throw new Error('Excel 產生工具載入失敗，請重新整理頁面');
    if (!state.capabilities.includes('reimbursement_export')) {
      throw new Error('完整核銷資料尚需新版 GAS 後端；請先完成後端更新後再下載');
    }
    if (!state.allocation) throw new Error('尚未讀到分攤資料，請重新載入頁面');
    const activity = state.activity || {};
    const expenses = state.expenses || [];
    const workbook = createWorkbook();
    buildOverviewSheet(workbook, activity, expenses);
    buildBudgetSheet(workbook, activity, expenses);
    buildInvoiceSheet(workbook, activity, expenses);
    buildPettyCashSheet(workbook, activity, expenses, { sheetName: '零用金使用明細' });
    buildAllocationSheet(workbook, activity, expenses, state.allocation);
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `${safeFileName(activity.name || state.activityId)}_核銷資料.xlsx`;
    downloadBuffer(buffer, fileName);
    const claim = EventAccountingDomain.summarizeCurrentClaim(expenses);
    setReportStatus(`完整核銷 Excel 已下載；活動總支出 ${money(claim.actualTotal)}`);
  } catch (err) {
    setReportStatus(err && err.message ? err.message : '完整核銷 Excel 下載失敗', true);
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
$('#generateReimbursementReport').addEventListener('click', generateReimbursementReport);
$('#expenseRows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-edit-expense]');
  if (button) startEditExpense(button.dataset.editExpense);
});
loadConfig();
