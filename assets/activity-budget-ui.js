(function (root) {
  'use strict';
  if (!root || !root.ActivityBudget) return;

  let editingBudgetLineId = '';

  function setBudgetStatusMessage(text, error) {
    const element = $('#activityBudgetStatusMessage');
    if (!element) return;
    element.textContent = text || '';
    element.className = error ? 'status form-status error' : 'status form-status';
  }

  function setBudgetFormStatus(text, error) {
    const element = $('#activityBudgetFormStatus');
    if (!element) return;
    element.textContent = text || '';
    element.className = error ? 'status form-status error' : 'status form-status';
  }

  function signedMoney(value) {
    const amount = Number(value || 0);
    return (amount > 0 ? '+' : amount < 0 ? '−' : '') + money(Math.abs(amount));
  }

  function renderBudgetFormOptions(payload) {
    const form = $('#activityBudgetForm');
    if (!form) return;
    const budgetSelect = form.querySelector('[name="budget_item"]');
    const currentBudgetItem = budgetSelect.value;
    const budgetItems = Array.isArray(payload.budget_items) ? payload.budget_items : [];
    budgetSelect.innerHTML = '<option value="">選擇預算項目</option>' + budgetItems.map(item =>
      `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`
    ).join('');
    if (budgetItems.some(item => item.name === currentBudgetItem)) budgetSelect.value = currentBudgetItem;

    const vendorSelect = form.querySelector('[name="vendor_value"]');
    const currentVendor = vendorSelect.value;
    const vendors = (Array.isArray(payload.vendors) ? payload.vendors : []).filter(vendor => vendor.remittance_status !== '已停用');
    const special = Array.isArray(payload.special_vendors) ? payload.special_vendors : [];
    vendorSelect.innerHTML = '<option value="">未指定廠商</option>' +
      '<optgroup label="廠商主檔">' + vendors.map(vendor =>
        `<option value="key:${escapeHtml(vendor.vendor_key)}">${escapeHtml(vendor.name)}${vendor.tax_id ? '（' + escapeHtml(vendor.tax_id) + '）' : ''}</option>`
      ).join('') + '</optgroup>' +
      '<optgroup label="特殊廠商">' + special.map(name =>
        `<option value="special:${escapeHtml(name)}">${escapeHtml(name)}</option>`
      ).join('') + '</optgroup>';
    if (Array.from(vendorSelect.options).some(option => option.value === currentVendor)) vendorSelect.value = currentVendor;
  }

  function renderActivityBudget(payload) {
    state.activityBudget = payload;
    const activity = payload.activity || {};
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const status = String(activity.budget_status || '草稿');
    const statusElement = $('#activityBudgetStatus');
    statusElement.textContent = status;
    statusElement.className = 'budget-status status-' + ({ '草稿': 'draft', '已提報': 'submitted', '已核准': 'approved' }[status] || 'draft');
    $('#activityBudgetTotal').textContent = money(payload.total);
    $('#activityBudgetPreviousTotal').textContent = payload.previous_activity ? money(payload.previous_total) : '無可比資料';
    $('#activityBudgetDifference').textContent = payload.previous_activity ? signedMoney(Number(payload.total || 0) - Number(payload.previous_total || 0)) : '—';
    const next = root.ActivityBudget.nextStatus(status);
    const advance = $('#advanceBudgetStatus');
    advance.hidden = !next;
    advance.textContent = next === '已提報' ? '提報預算' : next === '已核准' ? '標記已核准' : '';
    advance.dataset.nextBudgetStatus = next;
    $('#yearEndFundingFields').hidden = !root.ActivityBudget.isYearEnd(activity);
    renderBudgetFormOptions(payload);
    $('#activityBudgetRows').innerHTML = rows.length ? rows.map(row => {
      const paymentNote = [row.payment_terms, row.note].filter(Boolean).join('｜') || '—';
      const vendorTotal = row.vendor_total === null || row.vendor_total === undefined ? '' : money(row.vendor_total);
      const previous = row.previous_amount === null || row.previous_amount === undefined ? '—' : money(row.previous_amount);
      return `<tr data-budget-line-id="${escapeHtml(row.budget_line_id)}">
        <td>${escapeHtml(row.budget_item)}</td>
        <td>${escapeHtml(row.vendor || '未指定')}</td>
        <td>${escapeHtml(row.item)}</td>
        <td class="num">${money(row.unit_price)}</td>
        <td class="num">${escapeHtml(row.quantity)}</td>
        <td class="num">${money(row.amount)}</td>
        <td class="num vendor-total">${vendorTotal}</td>
        <td class="num">${previous}</td>
        <td class="budget-note">${escapeHtml(paymentNote)}</td>
        <td><div class="budget-row-actions"><button type="button" class="table-action" data-edit-budget-line="${escapeHtml(row.budget_line_id)}">修改</button><button type="button" class="table-action danger-outline" data-delete-budget-line="${escapeHtml(row.budget_line_id)}">刪除</button></div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="10" class="empty">尚未建立活動預算品項</td></tr>';
  }

  async function loadActivityBudget() {
    const body = $('#activityBudgetRows');
    if (!body) return;
    if (!state.capabilities.includes('activity_budget')) {
      body.innerHTML = '<tr><td colspan="10" class="empty">後端尚未提供活動預算</td></tr>';
      return;
    }
    try {
      const payload = await apiRead('activity_budget', { activity_id: state.activityId });
      renderActivityBudget(payload);
      setBudgetStatusMessage('');
    } catch (error) {
      body.innerHTML = '<tr><td colspan="10" class="empty">活動預算讀取失敗</td></tr>';
      setBudgetStatusMessage(error && error.message || '讀取失敗', true);
      throw error;
    }
  }

  function resetBudgetForm() {
    editingBudgetLineId = '';
    const form = $('#activityBudgetForm');
    form.reset();
    $('#budgetFormTitle').textContent = '新增預算品項';
    $('#submitBudgetLine').textContent = '儲存品項';
    $('#cancelBudgetEdit').hidden = true;
    setBudgetFormStatus('');
  }

  function openBudgetEditor(row) {
    resetBudgetForm();
    $('#budgetEditor').hidden = false;
    if (row) {
      editingBudgetLineId = String(row.budget_line_id || '');
      const form = $('#activityBudgetForm');
      const values = {
        budget_item: row.budget_item,
        vendor_value: row.vendor_key ? 'key:' + row.vendor_key : row.vendor ? 'special:' + row.vendor : '',
        item: row.item,
        unit_price: row.unit_price,
        quantity: row.quantity,
        amount: row.amount,
        sponsor_amount: row.sponsor_amount,
        jdc_amount: row.jdc_amount,
        payment_terms: row.payment_terms,
        note: row.note
      };
      Object.entries(values).forEach(([name, value]) => {
        const field = form.querySelector(`[name="${name}"]`);
        if (field) field.value = value == null ? '' : value;
      });
      $('#budgetFormTitle').textContent = '修改預算品項';
      $('#submitBudgetLine').textContent = '儲存修改';
      $('#cancelBudgetEdit').hidden = false;
    }
    $('#budgetEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submitBudgetLine(event) {
    event.preventDefault();
    const button = $('#submitBudgetLine');
    button.disabled = true;
    try {
      const form = new FormData($('#activityBudgetForm'));
      const line = root.ActivityBudget.normalizeLine({
        budget_line_id: editingBudgetLineId,
        budget_item: form.get('budget_item'),
        vendor_value: form.get('vendor_value'),
        item: form.get('item'),
        unit_price: form.get('unit_price'),
        quantity: form.get('quantity'),
        amount: form.get('amount'),
        sponsor_amount: form.get('sponsor_amount'),
        jdc_amount: form.get('jdc_amount'),
        payment_terms: form.get('payment_terms'),
        note: form.get('note')
      });
      setBudgetFormStatus('正在儲存…');
      const payload = await apiWrite({ action: 'save_activity_budget_line', activity_id: state.activityId, ...line });
      renderActivityBudget(payload);
      resetBudgetForm();
      $('#budgetEditor').hidden = true;
      setBudgetStatusMessage('已儲存預算品項');
    } catch (error) {
      setBudgetFormStatus(error && error.message || '儲存失敗', true);
    } finally {
      button.disabled = false;
    }
  }

  async function deleteBudgetLine(lineId) {
    if (!root.confirm('確定刪除這筆預算品項？')) return;
    try {
      setBudgetStatusMessage('正在刪除…');
      const payload = await apiWrite({ action: 'delete_activity_budget_line', activity_id: state.activityId, budget_line_id: lineId });
      renderActivityBudget(payload);
      setBudgetStatusMessage('已刪除預算品項');
    } catch (error) {
      setBudgetStatusMessage(error && error.message || '刪除失敗', true);
    }
  }

  async function advanceBudgetStatus() {
    const next = String($('#advanceBudgetStatus').dataset.nextBudgetStatus || '');
    if (!next) return;
    if (next === '已核准' && !root.confirm('核准後會把各預算項目金額同步到活動明細，確定繼續？')) return;
    const button = $('#advanceBudgetStatus');
    button.disabled = true;
    try {
      setBudgetStatusMessage(next === '已提報' ? '正在提報…' : '正在同步核准預算…');
      const payload = await apiWrite({ action: 'update_budget_status', activity_id: state.activityId, budget_status: next });
      renderActivityBudget(payload);
      setBudgetStatusMessage(next === '已核准' ? '預算已核准，活動明細的核准預算已同步' : '預算已提報');
    } catch (error) {
      setBudgetStatusMessage(error && error.message || '狀態更新失敗', true);
    } finally {
      button.disabled = false;
    }
  }

  async function downloadBudgetAttachment() {
    try {
      setBudgetStatusMessage('正在產生明細附件…');
      await root.ActivityBudget.downloadBudgetAttachment(root.ExcelJS, state.activityBudget);
      setBudgetStatusMessage('明細附件已下載');
    } catch (error) {
      setBudgetStatusMessage(error && error.message || '附件產生失敗', true);
    }
  }

  async function downloadBudgetProposal() {
    try {
      const payload = state.activityBudget;
      if (!payload || !payload.rows || !payload.rows.length) throw new Error('活動預算尚無品項');
      if (!payload.activity || !payload.activity.date) throw new Error('活動主檔缺少活動日期');
      if (!payload.activity.location) throw new Error('活動主檔缺少活動地點');
      setBudgetStatusMessage('正在產生預算簽呈…');
      await root.ActivityBudget.downloadProposal(root.docx, payload);
      setBudgetStatusMessage('預算簽呈已下載');
    } catch (error) {
      setBudgetStatusMessage(error && error.message || '簽呈產生失敗', true);
    }
  }

  root.loadActivityBudget = loadActivityBudget;
  root.renderActivityBudget = renderActivityBudget;

  $('#showBudgetEditor').addEventListener('click', () => openBudgetEditor());
  $('#closeBudgetEditor').addEventListener('click', () => { resetBudgetForm(); $('#budgetEditor').hidden = true; });
  $('#cancelBudgetEdit').addEventListener('click', () => { resetBudgetForm(); $('#budgetEditor').hidden = true; });
  $('#activityBudgetForm').addEventListener('submit', submitBudgetLine);
  $('#advanceBudgetStatus').addEventListener('click', advanceBudgetStatus);
  $('#downloadBudgetAttachment').addEventListener('click', downloadBudgetAttachment);
  $('#downloadBudgetProposal').addEventListener('click', downloadBudgetProposal);
  $('#activityBudgetRows').addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-budget-line]');
    if (edit) {
      const row = state.activityBudget && state.activityBudget.rows.find(item => String(item.budget_line_id) === String(edit.dataset.editBudgetLine));
      return openBudgetEditor(row);
    }
    const remove = event.target.closest('[data-delete-budget-line]');
    if (remove) return deleteBudgetLine(remove.dataset.deleteBudgetLine);
  });
})(typeof window !== 'undefined' ? window : null);
