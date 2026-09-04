(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ActivityBudget = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const YEAR_END_TYPES = new Set(['尾牙', '忘年會']);

  function number(value, label, allowZero) {
    const parsed = Number(String(value == null ? '' : value).replace(/,/g, '').trim());
    if (!Number.isFinite(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
      throw new Error(label + (allowZero ? '必須是 0 以上的數字' : '必須大於 0'));
    }
    return parsed;
  }

  function optionalNumber(value, label) {
    if (value === '' || value === null || value === undefined) return null;
    return number(value, label, true);
  }

  function normalizeLine(input) {
    const vendorValue = String(input.vendor_value || '').trim();
    const vendorKey = vendorValue.indexOf('key:') === 0 ? vendorValue.slice(4) : '';
    const vendor = vendorValue.indexOf('special:') === 0 ? vendorValue.slice(8) : '';
    const amount = number(input.amount, '預算金額', false);
    const sponsorAmount = optionalNumber(input.sponsor_amount, '廠商贊助款') || 0;
    const jdcAmount = optionalNumber(input.jdc_amount, 'JDC負擔');
    const item = String(input.item || '').trim() || vendor;
    if (!String(input.budget_item || '').trim()) throw new Error('請選擇預算項目');
    if (!item) throw new Error('請填寫預算品項');
    if (sponsorAmount > amount) throw new Error('廠商贊助款不可大於預算金額');
    const resolvedJdc = jdcAmount === null ? amount - sponsorAmount : jdcAmount;
    if (Math.abs(sponsorAmount + resolvedJdc - amount) > 0.01) {
      throw new Error('廠商贊助款與 JDC 負擔合計必須等於預算金額');
    }
    return {
      budget_line_id: String(input.budget_line_id || '').trim(),
      budget_item: String(input.budget_item || '').trim(),
      vendor_key: vendorKey,
      vendor,
      item,
      unit_price: number(input.unit_price, '預算單價', true),
      quantity: number(input.quantity, '預算數量', false),
      amount,
      sponsor_amount: sponsorAmount,
      jdc_amount: resolvedJdc,
      payment_terms: String(input.payment_terms || '').trim(),
      note: String(input.note || '').trim()
    };
  }

  function lineMatches(row, input) {
    const left = row || {};
    const right = input || {};
    const sameVendor = String(left.vendor_key || '') || String(right.vendor_key || '')
      ? String(left.vendor_key || '') === String(right.vendor_key || '')
      : String(left.vendor || '') === String(right.vendor || '');
    return String(left.budget_item || '') === String(right.budget_item || '') &&
      sameVendor &&
      String(left.item || '') === String(right.item || '') &&
      Number(left.unit_price) === Number(right.unit_price) &&
      Number(left.quantity) === Number(right.quantity) &&
      Number(left.amount) === Number(right.amount) &&
      Number(left.sponsor_amount || 0) === Number(right.sponsor_amount || 0) &&
      Number(left.jdc_amount || 0) === Number(right.jdc_amount || 0) &&
      String(left.payment_terms || '') === String(right.payment_terms || '') &&
      String(left.note || '') === String(right.note || '');
  }

  function isYearEnd(activity) {
    return YEAR_END_TYPES.has(String(activity && activity.activity_type || '').trim());
  }

  function nextStatus(status) {
    const current = String(status || '草稿').trim() || '草稿';
    if (current === '草稿') return '已提報';
    if (current === '已提報') return '已核准';
    return '';
  }

  function groupRows(rows) {
    const groups = [];
    const byKey = new Map();
    (rows || []).forEach(row => {
      const key = String(row.vendor_key || '').trim()
        ? 'key:' + row.vendor_key
        : String(row.vendor || '').trim()
          ? 'name:' + row.vendor
          : 'line:' + row.budget_line_id;
      if (!byKey.has(key)) {
        const group = { key, vendor: String(row.vendor || '').trim() || '未指定廠商', rows: [], total: 0 };
        byKey.set(key, group);
        groups.push(group);
      }
      const group = byKey.get(key);
      group.rows.push(row);
      group.total += Number(row.amount || 0);
    });
    return groups;
  }

  function safeFileName(value) {
    return String(value || '活動').replace(/[\\/:*?"<>|]/g, '_').trim() || '活動';
  }

  function money(value) {
    return new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function proposalCopy(payload) {
    const activity = payload && payload.activity || {};
    const previous = payload && payload.previous_activity || {};
    const total = Number(payload && payload.total || 0);
    const headcount = Number(activity.estimated_headcount || activity.actual_headcount || 0);
    const previousHeadcount = Number(previous.actual_headcount || previous.estimated_headcount || 0);
    const previousTotal = Number(payload && payload.previous_total || 0);
    const yearEnd = isYearEnd(activity);
    const title = yearEnd
      ? `有關 ${activity.name || '忘年會'}總費用提報乙案，呈請 核示`
      : `有關舉辦${activity.name || '活動'}費用乙案，呈請 核示`;
    const intro = [
      `一、擬辦理旨揭活動，活動時間：${activity.date || '待確認'}；活動地點：${activity.location || '待確認'}${activity.address ? '（' + activity.address + '）' : ''}。`,
      `二、本次活動預估總金額為新臺幣 ${money(total)} 元整${headcount ? `，預估參加人數 ${headcount} 人，人均 ${money(total / headcount)} 元` : ''}${yearEnd && previousHeadcount && previousTotal ? `；上一屆人均 ${money(previousTotal / previousHeadcount)} 元` : ''}，費用明細詳如附件。`,
      yearEnd ? '三、本案採實支實付；付款條件詳如附件預估費用明細。' : '三、費用擬依活動分攤設定辦理，結束後另行提報。',
      '四、呈請核示。'
    ];
    return { title, intro };
  }

  function applyBudgetCell(cell, options) {
    const opts = options || {};
    cell.font = { name: 'Microsoft JhengHei', size: opts.size || 14, bold: Boolean(opts.bold) };
    cell.alignment = { horizontal: opts.horizontal || 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: opts.doubleTop ? 'double' : 'thin', color: { argb: 'FF000000' } },
      bottom: { style: opts.doubleBottom ? 'double' : 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };
  }

  function buildBudgetWorkbook(ExcelJS, payload) {
    if (!ExcelJS || !ExcelJS.Workbook) throw new Error('Excel 產生器尚未載入');
    const activity = payload.activity || {};
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!rows.length) throw new Error('活動預算尚無品項');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'event-accounting';
    const sheet = workbook.addWorksheet('預估費用', {
      views: [{ showGridLines: false, zoomScale: 70 }],
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 2,
        horizontalCentered: true,
        verticalCentered: true,
        margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
      }
    });
    sheet.mergeCells('A1:G1');
    sheet.getCell('A1').value = `${activity.date || ''} ${activity.name || ''}預估費用`.trim();
    sheet.getCell('A1').font = { name: 'Microsoft JhengHei', size: 20, bold: true };
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 48;
    ['廠商', '品項', '單價(加服務費)', '數量', '金額(含稅)', '總額', '備註'].forEach((header, index) => {
      const cell = sheet.getRow(2).getCell(index + 1);
      cell.value = header;
      applyBudgetCell(cell, { bold: true });
    });
    sheet.getRow(2).height = 40;
    let rowNumber = 3;
    groupRows(rows).forEach(group => {
      const start = rowNumber;
      group.rows.forEach(row => {
        const excelRow = sheet.getRow(rowNumber);
        excelRow.height = 40;
        excelRow.values = [null, row.item, Number(row.unit_price), Number(row.quantity), Number(row.amount), null, row.note || row.payment_terms || null];
        for (let column = 1; column <= 7; column += 1) applyBudgetCell(excelRow.getCell(column));
        excelRow.getCell(3).numFmt = '#,##0';
        excelRow.getCell(5).numFmt = '$#,##0';
        rowNumber += 1;
      });
      const end = rowNumber - 1;
      if (end > start) {
        sheet.mergeCells(`A${start}:A${end}`);
        sheet.mergeCells(`F${start}:F${end}`);
      }
      sheet.getCell(`A${start}`).value = group.vendor;
      sheet.getCell(`F${start}`).value = group.total;
      sheet.getCell(`F${start}`).numFmt = '$#,##0';
      for (let column = 1; column <= 7; column += 1) {
        sheet.getRow(start).getCell(column).border.top = { style: 'double', color: { argb: 'FF000000' } };
        sheet.getRow(end).getCell(column).border.bottom = { style: 'double', color: { argb: 'FF000000' } };
      }
    });
    const totalRow = sheet.getRow(rowNumber);
    totalRow.height = 40;
    sheet.mergeCells(`A${rowNumber}:E${rowNumber}`);
    totalRow.getCell(1).value = '總計';
    totalRow.getCell(6).value = Number(payload.total || 0);
    totalRow.getCell(6).numFmt = '$#,##0';
    for (let column = 1; column <= 7; column += 1) applyBudgetCell(totalRow.getCell(column), { bold: true });
    rowNumber += 2;
    sheet.getCell(`E${rowNumber}`).value = '去年總額';
    sheet.getCell(`F${rowNumber}`).value = Number(payload.previous_total || 0);
    sheet.getCell(`F${rowNumber}`).numFmt = '$#,##0';
    applyBudgetCell(sheet.getCell(`E${rowNumber}`), { bold: true });
    applyBudgetCell(sheet.getCell(`F${rowNumber}`), { bold: true });
    if (payload.previous_activity) {
      rowNumber += 1;
      sheet.getCell(`E${rowNumber}`).value = '金額差異';
      sheet.getCell(`F${rowNumber}`).value = Number(payload.total || 0) - Number(payload.previous_total || 0);
      sheet.getCell(`F${rowNumber}`).numFmt = '$#,##0;[Red]-$#,##0';
      applyBudgetCell(sheet.getCell(`E${rowNumber}`), { bold: true });
      applyBudgetCell(sheet.getCell(`F${rowNumber}`), { bold: true });
    }
    if (isYearEnd(activity)) {
      const sponsor = rows.reduce((sum, row) => sum + Number(row.sponsor_amount || 0), 0);
      const jdc = rows.reduce((sum, row) => sum + Number(row.jdc_amount || 0), 0);
      [['廠商贊助款', sponsor], ['JDC負擔', jdc]].forEach(values => {
        rowNumber += 1;
        sheet.getCell(`E${rowNumber}`).value = values[0];
        sheet.getCell(`F${rowNumber}`).value = values[1];
        sheet.getCell(`F${rowNumber}`).numFmt = '$#,##0';
        applyBudgetCell(sheet.getCell(`E${rowNumber}`), { bold: true });
        applyBudgetCell(sheet.getCell(`F${rowNumber}`), { bold: true });
      });
    }
    const headcount = Number(activity.estimated_headcount || activity.actual_headcount || 0);
    if (headcount) {
      rowNumber += 1;
      sheet.getCell(`E${rowNumber}`).value = '今年人數';
      sheet.getCell(`F${rowNumber}`).value = headcount;
      sheet.getCell(`F${rowNumber}`).numFmt = '0" 人"';
      applyBudgetCell(sheet.getCell(`E${rowNumber}`), { bold: true });
      applyBudgetCell(sheet.getCell(`F${rowNumber}`), { bold: true });
      rowNumber += 1;
      sheet.getCell(`E${rowNumber}`).value = '今年預估人均';
      sheet.getCell(`F${rowNumber}`).value = Number(payload.total || 0) / headcount;
      sheet.getCell(`F${rowNumber}`).numFmt = '$#,##0';
      applyBudgetCell(sheet.getCell(`E${rowNumber}`), { bold: true });
      applyBudgetCell(sheet.getCell(`F${rowNumber}`), { bold: true });
    }
    const previous = payload.previous_activity || {};
    const previousHeadcount = Number(previous.actual_headcount || previous.estimated_headcount || 0);
    if (isYearEnd(activity) && previousHeadcount && Number(payload.previous_total || 0)) {
      rowNumber += 1;
      sheet.getCell(`E${rowNumber}`).value = '去年人數';
      sheet.getCell(`F${rowNumber}`).value = previousHeadcount;
      sheet.getCell(`F${rowNumber}`).numFmt = '0" 人"';
      applyBudgetCell(sheet.getCell(`E${rowNumber}`), { bold: true });
      applyBudgetCell(sheet.getCell(`F${rowNumber}`), { bold: true });
      rowNumber += 1;
      sheet.getCell(`E${rowNumber}`).value = '去年人均';
      sheet.getCell(`F${rowNumber}`).value = Number(payload.previous_total || 0) / previousHeadcount;
      sheet.getCell(`F${rowNumber}`).numFmt = '$#,##0';
      applyBudgetCell(sheet.getCell(`E${rowNumber}`), { bold: true });
      applyBudgetCell(sheet.getCell(`F${rowNumber}`), { bold: true });
      if (headcount) {
        rowNumber += 1;
        sheet.getCell(`E${rowNumber}`).value = '人均差異';
        sheet.getCell(`F${rowNumber}`).value = Number(payload.total || 0) / headcount - Number(payload.previous_total || 0) / previousHeadcount;
        sheet.getCell(`F${rowNumber}`).numFmt = '$#,##0;[Red]-$#,##0';
        applyBudgetCell(sheet.getCell(`E${rowNumber}`), { bold: true });
        applyBudgetCell(sheet.getCell(`F${rowNumber}`), { bold: true });
      }
    }
    [38.5, 45.8, 30.6, 13.5, 29, 21.9, 30.3].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    sheet.pageSetup.printArea = `A1:G${rowNumber}`;
    sheet.pageSetup.printTitlesRow = '1:2';
    return workbook;
  }

  function buildProposalDocument(docx, payload) {
    if (!docx || !docx.Document || !docx.Packer) throw new Error('Word 產生器尚未載入');
    const {
      AlignmentType, BorderStyle, Document, PageOrientation, Paragraph, Table, TableCell, TableLayoutType, TableRow,
      TextRun, VerticalAlign, WidthType
    } = docx;
    const activity = payload.activity || {};
    const copy = proposalCopy(payload);
    const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const text = (value, options) => new Paragraph({
      alignment: options && options.alignment || AlignmentType.LEFT,
      spacing: { after: options && options.after !== undefined ? options.after : 120, line: 360 },
      children: [new TextRun({ text: String(value || ''), bold: Boolean(options && options.bold), size: options && options.size || 24, font: 'DFKai-SB' })]
    });
    const cell = (value, options) => new TableCell({
      width: { size: options && options.width || 1600, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      borders,
      margins: { top: 80, bottom: 80, left: 80, right: 80 },
      children: [text(value, { alignment: AlignmentType.CENTER, bold: options && options.bold, size: options && options.size || 20, after: 0 })]
    });
    const approvalLabels = ['支店長', '副總經理', '管理部長', '建築部長', '施工主任', '法務'];
    const approvalTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      columnWidths: [1606, 1606, 1606, 1606, 1606, 1608],
      rows: [
        new TableRow({ children: approvalLabels.map(label => cell(label, { width: 1606, bold: true })) }),
        new TableRow({ height: { value: 900 }, children: approvalLabels.map(() => cell('', { width: 1606 })) })
      ]
    });
    const fullWidthCell = children => new TableCell({
      width: { size: 9638, type: WidthType.DXA },
      borders,
      children
    });
    const subjectTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      columnWidths: [9638],
      rows: [
        new TableRow({ children: [fullWidthCell([text('批　示：\n\n', { after: 0 })])] }),
        new TableRow({ children: [fullWidthCell([text('會簽單位意見：\n\n', { after: 0 })])] }),
        new TableRow({ children: [fullWidthCell([text('主　旨： ' + copy.title, { bold: true, after: 0 })])] }),
        new TableRow({ children: [fullWidthCell([
          text('說　明：', { bold: true }),
          ...copy.intro.map(line => text(line, { after: 100 }))
        ])] })
      ]
    });
    return new Document({
      creator: 'event-accounting',
      title: copy.title,
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1134, right: 1134, bottom: 700, left: 1134 }
          }
        },
        children: [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [5300, 4338],
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
            rows: [new TableRow({ children: [
              new TableCell({ borders: {}, width: { size: 5300, type: WidthType.DXA }, children: [
                text('KOKUDO　日商日本國土開發股份有限公司', { bold: true, size: 24, after: 20 }),
                text('台灣分公司', { bold: true, size: 24, after: 0 })
              ] }),
              new TableCell({ borders: {}, width: { size: 4338, type: WidthType.DXA }, children: [
                text('中華民國　　年　　月　　日', { alignment: AlignmentType.CENTER, size: 22, after: 20 }),
                text('（　）　字第　　　　　號', { alignment: AlignmentType.CENTER, size: 22, after: 0 })
              ] })
            ] })]
          }),
          text('■簽呈　□連絡　□報告', { alignment: AlignmentType.CENTER, bold: true, size: 30 }),
          approvalTable,
          subjectTable,
          text('20240321 版', { alignment: AlignmentType.RIGHT, size: 18, after: 0 })
        ]
      }]
    });
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

  async function downloadBudgetAttachment(ExcelJS, payload) {
    const workbook = buildBudgetWorkbook(ExcelJS, payload);
    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), safeFileName(payload.activity && payload.activity.name) + '_預估費用.xlsx');
  }

  async function downloadProposal(docx, payload) {
    const documentModel = buildProposalDocument(docx, payload);
    const blob = await docx.Packer.toBlob(documentModel);
    downloadBlob(blob, safeFileName(payload.activity && payload.activity.name) + '_預算簽呈.docx');
  }

  return {
    normalizeLine,
    lineMatches,
    isYearEnd,
    nextStatus,
    groupRows,
    proposalCopy,
    buildBudgetWorkbook,
    buildProposalDocument,
    downloadBudgetAttachment,
    downloadProposal
  };
});
