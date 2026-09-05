(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PaymentRequest = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const STATUSES = ['待申請', '已申請', '公司已匯款'];

  function number(value, label, allowZero) {
    const parsed = Number(String(value == null ? '' : value).replace(/,/g, '').trim());
    if (!Number.isFinite(parsed) || (allowZero ? false : parsed === 0)) throw new Error(label + '必須是數字');
    return parsed;
  }

  function optionalNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // 表單輸入 → 送給後端的 fields。expense_ids 逗號分隔字串轉陣列，方便前端操作。
  function normalizeRequest(input) {
    const recipient = String(input['收款對象'] || input.recipient || '').trim();
    if (!recipient) throw new Error('請填寫收款對象');
    const amount = number(input['金額合計'] || input.amount, '金額合計', true);
    const status = STATUSES.includes(String(input['簽核狀態'] || input.status || '').trim())
      ? String(input['簽核狀態'] || input.status).trim() : '待申請';
    const expenseIds = Array.isArray(input.expense_ids) ? input.expense_ids
      : String(input.expense_ids || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
    return {
      request_id: String(input.request_id || '').trim(),
      activity_id: String(input.activity_id || '').trim(),
      '申請日期': String(input['申請日期'] || input.request_date || '').trim(),
      '收款對象': recipient,
      '付款階段': String(input['付款階段'] || input.stage || '').trim(),
      '金額合計': amount,
      '用途說明': String(input['用途說明'] || input.purpose || '').trim(),
      '匯款期限': String(input['匯款期限'] || input.due_date || '').trim(),
      expense_ids: expenseIds,
      '簽核狀態': status,
      '附憑證張數': optionalNumber(input['附憑證張數'] || input.attachment_count),
      '備註': String(input['備註'] || input.note || '').trim()
    };
  }

  // 寫入確認用：跟 assets/activity-budget.js 的 lineMatches 同一個目的——
  // apiWrite 輪詢 payment_requests 讀回來的列，比對是不是剛剛送出的那筆。
  function requestMatches(row, input) {
    const left = row || {};
    const right = input || {};
    return String(left['收款對象'] || '') === String(right['收款對象'] || '') &&
      Number(left['金額合計']) === Number(right['金額合計']) &&
      String(left['簽核狀態'] || '待申請') === String(right['簽核狀態'] || '待申請');
  }

  function statusClass(status) {
    if (status === '公司已匯款') return 'paid';
    if (status === '已申請') return 'submitted';
    return 'pending';
  }

  function safeFileName(value) {
    return String(value || '款項申請單').replace(/[\\/:*?"<>|]/g, '_').trim() || '款項申請單';
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

  // 兩次手刻版面（欄位標籤位置、框線、欄寬）都出過錯，跟原始範例對不起來。
  // 改成直接載入 _inbox/請款單/ 其中一份範例當範本，只改內容儲存格，版面
  // （字型、框線、欄寬、合併儲存格）100% 沿用範本，不再自己重建。
  const TEMPLATE_URL = '../assets/templates/payment-request-template.xlsx';
  let templateBufferPromise = null;

  function loadTemplateBuffer() {
    if (!templateBufferPromise) {
      templateBufferPromise = fetch(TEMPLATE_URL).then(res => {
        if (!res.ok) throw new Error('款項申請單範本載入失敗（HTTP ' + res.status + '）');
        return res.arrayBuffer();
      });
    }
    return templateBufferPromise;
  }

  async function buildPaymentRequestWorkbook(ExcelJS, request) {
    if (!ExcelJS || !ExcelJS.Workbook) throw new Error('Excel 產生器尚未載入');
    const buffer = await loadTemplateBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('款項申請單範本內容是空的');

    // 只換內容，範本原本填的是某一筆真實請款資料，這幾格全部要覆蓋掉，
    // 不然會漏著舊的廠商名稱／金額。
    sheet.getCell('A6').value = '申請日期：' + (request['申請日期'] || '');
    sheet.getCell('A9').value = request['用途說明'] || '';
    sheet.getCell('A10').value = request['備註'] || '';
    sheet.getCell('A11').value = '';
    sheet.getCell('A12').value = '';
    sheet.getCell('V13').value = Number(request['金額合計'] || 0);
    sheet.getCell('H14').value = request['收款對象'] || '';
    sheet.getCell('AB17').value = request['附憑證張數'] == null ? 0 : Number(request['附憑證張數']);

    return workbook;
  }

  async function downloadPaymentRequestWorkbook(ExcelJS, request) {
    const workbook = await buildPaymentRequestWorkbook(ExcelJS, request);
    const buffer = await workbook.xlsx.writeBuffer();
    const label = (request['收款對象'] || '款項') + '_' + (request['付款階段'] || '申請單');
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), safeFileName(label) + '.xlsx');
  }

  return {
    STATUSES,
    normalizeRequest,
    requestMatches,
    statusClass,
    buildPaymentRequestWorkbook,
    downloadPaymentRequestWorkbook
  };
});
