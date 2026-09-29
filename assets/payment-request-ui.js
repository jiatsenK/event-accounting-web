(function (root) {
  'use strict';
  if (!root || !root.PaymentRequest) return;

  let editingRequestId = '';
  let allRequests = [];
  let statusFilter = '';
  const STAGES = ['訂金', '尾款', '追加', '回沖', '零用金請款'];

  function setPaymentRequestStatusMessage(text, error) {
    const element = $('#paymentRequestStatusMessage');
    if (!element) return;
    element.textContent = text || '';
    element.className = error ? 'status form-status error' : 'status form-status';
  }

  function setPaymentRequestFormStatus(text, error) {
    const element = $('#paymentRequestFormStatus');
    if (!element) return;
    element.textContent = text || '';
    element.className = error ? 'status form-status error' : 'status form-status';
  }

  // #155 第 5 項：依收款對象加總，訂金／尾款／追加各自一欄，已申請含公司已匯款。純前端加總，不存新資料。
  function summarizeByRecipient(rows) {
    const groups = new Map();
    rows.forEach(row => {
      const name = String(row['收款對象'] || '').trim() || '未填收款對象';
      if (!groups.has(name)) groups.set(name, { recipient: name, stages: {}, total: 0, submitted: 0, paid: 0, count: 0 });
      const group = groups.get(name);
      const amount = Number(row['金額合計'] || 0);
      const stage = STAGES.includes(row['付款階段']) ? row['付款階段'] : '其他';
      group.stages[stage] = (group.stages[stage] || 0) + amount;
      group.total += amount;
      group.count += 1;
      if (row['簽核狀態'] === '已申請' || row['簽核狀態'] === '公司已匯款') group.submitted += amount;
      if (row['簽核狀態'] === '公司已匯款') group.paid += amount;
    });
    return Array.from(groups.values());
  }

  function renderVendorPayments() {
    const groups = summarizeByRecipient(allRequests);
    const stages = STAGES.concat('其他').filter(stage => groups.some(group => group.stages[stage]));
    const html = groups.length ? '<div class="payment-request-table-wrap"><table class="vendor-payment-table"><thead><tr><th>收款對象</th>' +
      stages.map(stage => `<th class="num">${escapeHtml(stage)}</th>`).join('') +
      '<th class="num">合計</th><th class="num">已申請</th><th class="num">公司已匯款</th><th class="num">還沒申請</th></tr></thead><tbody>' +
      groups.map(group => `<tr><td><button type="button" class="link-button" data-filter-recipient="${escapeHtml(group.recipient)}">${escapeHtml(group.recipient)}</button><div class="muted">${group.count} 張</div></td>` +
        stages.map(stage => `<td class="num">${group.stages[stage] ? money(group.stages[stage]) : '—'}</td>`).join('') +
        `<td class="num"><strong>${money(group.total)}</strong></td><td class="num">${money(group.submitted)}</td><td class="num">${money(group.paid)}</td><td class="num">${money(group.total - group.submitted)}</td></tr>`).join('') +
      '</tbody></table></div>' : '<div class="empty compact">還沒有款項申請單</div>';
    document.querySelectorAll('[data-vendor-payments]').forEach(element => { element.innerHTML = html; });
  }

  function renderStatusTabs() {
    const tabs = $('#paymentRequestStatusTabs');
    if (!tabs) return;
    tabs.innerHTML = [''].concat(root.PaymentRequest.STATUSES).map(status => {
      const count = allRequests.filter(row => !status || row['簽核狀態'] === status).length;
      const active = status === statusFilter;
      return `<button type="button" class="status-filter" data-request-status="${escapeHtml(status)}" aria-pressed="${active}">${escapeHtml(status || '全部')} <span class="count">${count}</span></button>`;
    }).join('');
  }

  function renderRecipientOptions() {
    const select = $('#paymentRequestRecipientFilter');
    const recipients = Array.from(new Set(allRequests.map(row => String(row['收款對象'] || '').trim()).filter(Boolean))).sort();
    if (select) {
      const current = select.value;
      select.innerHTML = '<option value="">全部收款對象</option>' + recipients.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
      select.value = recipients.includes(current) ? current : '';
    }
    const list = $('#paymentRequestRecipients');
    if (list) {
      const budgetVendors = (state.activityBudget && Array.isArray(state.activityBudget.rows) ? state.activityBudget.rows : [])
        .map(row => String(row.vendor || '').trim()).filter(Boolean);
      list.innerHTML = Array.from(new Set(recipients.concat(budgetVendors))).sort().map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
    }
  }

  function renderPaymentRequests() {
    const recipientSelect = $('#paymentRequestRecipientFilter');
    const recipient = String(recipientSelect && recipientSelect.value || '').trim();
    const rows = allRequests.filter(r => (!statusFilter || r['簽核狀態'] === statusFilter) &&
      (!recipient || String(r['收款對象'] || '').trim() === recipient));
    const body = $('#paymentRequestRows');
    if (!body) return;
    renderStatusTabs();
    renderVendorPayments();
    const locked = Boolean(state.activity && state.activity.reimbursement_locked);
    body.innerHTML = rows.length ? rows.map(row => {
      const statusClass = root.PaymentRequest.statusClass(row['簽核狀態']);
      const next = row['簽核狀態'] === '待申請' ? '已申請' : row['簽核狀態'] === '已申請' ? '公司已匯款' : '';
      const nextLabel = next === '已申請' ? '標記已申請' : next === '公司已匯款' ? '標記公司已匯款' : '';
      return `<tr data-request-id="${escapeHtml(row.request_id)}">
        <td>${escapeHtml(row['申請日期'] || '—')}</td>
        <td>${escapeHtml(row['收款對象'])}</td>
        <td>${escapeHtml(row['付款階段'] || '—')}</td>
        <td class="num">${money(row['金額合計'])}</td>
        <td>${escapeHtml(row['用途說明'] || '—')}</td>
        <td>${escapeHtml(row['匯款期限'] || '—')}</td>
        <td><span class="payment-request-status ${statusClass}">${escapeHtml(row['簽核狀態'])}</span></td>
        <td><div class="budget-row-actions">
          ${next && !locked ? `<button type="button" class="table-action" data-advance-payment-request="${escapeHtml(row.request_id)}" data-next-status="${escapeHtml(next)}">${nextLabel}</button>` : ''}
          ${locked ? '' : `<button type="button" class="table-action" data-edit-payment-request="${escapeHtml(row.request_id)}">修改</button>`}
          <button type="button" class="table-action" data-download-payment-request="${escapeHtml(row.request_id)}">下載 xlsx</button>
          ${locked ? '' : `<button type="button" class="table-action danger-outline" data-delete-payment-request="${escapeHtml(row.request_id)}">刪除</button>`}
        </div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" class="empty">' + (allRequests.length ? '沒有符合篩選的申請單' : '尚無款項申請單') + '</td></tr>';
    if (typeof root.onPaymentRequestsRendered === 'function') root.onPaymentRequestsRendered(allRequests.slice());
  }

  async function loadPaymentRequests() {
    const body = $('#paymentRequestRows');
    if (!body) return;
    if (!state.capabilities.includes('payment_requests')) {
      body.innerHTML = '<tr><td colspan="8" class="empty">後端尚未提供款項申請單</td></tr>';
      return;
    }
    try {
      const payload = await apiRead('payment_requests', { activity_id: state.activityId });
      allRequests = Array.isArray(payload.requests) ? payload.requests : [];
      renderRecipientOptions();
      renderPaymentRequests();
      setPaymentRequestStatusMessage('');
    } catch (error) {
      body.innerHTML = '<tr><td colspan="8" class="empty">款項申請單讀取失敗</td></tr>';
      setPaymentRequestStatusMessage(error && error.message || '讀取失敗', true);
      throw error;
    }
  }

  function resetPaymentRequestForm() {
    editingRequestId = '';
    const form = $('#paymentRequestForm');
    form.reset();
    $('#paymentRequestFormTitle').textContent = '新增款項申請單';
    $('#submitPaymentRequest').textContent = '儲存申請單';
    $('#cancelPaymentRequestEdit').hidden = true;
    setPaymentRequestFormStatus('');
  }

  function openPaymentRequestEditor(row, prefill) {
    resetPaymentRequestForm();
    $('#paymentRequestEditor').hidden = false;
    if (!row && prefill) {
      const form = $('#paymentRequestForm');
      Object.entries(prefill).forEach(([name, value]) => {
        const field = form.querySelector(`[name="${name}"]`);
        if (field) field.value = value == null ? '' : value;
      });
    }
    if (row) {
      editingRequestId = String(row.request_id || '');
      const form = $('#paymentRequestForm');
      const values = {
        '收款對象': row['收款對象'], '付款階段': row['付款階段'], '金額合計': row['金額合計'],
        '申請日期': row['申請日期'], '匯款期限': row['匯款期限'], '用途說明': row['用途說明'],
        expense_ids: (row.expense_ids || []).join(','), '附憑證張數': row['附憑證張數'],
        '簽核狀態': row['簽核狀態'] || '待申請', '備註': row['備註']
      };
      Object.entries(values).forEach(([name, value]) => {
        const field = form.querySelector(`[name="${name}"]`);
        if (field) field.value = value == null ? '' : value;
      });
      $('#paymentRequestFormTitle').textContent = '修改款項申請單';
      $('#submitPaymentRequest').textContent = '儲存修改';
      $('#cancelPaymentRequestEdit').hidden = false;
    }
    $('#paymentRequestEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submitPaymentRequest(event) {
    event.preventDefault();
    const button = $('#submitPaymentRequest');
    button.disabled = true;
    try {
      const form = new FormData($('#paymentRequestForm'));
      const request = root.PaymentRequest.normalizeRequest({
        request_id: editingRequestId,
        '收款對象': form.get('收款對象'),
        '付款階段': form.get('付款階段'),
        '金額合計': form.get('金額合計'),
        '申請日期': form.get('申請日期'),
        '匯款期限': form.get('匯款期限'),
        '用途說明': form.get('用途說明'),
        expense_ids: form.get('expense_ids'),
        '附憑證張數': form.get('附憑證張數'),
        '簽核狀態': form.get('簽核狀態'),
        '備註': form.get('備註')
      });
      setPaymentRequestFormStatus('正在儲存…');
      await apiWrite({
        action: 'save_payment_request', activity_id: state.activityId, request_id: request.request_id,
        '收款對象': request['收款對象'], '付款階段': request['付款階段'], '金額合計': request['金額合計'],
        '申請日期': request['申請日期'], '匯款期限': request['匯款期限'], '用途說明': request['用途說明'],
        expense_ids: request.expense_ids.join(','), '附憑證張數': request['附憑證張數'],
        '簽核狀態': request['簽核狀態'], '備註': request['備註']
      });
      await loadPaymentRequests();
      resetPaymentRequestForm();
      $('#paymentRequestEditor').hidden = true;
      setPaymentRequestStatusMessage('已儲存款項申請單');
    } catch (error) {
      setPaymentRequestFormStatus(error && error.message || '儲存失敗', true);
    } finally {
      button.disabled = false;
    }
  }

  async function deletePaymentRequest(requestId) {
    if (!root.confirm('確定刪除這張款項申請單？')) return;
    try {
      setPaymentRequestStatusMessage('正在刪除…');
      await apiWrite({ action: 'save_payment_request', activity_id: state.activityId, request_id: requestId, _delete: '1' });
      await loadPaymentRequests();
      setPaymentRequestStatusMessage('已刪除款項申請單');
    } catch (error) {
      setPaymentRequestStatusMessage(error && error.message || '刪除失敗', true);
    }
  }

  // 列表上直接推進狀態：待申請 → 已申請 → 公司已匯款（ERP 應付帳單的狀態列）。
  async function advancePaymentRequest(requestId, nextStatus) {
    const row = allRequests.find(item => String(item.request_id) === String(requestId));
    if (!row || !root.PaymentRequest.STATUSES.includes(nextStatus)) return;
    try {
      setPaymentRequestStatusMessage('正在更新狀態…');
      await apiWrite({
        action: 'save_payment_request', activity_id: state.activityId, request_id: row.request_id,
        '收款對象': row['收款對象'], '付款階段': row['付款階段'], '金額合計': row['金額合計'],
        '申請日期': row['申請日期'], '匯款期限': row['匯款期限'], '用途說明': row['用途說明'],
        expense_ids: (row.expense_ids || []).join(','), '附憑證張數': row['附憑證張數'],
        '簽核狀態': nextStatus, '備註': row['備註']
      });
      await loadPaymentRequests();
      setPaymentRequestStatusMessage('已改為「' + nextStatus + '」');
    } catch (error) {
      setPaymentRequestStatusMessage(error && error.message || '更新失敗', true);
    }
  }

  async function downloadPaymentRequest(requestId) {
    const row = allRequests.find(item => String(item.request_id) === String(requestId));
    if (!row) return;
    try {
      setPaymentRequestStatusMessage('正在產生 xlsx…');
      await root.PaymentRequest.downloadPaymentRequestWorkbook(root.ExcelJS, row, state.activity);
      setPaymentRequestStatusMessage('款項申請單已下載');
    } catch (error) {
      setPaymentRequestStatusMessage(error && error.message || '產生失敗', true);
    }
  }

  root.loadPaymentRequests = loadPaymentRequests;
  root.getPaymentRequests = () => allRequests.slice();
  root.openPaymentRequestEditor = prefill => openPaymentRequestEditor(null, prefill);

  $('#showPaymentRequestEditor').addEventListener('click', () => openPaymentRequestEditor());
  $('#closePaymentRequestEditor').addEventListener('click', () => { resetPaymentRequestForm(); $('#paymentRequestEditor').hidden = true; });
  $('#cancelPaymentRequestEdit').addEventListener('click', () => { resetPaymentRequestForm(); $('#paymentRequestEditor').hidden = true; });
  $('#paymentRequestForm').addEventListener('submit', submitPaymentRequest);
  $('#paymentRequestRecipientFilter').addEventListener('change', renderPaymentRequests);
  $('#paymentRequestStatusTabs').addEventListener('click', event => {
    const button = event.target.closest('[data-request-status]');
    if (!button) return;
    statusFilter = button.dataset.requestStatus;
    renderPaymentRequests();
  });
  document.addEventListener('click', event => {
    const pick = event.target.closest('[data-filter-recipient]');
    if (!pick) return;
    const select = $('#paymentRequestRecipientFilter');
    if (select) select.value = pick.dataset.filterRecipient;
    statusFilter = '';
    renderPaymentRequests();
    if (typeof root.activateAccountingTab === 'function' && !pick.closest('[data-tab-panel="payment_requests"]')) {
      const opener = document.querySelector('[data-open-tab="payment_requests"]');
      if (opener) opener.click();
    }
  });
  $('#paymentRequestRows').addEventListener('click', event => {
    const advance = event.target.closest('[data-advance-payment-request]');
    if (advance) return advancePaymentRequest(advance.dataset.advancePaymentRequest, advance.dataset.nextStatus);
    const edit = event.target.closest('[data-edit-payment-request]');
    if (edit) {
      const row = allRequests.find(item => String(item.request_id) === String(edit.dataset.editPaymentRequest));
      return openPaymentRequestEditor(row);
    }
    const del = event.target.closest('[data-delete-payment-request]');
    if (del) return deletePaymentRequest(del.dataset.deletePaymentRequest);
    const download = event.target.closest('[data-download-payment-request]');
    if (download) return downloadPaymentRequest(download.dataset.downloadPaymentRequest);
  });
})(typeof window !== 'undefined' ? window : null);
