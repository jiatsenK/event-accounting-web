(function (root) {
  'use strict';
  if (!root || !root.PaymentRequest) return;

  let editingRequestId = '';
  let allRequests = [];

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

  function renderPaymentRequests() {
    const filter = String($('#paymentRequestStatusFilter').value || '').trim();
    const rows = filter ? allRequests.filter(r => r['簽核狀態'] === filter) : allRequests;
    const body = $('#paymentRequestRows');
    if (!body) return;
    body.innerHTML = rows.length ? rows.map(row => {
      const statusClass = root.PaymentRequest.statusClass(row['簽核狀態']);
      return `<tr data-request-id="${escapeHtml(row.request_id)}">
        <td>${escapeHtml(row['申請日期'] || '—')}</td>
        <td>${escapeHtml(row['收款對象'])}</td>
        <td>${escapeHtml(row['付款階段'] || '—')}</td>
        <td class="num">${money(row['金額合計'])}</td>
        <td>${escapeHtml(row['用途說明'] || '—')}</td>
        <td>${escapeHtml(row['匯款期限'] || '—')}</td>
        <td><span class="payment-request-status ${statusClass}">${escapeHtml(row['簽核狀態'])}</span></td>
        <td><div class="budget-row-actions">
          <button type="button" class="table-action" data-edit-payment-request="${escapeHtml(row.request_id)}">修改</button>
          <button type="button" class="table-action" data-download-payment-request="${escapeHtml(row.request_id)}">下載 xlsx</button>
          <button type="button" class="table-action danger-outline" data-delete-payment-request="${escapeHtml(row.request_id)}">刪除</button>
        </div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" class="empty">尚無款項申請單</td></tr>';
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

  function openPaymentRequestEditor(row) {
    resetPaymentRequestForm();
    $('#paymentRequestEditor').hidden = false;
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

  $('#showPaymentRequestEditor').addEventListener('click', () => openPaymentRequestEditor());
  $('#closePaymentRequestEditor').addEventListener('click', () => { resetPaymentRequestForm(); $('#paymentRequestEditor').hidden = true; });
  $('#cancelPaymentRequestEdit').addEventListener('click', () => { resetPaymentRequestForm(); $('#paymentRequestEditor').hidden = true; });
  $('#paymentRequestForm').addEventListener('submit', submitPaymentRequest);
  $('#paymentRequestStatusFilter').addEventListener('change', renderPaymentRequests);
  $('#paymentRequestRows').addEventListener('click', event => {
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
