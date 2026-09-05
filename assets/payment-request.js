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

  // 版面依 _inbox/請款單/ 的 4 份範例：A4:AB19 固定版面、支払先/摘要/金額
  // 表頭列（範例實際填寫時走自由文字，不逐項填表頭那個表格，這裡沿用同一個
  // 慣例——內容是「用途說明 + 備註」幾行文字，不是逐筆品項表）。
  function applyBox(cell, options) {
    const opts = options || {};
    cell.border = {
      top: opts.top ? { style: opts.top, color: { argb: 'FF000000' } } : undefined,
      bottom: opts.bottom ? { style: opts.bottom, color: { argb: 'FF000000' } } : undefined,
      left: opts.left ? { style: opts.left, color: { argb: 'FF000000' } } : undefined,
      right: opts.right ? { style: opts.right, color: { argb: 'FF000000' } } : undefined
    };
  }

  function buildPaymentRequestWorkbook(ExcelJS, request, activity) {
    if (!ExcelJS || !ExcelJS.Workbook) throw new Error('Excel 產生器尚未載入');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'event-accounting';
    const sheet = workbook.addWorksheet('款項申請單', {
      views: [{ showGridLines: false }],
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
        printArea: 'A1:AC18'
      }
    });
    for (let col = 1; col <= 28; col += 1) sheet.getColumn(col).width = col === 1 ? 3 : 3.2;

    const font = (size, opts) => Object.assign({ name: 'DFKai-SB', size }, opts || {});
    const put = (ref, value, opts) => {
      const cell = sheet.getCell(ref);
      cell.value = value;
      cell.font = font((opts && opts.size) || 11, opts);
      cell.alignment = { horizontal: (opts && opts.align) || 'left', vertical: 'center', wrapText: true };
      return cell;
    };

    sheet.mergeCells('A4:AB4');
    put('A4', '款項申請單', { size: 18, align: 'center' });
    sheet.getRow(4).height = 23;

    put('A6', '申請日期：' + (request['申請日期'] || ''));
    put('A7', '申請内容說明：');

    ['支払先', '摘要', '金額', '支払先', '摘要', '金額'].forEach((label, i) => {
      const col = [1, 6, 11, 15, 20, 25][i]; // A F K O T Y
      put(sheet.getCell(8, col).address, label, { align: 'center' });
    });

    // 內容行：第一行用途說明，第二行備註（沒有備註就留白）；跟範例一樣走自由文字，
    // 不逐筆列品項——涵蓋的支出明細仍在 expense_ids／系統內查得到。
    sheet.mergeCells('A9:AB9');
    sheet.mergeCells('A10:AB10');
    sheet.mergeCells('A11:AB11');
    sheet.mergeCells('A12:AB12');
    const contentLines = [request['用途說明'], request['備註']].filter(Boolean);
    contentLines.forEach((line, i) => { if (i < 4) put('A' + (9 + i), line, { size: 12 }); });
    [9, 10, 11, 12, 13].forEach(r => { sheet.getRow(r).height = 22; });

    sheet.mergeCells('A13:P13');
    put('U13', '申請金額合計：', { align: 'right' });
    sheet.mergeCells('V13:AA13');
    const amountCell = sheet.getCell('V13');
    amountCell.value = Number(request['金額合計'] || 0);
    amountCell.font = font(14);
    amountCell.numFmt = '"NT$"#,##0;[Red]\\-"NT$"#,##0';
    amountCell.alignment = { horizontal: 'left', vertical: 'center' };

    put('A14', '付現對象或支票抬頭');
    sheet.mergeCells('H14:AB14');
    put('H14', request['收款對象'] || '', { size: 11 });
    sheet.getRow(14).height = 23;

    [['C16:F16', '支店長'], ['G16:J16', '管理部長'], ['K16:N16', '建築部長'], ['O16:R16', '部門主管'], ['S16:V16', '請 款 人']]
      .forEach(([range, label]) => { sheet.mergeCells(range); put(range.split(':')[0], label, { size: 12, align: 'center' }); });
    sheet.getRow(16).height = 24;
    [17, 18, 19].forEach(r => { sheet.getRow(r).height = 27; });

    put('X17', '附憑證單據', { align: 'right' });
    const countCell = sheet.getCell('AB17');
    countCell.value = request['附憑證張數'] == null ? 0 : Number(request['附憑證張數']);
    countCell.numFmt = '0"張"';
    countCell.font = font(11);
    countCell.alignment = { horizontal: 'center', vertical: 'center' };

    // 外框（雙線）＋內部分隔線（細線），視覺上照範例的箱型表單，不逐格複製官方檔的每一條線
    for (let col = 1; col <= 28; col += 1) {
      applyBox(sheet.getRow(7).getCell(col), { top: 'double' });
      applyBox(sheet.getRow(14).getCell(col), { bottom: 'double' });
      applyBox(sheet.getRow(8).getCell(col), { bottom: 'hair' });
      [9, 10, 11, 12, 13].forEach(r => applyBox(sheet.getRow(r).getCell(col), { bottom: 'hair' }));
    }
    for (let row = 7; row <= 14; row += 1) {
      const left = sheet.getRow(row).getCell(1);
      const right = sheet.getRow(row).getCell(28);
      left.border = Object.assign({}, left.border, { left: { style: 'double', color: { argb: 'FF000000' } } });
      right.border = Object.assign({}, right.border, { right: { style: 'double', color: { argb: 'FF000000' } } });
    }
    for (let col = 1; col <= 28; col += 1) {
      applyBox(sheet.getRow(16).getCell(col), { top: 'double', bottom: 'thin' });
    }

    return workbook;
  }

  async function downloadPaymentRequestWorkbook(ExcelJS, request, activity) {
    const workbook = buildPaymentRequestWorkbook(ExcelJS, request, activity);
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
