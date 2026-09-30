(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.V2Exports = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const TEMPLATE_URL = '../assets/templates/payment-request-template.xlsx';
  let templateBufferPromise = null;

  const alive = row => row && !row.deleted_at;

  function safeFileName(value) {
    return String(value || '款項申請單').replace(/[\\/:*?"<>|]/g, '_').trim() || '款項申請單';
  }

  function dateText(value) {
    return value ? String(value).slice(0, 10).replace(/-/g, '/') : '';
  }

  function buildPaymentRequestExport(db, requestOrId) {
    const data = db || {};
    const requests = data.payment_requests || [];
    const request = typeof requestOrId === 'object' && requestOrId
      ? requestOrId : requests.find(row => alive(row) && String(row.id) === String(requestOrId));
    if (!request || !alive(request)) throw new Error('找不到款項申請單');

    const requestLines = (data.request_lines || []).filter(row => alive(row) && row.request_id === request.id);
    const lineIds = new Set(requestLines.map(row => row.line_id));
    const budgetLines = (data.budget_lines || []).filter(row => alive(row) && lineIds.has(row.id));
    const vendor = request.payee_vendor_id
      ? (data.vendors || []).find(row => alive(row) && row.id === request.payee_vendor_id) : null;
    const activity = (data.activities || []).find(row => alive(row) && row.id === request.activity_id) || null;
    const payee = vendor && vendor.name || request.payee_name || request.payee_vendor_id || '';
    const purpose = request.purpose || budgetLines.map(row => row.item).filter(Boolean).join('、');
    const linkedAmount = requestLines.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const amount = request.amount === '' || request.amount == null ? linkedAmount : Number(request.amount) || 0;
    const label = [activity && activity.name, payee || '款項', request.stage || '申請單'].filter(Boolean).join('_');

    return { request, requestLines, budgetLines, vendor, activity, payee, purpose, amount, fileName: safeFileName(label) + '.xlsx' };
  }

  function fillPaymentRequestSheet(sheet, payload) {
    const request = payload.request;
    sheet.getCell('A6').value = '申請日期：' + dateText(request.requested_at);
    sheet.getCell('A9').value = payload.purpose || '';
    sheet.getCell('A10').value = request.note || '';
    sheet.getCell('A11').value = '';
    sheet.getCell('A12').value = '';
    sheet.getCell('V13').value = payload.amount;
    sheet.getCell('H14').value = payload.payee || '';
    sheet.getCell('AB17').value = 0;
    return sheet;
  }

  function loadTemplateBuffer() {
    if (!templateBufferPromise) {
      templateBufferPromise = fetch(TEMPLATE_URL).then(response => {
        if (!response.ok) throw new Error('款項申請單範本載入失敗（HTTP ' + response.status + '）');
        return response.arrayBuffer();
      });
    }
    return templateBufferPromise;
  }

  async function buildPaymentRequestWorkbook(ExcelJS, db, requestOrId, templateBuffer) {
    if (!ExcelJS || !ExcelJS.Workbook) throw new Error('Excel 產生器尚未載入');
    const payload = buildPaymentRequestExport(db, requestOrId);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer || await loadTemplateBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('款項申請單範本內容是空的');
    fillPaymentRequestSheet(sheet, payload);
    return { workbook, payload };
  }

  function downloadBlob(blob, fileName) {
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

  async function downloadPaymentRequest(ExcelJS, db, requestOrId) {
    const built = await buildPaymentRequestWorkbook(ExcelJS, db, requestOrId);
    const buffer = await built.workbook.xlsx.writeBuffer();
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), built.payload.fileName);
    return built.payload.fileName;
  }

  return { buildPaymentRequestExport, fillPaymentRequestSheet, buildPaymentRequestWorkbook, downloadPaymentRequest, safeFileName };
});
