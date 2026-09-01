(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EventAccountingDomain = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const PAYMENT_METHODS = ['公司轉帳', '活動零用金', '個人代墊'];

  function normalizeAmount(value) {
    const amount = Number(String(value ?? '').replace(/,/g, '').trim());
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('金額必須大於 0');
    return amount;
  }

  function validateExpense(input) {
    const expense = {
      activity_id: String(input.activity_id || '').trim(),
      date: String(input.date || '').trim(),
      item: String(input.item || '').trim(),
      category: String(input.category || '').trim(),
      budget_item: String(input.budget_item || '').trim(),
      amount: normalizeAmount(input.amount),
      payment_method: String(input.payment_method || '').trim(),
      payer: String(input.payer || '').trim(),
      note: String(input.note || '').trim(),
    };
    if (!expense.activity_id) throw new Error('缺少活動');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.date)) throw new Error('支出日期格式錯誤');
    if (!expense.item) throw new Error('請填寫項目');
    if (!expense.budget_item) throw new Error('請選擇預算項目');
    if (!PAYMENT_METHODS.includes(expense.payment_method)) throw new Error('支付方式不正確');
    if (expense.payment_method === '個人代墊' && !expense.payer) throw new Error('個人代墊必須填寫支付人');
    return expense;
  }

  function expenseAmount(row) {
    const amount = Number(String(row && row.amount != null ? row.amount : '').replace(/,/g, '').trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      const label = String((row && row.item) || '未命名支出').trim();
      throw new Error(`支出金額異常：${label}`);
    }
    return amount;
  }

  function optionalNonNegativeNumber(value, label) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const number = Number(String(value).replace(/,/g, '').trim());
    if (!Number.isFinite(number) || number < 0) throw new Error(`${label}資料異常`);
    return number;
  }

  function summarizeExpenses(expenses) {
    return (expenses || []).reduce((sum, row) => sum + expenseAmount(row), 0);
  }

  function isPendingPersonalAdvance(row) {
    return row && row.payment_method === '個人代墊' && String(row.reimbursement_status || '').trim() === '待核銷';
  }

  function isPettyCashDeduction(row) {
    return row && (row.payment_method === '活動零用金' || isPendingPersonalAdvance(row));
  }

  function summarizePettyCashSettlement(activity, expenses) {
    const advance = optionalNonNegativeNumber(activity && activity.petty_cash_advance, '零用金暫支');
    const items = (expenses || [])
      .filter(isPettyCashDeduction)
      .map(row => ({
        expense_id: String(row.expense_id || ''),
        date: String(row.date || ''),
        item: String(row.item || ''),
        category: String(row.category || ''),
        budget_item: String(row.budget_item || ''),
        payment_method: String(row.payment_method || ''),
        payer: String(row.payer || ''),
        reimbursement_status: String(row.reimbursement_status || ''),
        vendor: String(row.vendor || ''),
        tax_id: String(row.tax_id || ''),
        invoice_no: String(row.invoice_no || ''),
        note: String(row.note || ''),
        amount: expenseAmount(row)
      }));
    const deductionTotal = items.reduce((sum, row) => sum + row.amount, 0);
    return {
      advance,
      deductionTotal,
      settlementAmount: advance === null ? null : advance - deductionTotal,
      items
    };
  }

  function summarizeBudgetBreakdown(activity, expenses) {
    const configured = Array.isArray(activity && activity.budget_items) ? activity.budget_items : [];
    const items = configured.map(item => ({
      name: String(item && item.name || '').trim(),
      budget: optionalNonNegativeNumber(item && item.amount, '預算項目'),
      actual: 0,
      remaining: 0
    })).filter(item => item.name && item.budget !== null);

    const byName = new Map(items.map(item => [item.name, item]));
    let unassignedTotal = 0;
    (expenses || []).forEach(row => {
      const amount = expenseAmount(row);
      const name = String(row && row.budget_item || '').trim();
      const target = byName.get(name);
      if (target) target.actual += amount;
      else unassignedTotal += amount;
    });

    items.forEach(item => {
      item.remaining = item.budget - item.actual;
    });

    return {
      items,
      unassignedTotal,
      totalBudget: items.reduce((sum, item) => sum + item.budget, 0),
      totalActual: items.reduce((sum, item) => sum + item.actual, 0) + unassignedTotal
    };
  }

  function expenseEditableFieldsEqual(left, right) {
    if (!left || !right) return false;
    return String(left.date || '') === String(right.date || '') &&
      String(left.item || '').trim() === String(right.item || '').trim() &&
      String(left.category || '').trim() === String(right.category || '').trim() &&
      String(left.budget_item || '').trim() === String(right.budget_item || '').trim() &&
      expenseAmount(left) === normalizeAmount(right.amount) &&
      String(left.payment_method || '') === String(right.payment_method || '') &&
      String(left.payer || '').trim() === String(right.payer || '').trim() &&
      String(left.note || '').trim() === String(right.note || '').trim();
  }

  function findDuplicateExpense(expenses, candidate, ignoreExpenseId) {
    const date = String(candidate && candidate.date || '');
    const item = String(candidate && candidate.item || '').trim();
    const amount = normalizeAmount(candidate && candidate.amount);
    const ignoreId = String(ignoreExpenseId || '');

    return (expenses || []).find(row => {
      if (ignoreId && String(row.expense_id || '') === ignoreId) return false;
      return String(row.date || '') === date &&
        String(row.item || '').trim() === item &&
        expenseAmount(row) === amount;
    }) || null;
  }

  function summarizeDashboard(activity, expenses) {
    const rows = expenses || [];
    const budget = optionalNonNegativeNumber(activity && activity.budget, '活動預算');
    const actualExpense = summarizeExpenses(rows);
    const settlement = summarizePettyCashSettlement(activity, rows);
    const budgetBreakdown = summarizeBudgetBreakdown(activity, rows);

    const pendingByPayer = new Map();
    rows.forEach(row => {
      if (!isPendingPersonalAdvance(row)) return;
      const payer = String(row.payer || '').trim();
      if (!payer) throw new Error('個人代墊缺少支付人');
      pendingByPayer.set(payer, (pendingByPayer.get(payer) || 0) + expenseAmount(row));
    });

    return {
      budget,
      actualExpense,
      budgetRemaining: budget === null ? null : budget - actualExpense,
      pettyCashAdvance: settlement.advance,
      pettyCashUsed: settlement.deductionTotal,
      pettyCashRemaining: settlement.settlementAmount,
      budgetBreakdown,
      pendingAdvances: Array.from(pendingByPayer, ([payer, amount]) => ({ payer, amount }))
    };
  }

  function summarizePaymentMethods(expenses) {
    const totals = new Map(PAYMENT_METHODS.map(name => [name, 0]));
    const extras = [];
    (expenses || []).forEach(row => {
      const method = String(row && row.payment_method || '').trim() || '未設定';
      const amount = expenseAmount(row);
      if (!totals.has(method)) {
        totals.set(method, 0);
        extras.push(method);
      }
      totals.set(method, totals.get(method) + amount);
    });
    const order = PAYMENT_METHODS.concat(extras);
    const items = order.filter(name => totals.has(name) && totals.get(name) !== 0)
      .map(name => ({ payment_method: name, amount: totals.get(name) }));
    return { total: items.reduce((sum, item) => sum + item.amount, 0), items };
  }

  function isAlreadySubmittedExpense(row) {
    const status = String(row && row.reimbursement_status || '').trim();
    return status === '已請款' || status === '已核銷';
  }

  function summarizeCurrentClaim(expenses) {
    let actualTotal = 0;
    let alreadySubmittedTotal = 0;
    (expenses || []).forEach(row => {
      const amount = expenseAmount(row);
      actualTotal += amount;
      if (isAlreadySubmittedExpense(row)) alreadySubmittedTotal += amount;
    });
    return {
      actualTotal,
      alreadySubmittedTotal,
      currentClaimTotal: actualTotal - alreadySubmittedTotal
    };
  }

  function isPettyCashExportExpense(row) {
    const method = String(row && row.payment_method || '').trim();
    return method === '活動零用金' || method === '個人代墊';
  }

  function defaultPettyCashExportLabel(row) {
    const category = String(row && row.category || '').trim();
    const item = String(row && row.item || '').trim();
    if (category === '車資') return '車資';
    const generic = new Set(['', '活動經費', '餐飲費用', '活動零用金']);
    if (!generic.has(category)) return category;
    if (item.includes('識別證')) return '識別證';
    return item || '零用金';
  }

  function parseSettlementDetail(note) {
    const lines = String(note || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    const detailLine = lines.find(value => value.startsWith('結算明細：'));
    if (!detailLine) return null;
    const vendorLine = lines.find(value => value.startsWith('結算廠商：'));
    const noteLine = lines.find(value => value.startsWith('結算備註：'));
    const rows = detailLine.slice('結算明細：'.length).split(/[；;]/).filter(Boolean).map(value => {
      const [item, unitPriceText, quantityText, amountText] = value.split('|').map(part => String(part || '').trim());
      const unitPrice = Number(unitPriceText);
      const quantity = Number(quantityText);
      const amount = Number(amountText);
      if (!item || ![unitPrice, quantity, amount].every(Number.isFinite)) {
        throw new Error('結算明細格式錯誤，請檢查帳務備註');
      }
      return { item, unitPrice, quantity, amount };
    });
    if (!rows.length) throw new Error('結算明細不可空白');
    return {
      vendor: vendorLine ? vendorLine.slice('結算廠商：'.length).trim() : '',
      note: noteLine ? noteLine.slice('結算備註：'.length).trim() : '',
      rows
    };
  }

  function normalizeStructuredSettlement(value) {
    if (!value || typeof value !== 'object') return null;
    const rows = Array.isArray(value.rows) ? value.rows.map(row => {
      const item = String(row && row.item || '').trim();
      const unitPrice = Number(row && row.unitPrice);
      const quantity = Number(row && row.quantity);
      const amount = Number(row && row.amount);
      if (!item || ![unitPrice, quantity, amount].every(Number.isFinite) || unitPrice < 0 || quantity <= 0 || amount < 0) {
        throw new Error('結算明細資料異常');
      }
      return { item, unitPrice, quantity, amount };
    }) : [];
    if (!rows.length) throw new Error('結算明細不可空白');
    return {
      vendor: String(value.vendor || '').trim(),
      note: String(value.note || '').trim(),
      rows
    };
  }

  function cleanPaymentStageItem(value) {
    const cleaned = String(value || '')
      .replace(/桌錢匯款/g, '')
      .replace(/預付款/g, '')
      .replace(/訂金/g, '')
      .replace(/尾款/g, '')
      .replace(/全款/g, '')
      .replace(/匯款/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || String(value || '').trim() || '未填品項';
  }

  function enrichMainVendorGroup(group) {
    const structured = group.rows.map(row => normalizeStructuredSettlement(row.structured_settlement)).filter(Boolean);
    const legacy = structured.length ? [] : group.rows.map(row => parseSettlementDetail(row.note)).filter(Boolean);
    const settlements = structured.length ? structured : legacy;
    if (settlements.length > 1) throw new Error('同一廠商有多筆結算明細：' + group.vendor);
    if (settlements.length === 1) {
      const settlement = settlements[0];
      const settlementTotal = settlement.rows.reduce((sum, row) => sum + row.amount, 0);
      if (settlementTotal !== group.total) throw new Error('結算明細與帳務金額不一致：' + group.vendor);
      if (settlement.vendor) group.vendor = settlement.vendor;
      group.items = settlement.rows;
      group.settlementNote = settlement.note;
      return group;
    }

    const itemsByLabel = new Map();
    group.rows.forEach(row => {
      const label = cleanPaymentStageItem(row.item);
      if (!itemsByLabel.has(label)) {
        itemsByLabel.set(label, { item: label, unitPrice: 0, quantity: 1, amount: 0 });
      }
      const item = itemsByLabel.get(label);
      item.amount += row.amount;
      item.unitPrice = item.amount;
    });
    group.items = Array.from(itemsByLabel.values());
    group.settlementNote = '';
    return group;
  }

  function buildReimbursementOverview(expenses, overrides) {
    const rows = (expenses || []).map(row => ({ ...row, amount: expenseAmount(row) }));
    const custom = overrides && typeof overrides === 'object' ? overrides : {};
    const directRows = rows.filter(row => !isPettyCashExportExpense(row));
    const taxIdByVendor = new Map();
    directRows.forEach(row => {
      const vendor = String(row.vendor || '').trim();
      const taxId = String(row.tax_id || '').trim();
      if (vendor && taxId) taxIdByVendor.set(vendor, taxId);
    });

    const mainByKey = new Map();
    const vendorToMainKey = new Map();
    const taxIdToMainKey = new Map();
    function mainKeyForDirect(row) {
      const vendor = String(row.vendor || '').trim();
      const taxId = String(row.tax_id || '').trim() || taxIdByVendor.get(vendor) || '';
      if (taxId) return `tax:${taxId}`;
      return `vendor:${vendor || String(row.item || '').trim() || '未填廠商'}`;
    }
    function addMainRow(key, row) {
      const vendor = String(row.vendor || '').trim();
      const fallback = vendor || String(row.item || '').trim() || '未填廠商';
      if (!mainByKey.has(key)) mainByKey.set(key, { id: key, vendor: fallback, rows: [], total: 0 });
      const group = mainByKey.get(key);
      if (vendor && vendor.length > String(group.vendor || '').length) group.vendor = vendor;
      group.rows.push(row);
      group.total += row.amount;
      if (vendor) vendorToMainKey.set(vendor, key);
      const taxId = String(row.tax_id || '').trim();
      if (taxId) taxIdToMainKey.set(taxId, key);
    }

    directRows.forEach(row => addMainRow(mainKeyForDirect(row), row));

    const pettyRows = [];
    rows.filter(isPettyCashExportExpense).forEach(row => {
      const vendor = String(row.vendor || '').trim();
      const taxId = String(row.tax_id || '').trim();
      const mainKey = (taxId && taxIdToMainKey.get(taxId)) || (vendor && vendorToMainKey.get(vendor)) || null;
      if (mainKey) addMainRow(mainKey, row);
      else pettyRows.push(row);
    });

    const pettyByGroup = new Map();
    pettyRows.forEach(row => {
      const expenseId = String(row.expense_id || '').trim();
      const override = expenseId && custom[expenseId] && typeof custom[expenseId] === 'object' ? custom[expenseId] : null;
      const defaultLabel = defaultPettyCashExportLabel(row);
      const label = String(override && override.label || defaultLabel).trim() || defaultLabel;
      const groupId = String(override && override.group_id || `petty:${defaultLabel}`).trim() || `petty:${defaultLabel}`;
      if (!pettyByGroup.has(groupId)) pettyByGroup.set(groupId, { id: groupId, label, rows: [], total: 0 });
      const group = pettyByGroup.get(groupId);
      if (override && override.label) group.label = label;
      group.rows.push(row);
      group.total += row.amount;
    });

    const mainVendors = Array.from(mainByKey.values()).map(enrichMainVendorGroup);
    const pettyItems = Array.from(pettyByGroup.values());
    const pettyCash = pettyItems.length ? {
      id: 'petty-cash',
      vendor: 'JDC活動零用金',
      items: pettyItems,
      total: pettyItems.reduce((sum, item) => sum + item.total, 0)
    } : null;
    const total = mainVendors.reduce((sum, group) => sum + group.total, 0) + (pettyCash ? pettyCash.total : 0);
    return { mainVendors, pettyCash, total };
  }

  function allocateAmount(totalValue, allocation) {
    const total = Number(totalValue);
    if (!Number.isFinite(total) || total < 0) throw new Error('分攤總額資料異常');
    const rawMethod = String(allocation && allocation.method || '').trim();
    const method = rawMethod === '每單位均分' ? '單位均分' : rawMethod;
    if (!['單位均分', '人數比例'].includes(method)) throw new Error('分攤方式不正確');
    const units = Array.isArray(allocation && allocation.units) ? allocation.units : [];
    if (!units.length) throw new Error('尚未設定分攤單位');

    const seen = new Set();
    const normalized = units.map(unit => {
      const name = String(unit && unit.name || '').trim();
      if (!name) throw new Error('分攤單位名稱不可空白');
      if (seen.has(name)) throw new Error('分攤單位重複：' + name);
      seen.add(name);
      const headcount = unit && unit.headcount !== '' && unit.headcount !== null && unit.headcount !== undefined
        ? Number(unit.headcount) : null;
      if (method === '人數比例' && (!Number.isFinite(headcount) || headcount <= 0)) {
        throw new Error('分攤單位人數異常：' + name);
      }
      return { name, headcount: Number.isFinite(headcount) ? headcount : null };
    });

    const weights = normalized.map(unit => method === '人數比例' ? unit.headcount : 1);
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    const rows = normalized.map((unit, index) => {
      const ratio = weights[index] / weightTotal;
      const raw = total * ratio;
      const rounded = Math.round(raw);
      return { name: unit.name, headcount: unit.headcount, ratio, raw, amount: rounded, adjustment: 0 };
    });
    const roundedTotal = rows.reduce((sum, row) => sum + row.amount, 0);
    const tail = total - roundedTotal;
    if (tail !== 0) {
      const target = rows[rows.length - 1];
      target.amount += tail;
      target.adjustment = tail;
    }
    return { method, total, weightTotal, rows };
  }

  return {
    PAYMENT_METHODS,
    normalizeAmount,
    validateExpense,
    summarizeExpenses,
    summarizePettyCashSettlement,
    summarizeBudgetBreakdown,
    summarizeDashboard,
    summarizePaymentMethods,
    summarizeCurrentClaim,
    buildReimbursementOverview,
    isAlreadySubmittedExpense,
    allocateAmount,
    expenseEditableFieldsEqual,
    findDuplicateExpense
  };
});

// UI/export compatibility layer for the current single-page frontend.
// The submitted reimbursement workbook is the formatting contract for generated Excel files.
if (typeof window !== 'undefined') {
  const applyFrontendCompatibility = () => {
    function applySemanticBudgetDisplay() {
      try {
        if (typeof state === 'undefined' || !state.activity) return;
        const summary = EventAccountingDomain.summarizeDashboard(state.activity, state.expenses || []);
        const remaining = summary.budgetRemaining;
        const wrapper = document.querySelector('.budget-delta');
        const value = document.querySelector('#budgetRemaining');
        if (!wrapper || !value || remaining === null || remaining === undefined) return;
        const label = remaining < 0 ? '超支' : '剩餘預算';
        if (wrapper.firstChild && wrapper.firstChild.nodeType === 3) wrapper.firstChild.nodeValue = `${label} `;
        value.textContent = typeof money === 'function' ? money(Math.abs(remaining)) : String(Math.abs(remaining));
        value.style.color = remaining < 0 ? '#a12d2d' : '';
      } catch (_) {}
    }

    if (typeof render === 'function') {
      const baseRender = render;
      render = function (data) {
        baseRender(data);
        applySemanticBudgetDisplay();
      };
      applySemanticBudgetDisplay();
    }

    const moneyFormat = '_-"$"* #,##0_-;\\-"$"* #,##0_-;_-"$"* "-"??_-;_-@_-';
    const plainNumberFormat = '#,##0;[Red]\\(#,##0\\);0';
    const black = { argb: 'FF000000' };
    const thin = () => ({ style: 'thin', color: black });
    const hair = () => ({ style: 'hair', color: black });
    const medium = () => ({ style: 'medium', color: black });
    const double = () => ({ style: 'double', color: black });
    const noBorder = () => ({});
    const nf = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
    const excelDate = value => {
      const text = String(value || '').trim();
      const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : text;
    };
    const reportCategoryValue = row => String(row && (row.category || row.budget_item) || '').trim();
    const reportNoteValue = row => {
      if (String(row && row.payment_method || '').trim() !== '個人代墊') return String(row && row.note || '').trim();
      const payer = String(row && row.payer || '').trim();
      return payer ? `${payer}代墊` : '個人代墊';
    };
    const setFont = (cell, size = 16, bold = false, light = false) => {
      cell.font = { name: light ? 'Microsoft JhengHei Light' : 'Microsoft JhengHei', size, bold };
    };
    const setCenter = (cell, wrap = true) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: wrap };
    };
    const setThinBox = cell => {
      cell.border = { left: thin(), right: thin(), top: thin(), bottom: thin() };
    };


    if (typeof buildOverviewSheet === 'function') {
      buildOverviewSheet = function (workbook, activity, expenses, overrides) {
        const sheet = workbook.addWorksheet('核銷總覽', { views: [{ zoomScale: 60 }] });
        Object.assign(sheet.pageSetup, {
          paperSize: 9,
          orientation: 'landscape',
          horizontalCentered: true,
          verticalCentered: false,
          fitToPage: true,
          fitToHeight: 0,
          scale: 59,
          margins: { left: 0.7087, right: 0.7087, top: 0.748, bottom: 0.748, header: 0.315, footer: 0.315 }
        });

        const reimbursement = EventAccountingDomain.buildReimbursementOverview(expenses || [], overrides || {});
        const payment = EventAccountingDomain.summarizePaymentMethods(expenses || []);
        const claim = EventAccountingDomain.summarizeCurrentClaim(expenses || []);
        const pettySettlement = EventAccountingDomain.summarizePettyCashSettlement(activity || {}, expenses || []);
        const groups = reimbursement.mainVendors.map(group => {
          const notes = [];
          if (group.settlementNote) notes.push(group.settlementNote);
          else (group.rows || []).forEach(row => {
            const note = typeof paymentExplanation === 'function' ? paymentExplanation(row) : String(row.reimbursement_status || '').trim();
            if (note && !notes.includes(note)) notes.push(note);
          });
          return { vendor: group.vendor, rows: group.items || [], total: group.total, notes };
        });
        if (reimbursement.pettyCash) {
          const moved = reimbursement.mainVendors.flatMap(group => (group.rows || [])
            .filter(row => ['活動零用金', '個人代墊'].includes(String(row.payment_method || '').trim()))
            .map(row => ({ row, vendor: group.vendor })));
          let pettyNote = '零用金付款';
          if (pettySettlement && pettySettlement.deductionTotal != null) {
            const movedText = moved.map(item => `${String(item.row.item || '零用金支出').trim()} ${nf(item.row.amount)} 已計入${item.vendor}`).join('、');
            pettyNote = movedText
              ? `零用金實際支出 ${nf(pettySettlement.deductionTotal)}，其中${movedText}，本列計 ${nf(reimbursement.pettyCash.total)}。`
              : `零用金實際支出 ${nf(pettySettlement.deductionTotal)}，本列計 ${nf(reimbursement.pettyCash.total)}。`;
          }
          groups.push({
            vendor: reimbursement.pettyCash.vendor,
            rows: reimbursement.pettyCash.items.map(item => ({ item: item.label, unitPrice: item.total, quantity: 1, amount: item.total })),
            total: reimbursement.pettyCash.total,
            notes: [pettyNote]
          });
        }

        sheet.mergeCells('A1:H1');
        const title = sheet.getCell('A1');
        title.value = `${activity.name || state.activityId} 結算費用`;
        setFont(title, 22, true);
        setCenter(title, false);
        sheet.getRow(1).height = 40.8;

        const headers = ['活動名稱', '廠商', '品項', '單價(加服務費)', '數量', '金額(含稅)', '總額', '備註'];
        const headerRow = sheet.getRow(3);
        headerRow.height = 60;
        headers.forEach((value, index) => {
          const cell = headerRow.getCell(index + 1);
          cell.value = value;
          setFont(cell, 16, true);
          setCenter(cell, true);
          cell.border = { left: index === 0 ? medium() : thin(), right: index === headers.length - 1 ? medium() : thin(), top: medium(), bottom: medium() };
        });

        let rowNumber = 4;
        groups.forEach(group => {
          const start = rowNumber;
          const rows = group.rows && group.rows.length ? group.rows : [{ item: '', unitPrice: group.total, quantity: 1, amount: group.total }];
          rows.forEach((row, itemIndex) => {
            const current = sheet.getRow(rowNumber);
            current.height = 60;
            current.values = ['', group.vendor, row.item || '', row.unitPrice, row.quantity, row.amount, '', ''];
            for (let column = 1; column <= 8; column += 1) {
              const cell = current.getCell(column);
              setFont(cell, 16, false);
              setCenter(cell, true);
              if (column === 4 || column === 6) cell.numFmt = moneyFormat;
              const isFirst = itemIndex === 0;
              const isLast = itemIndex === rows.length - 1;
              cell.border = column === 1
                ? { left: medium(), right: thin(), top: thin(), bottom: thin() }
                : { left: thin(), right: column === 8 ? medium() : thin(), top: isFirst ? double() : thin(), bottom: isLast ? double() : thin() };
            }
            rowNumber += 1;
          });
          const end = rowNumber - 1;
          if (end > start) {
            sheet.mergeCells(`B${start}:B${end}`);
            sheet.mergeCells(`G${start}:G${end}`);
            sheet.mergeCells(`H${start}:H${end}`);
          }
          sheet.getCell(`B${start}`).value = group.vendor;
          sheet.getCell(`G${start}`).value = group.total;
          sheet.getCell(`G${start}`).numFmt = moneyFormat;
          sheet.getCell(`H${start}`).value = (group.notes || []).join('\n');
          setCenter(sheet.getCell(`H${start}`), true);
        });

        const lastDataRow = Math.max(4, rowNumber - 1);
        if (groups.length) sheet.mergeCells(`A4:A${lastDataRow}`);
        const activityCell = sheet.getCell('A4');
        activityCell.value = activity.name || state.activityId;
        setFont(activityCell, 16, false);
        setCenter(activityCell, true);

        const totalRowNumber = rowNumber;
        const totalRow = sheet.getRow(totalRowNumber);
        totalRow.height = 40.8;
        for (let column = 1; column <= 8; column += 1) {
          const cell = totalRow.getCell(column);
          setFont(cell, 16, true);
          setCenter(cell, true);
          cell.border = { left: column === 1 ? medium() : thin(), right: column === 8 ? medium() : thin(), top: thin(), bottom: medium() };
        }
        sheet.mergeCells(`B${totalRowNumber}:F${totalRowNumber}`);
        sheet.getCell(`B${totalRowNumber}`).value = '總計';
        sheet.getCell(`G${totalRowNumber}`).value = claim.actualTotal;
        sheet.getCell(`G${totalRowNumber}`).numFmt = moneyFormat;

        sheet.mergeCells('K3:M3');
        const summaryTitle = sheet.getCell('K3');
        summaryTitle.value = `${activity.name || state.activityId} 費用彙總`;
        setFont(summaryTitle, 16, false);
        setCenter(summaryTitle, false);
        ['K3', 'L3', 'M3'].forEach(address => setThinBox(sheet.getCell(address)));
        sheet.getRow(3).height = 60;
        const summaryRows = [
          ['活動總支出', claim.actualTotal],
          ['已另行提報', claim.alreadySubmittedTotal],
          ['本次請款', claim.currentClaimTotal],
          ...payment.items.map(item => [`${item.payment_method}小計`, item.amount])
        ];
        summaryRows.forEach((entry, index) => {
          const targetRow = 4 + index;
          sheet.mergeCells(`K${targetRow}:L${targetRow}`);
          sheet.getCell(`K${targetRow}`).value = entry[0];
          sheet.getCell(`M${targetRow}`).value = entry[1];
          ['K', 'L', 'M'].forEach(column => {
            const cell = sheet.getCell(`${column}${targetRow}`);
            setFont(cell, 16, false);
            setCenter(cell, true);
            setThinBox(cell);
          });
          sheet.getCell(`M${targetRow}`).numFmt = moneyFormat;
          sheet.getRow(targetRow).height = 60;
        });

        [14.9375, 30.5859375, 38.87890625, 25.703125, 30.5859375, 13, 19.76171875, 48.1171875, 13, 6.1171875, 20.87890625, 10.87890625, 23.1171875]
          .forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
        sheet.pageSetup.printArea = `A1:H${totalRowNumber}`;
        return sheet;
      };
    }

    if (typeof buildPettyCashSheet === 'function') {
      buildPettyCashSheet = function (workbook, activity, expenses, options = {}) {
        const applicationDate = String(activity && activity.petty_cash_application_date || '').trim();
        if (!applicationDate) throw new Error('尚未讀到零用金申請日，請先更新 GAS 後端');
        const settlement = EventAccountingDomain.summarizePettyCashSettlement(activity, expenses || []);
        if (settlement.advance === null) throw new Error('尚未登記零用金金額');
        const rows = settlement.items.slice().sort((left, right) =>
          String(left.date || '').localeCompare(String(right.date || '')) || String(left.item || '').localeCompare(String(right.item || ''))
        );
        const sheet = workbook.addWorksheet(options.sheetName || '零用金使用明細', { views: [{ showGridLines: false, zoomScale: 70 }] });
        Object.assign(sheet.pageSetup, {
          paperSize: 9,
          orientation: 'portrait',
          horizontalCentered: true,
          verticalCentered: false,
          scale: 55,
          margins: { left: 0.2362204724409449, right: 0.2362204724409449, top: 0.4330708661417323, bottom: 0.4330708661417323, header: 0.1968503937007874, footer: 0.1968503937007874 }
        });

        sheet.mergeCells('A1:I1');
        const title = sheet.getCell('A1');
        title.value = `${activity.name || state.activityId}零用金費用明細`;
        setFont(title, 22, true);
        setCenter(title, false);
        title.numFmt = plainNumberFormat;
        sheet.getRow(1).height = 80.4;

        const headers = ['編號', '日期', '廠商名稱', '發票號碼', '廠商統編', '項目摘要', '支出', '收入', '結餘', '分類', '備註'];
        const headerRow = sheet.getRow(2);
        headerRow.height = 60;
        headers.forEach((value, index) => {
          const cell = headerRow.getCell(index + 1);
          cell.value = value;
          setFont(cell, 16, true);
          setCenter(cell, true);
          if (index === 1) cell.numFmt = 'yyyy/mm/dd';
          if ([6, 7, 8].includes(index)) cell.numFmt = plainNumberFormat;
          if (index <= 8) cell.border = { left: index === 6 ? noBorder() : thin(), right: thin(), top: thin(), bottom: thin() };
        });

        const firstRow = sheet.getRow(3);
        firstRow.height = 60;
        firstRow.values = ['', excelDate(applicationDate), '', '', '', '零用金請款', 0, settlement.advance, '', '', ''];
        firstRow.getCell(9).value = { formula: 'H3-G3', result: settlement.advance };

        let balance = settlement.advance;
        const dataRows = [{ row: firstRow, isFirstFunding: true }];
        rows.forEach((row, index) => {
          const rowNumber = 4 + index;
          balance -= row.amount;
          const target = sheet.getRow(rowNumber);
          target.height = 60;
          target.values = [index + 1, excelDate(row.date), row.vendor || row.item, String(row.invoice_no || ''), String(row.tax_id || ''), row.item, row.amount, 0, '', reportCategoryValue(row), reportNoteValue(row)];
          target.getCell(9).value = { formula: `I${rowNumber - 1}-G${rowNumber}+H${rowNumber}`, result: balance };
          dataRows.push({ row: target, isFirstFunding: false });
        });

        const lastDataRowNumber = 3 + rows.length;
        dataRows.forEach(({ row, isFirstFunding }) => {
          const rowNumber = row.number;
          const last = rowNumber === lastDataRowNumber;
          for (let column = 1; column <= 11; column += 1) {
            const cell = row.getCell(column);
            setFont(cell, 16, false);
            if (column >= 7 && column <= 9) {
              cell.alignment = { horizontal: 'right', vertical: 'middle' };
              cell.numFmt = moneyFormat;
            } else setCenter(cell, true);
            if (column === 2) cell.numFmt = 'yyyy/mm/dd';
            if (column <= 9) {
              cell.border = { left: column === 7 ? noBorder() : thin(), right: thin(), top: isFirstFunding ? noBorder() : hair(), bottom: last ? thin() : hair() };
            } else if (column === 10) cell.border = { left: noBorder(), right: thin(), top: thin(), bottom: thin() };
            else cell.border = { left: thin(), right: thin(), top: thin(), bottom: thin() };
          }
        });

        const summaryRowNumber = lastDataRowNumber + 3;
        sheet.getRow(summaryRowNumber - 1).height = 45.9;
        sheet.getRow(summaryRowNumber).height = 45.9;
        sheet.mergeCells(`A${summaryRowNumber}:I${summaryRowNumber}`);
        const summary = sheet.getCell(`A${summaryRowNumber}`);
        const settlementLabel = settlement.settlementAmount < 0
          ? `應補款 $${nf(Math.abs(settlement.settlementAmount))}`
          : settlement.settlementAmount > 0 ? `應回沖 $${nf(settlement.settlementAmount)}` : '無需補款／回沖 $0';
        summary.value = `零用金暫支 $${nf(settlement.advance)}／實際支出 $${nf(settlement.deductionTotal)}／${settlementLabel}`;
        setFont(summary, 16, true);
        summary.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

        [7.64453125, 19.8203125, 29.76171875, 22.17578125, 21.17578125, 22.41015625, 23.5859375, 13, 24.64453125, 20, 62.9375]
          .forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
        sheet.pageSetup.printArea = `A1:I${summaryRowNumber}`;
        return { sheet, settlement, finalRowNumber: lastDataRowNumber, summaryRow2: summaryRowNumber };
      };
    }

    if (typeof buildAllocationSheet === 'function') {
      buildAllocationSheet = function (workbook, activity, expenses, allocation) {
        if (!allocation || !Array.isArray(allocation.units) || !allocation.units.length) throw new Error('尚未讀到分攤資料，請先更新 GAS 後端');
        if (String(allocation.method || '').trim() !== '人數比例') throw new Error('正式分攤表目前使用人數比例');
        const units = allocation.units.map(unit => ({ name: String(unit.name || '').trim(), headcount: Number(unit.headcount) }));
        if (units.some(unit => !unit.name || !Number.isFinite(unit.headcount) || unit.headcount <= 0)) throw new Error('分攤單位資料異常');
        const total = EventAccountingDomain.summarizeExpenses(expenses || []);
        const headcountTotal = units.reduce((sum, unit) => sum + unit.headcount, 0);
        const netTotalRaw = total / 1.05;
        const netTotalDisplayed = Math.round(netTotalRaw);
        const grossRounded = units.map(unit => Math.round(total / headcountTotal * unit.headcount));
        const netRounded = units.map(unit => Math.round(netTotalRaw / headcountTotal * unit.headcount));
        const grossTail = total - grossRounded.reduce((sum, amount) => sum + amount, 0);
        const netTail = netTotalDisplayed - netRounded.reduce((sum, amount) => sum + amount, 0);
        const tailIndex = units.length > 1 ? 1 : 0;
        grossRounded[tailIndex] += grossTail;
        netRounded[tailIndex] += netTail;

        const sheet = workbook.addWorksheet('分攤表 ');
        Object.assign(sheet.pageSetup, {
          paperSize: 9,
          orientation: 'landscape',
          horizontalCentered: true,
          verticalCentered: true,
          margins: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 }
        });

        sheet.mergeCells('B3:E3');
        const title = sheet.getCell('B3');
        title.value = `${String(activity.name || state.activityId).replace(/\s+/g, '')} 分攤表`;
        sheet.getRow(3).height = 23.4;
        for (let column = 2; column <= 5; column += 1) {
          const cell = sheet.getRow(3).getCell(column);
          setFont(cell, 12, false, true);
          setCenter(cell, false);
          setThinBox(cell);
        }
        const note = sheet.getCell('G3');
        note.value = '零用金未稅=零用金的總費用合計未稅價/總人數*各單位人數';
        setFont(note, 12, false, true);
        note.font = { ...note.font, color: { argb: 'FFFF0000' } };
        note.alignment = { vertical: 'middle' };

        sheet.mergeCells('B4:B5');
        sheet.mergeCells('C4:D4');
        sheet.mergeCells('C5:D5');
        sheet.getCell('B4').value = '總計';
        sheet.getCell('C4').value = '含稅';
        sheet.getCell('E4').value = '未稅';
        const overviewSheet = workbook.getWorksheet('核銷總覽');
        let overviewTotalRow = overviewSheet ? overviewSheet.rowCount : 1;
        if (overviewSheet) {
          for (let rowIndex = 1; rowIndex <= overviewSheet.rowCount; rowIndex += 1) {
            if (String(overviewSheet.getCell(`B${rowIndex}`).value || '').trim() === '總計') overviewTotalRow = rowIndex;
          }
        }
        sheet.getCell('C5').value = { formula: `核銷總覽!G${overviewTotalRow}`, result: total };
        sheet.getCell('E5').value = { formula: 'C5/1.05', result: netTotalRaw };
        ['B4', 'C4', 'D4', 'E4', 'B5', 'C5', 'D5', 'E5'].forEach(address => {
          const cell = sheet.getCell(address);
          setFont(cell, 12, false, true);
          setCenter(cell, false);
          setThinBox(cell);
        });
        sheet.getCell('C5').numFmt = moneyFormat;
        sheet.getCell('E5').numFmt = moneyFormat;
        sheet.getRow(4).height = 25;
        sheet.getRow(5).height = 25;

        const firstUnitRow = 8;
        const lastUnitRow = firstUnitRow + units.length - 1;
        const totalRowNumber = lastUnitRow + 1;
        sheet.mergeCells(`A7:A${lastUnitRow}`);
        sheet.mergeCells('B7:C7');
        sheet.getCell('A7').value = '分攤表';
        sheet.getCell('B7').value = '分攤單位';
        sheet.getCell('D7').value = '各單位小計-含稅';
        sheet.getCell('E7').value = '各單位小計-未稅';
        for (let column = 1; column <= 5; column += 1) {
          const cell = sheet.getRow(7).getCell(column);
          setFont(cell, 12, false, true);
          setCenter(cell, false);
          setThinBox(cell);
        }
        sheet.getRow(7).height = 25;

        units.forEach((unit, index) => {
          const rowNumber = firstUnitRow + index;
          const row = sheet.getRow(rowNumber);
          row.height = 25;
          row.getCell(2).value = unit.name;
          row.getCell(3).value = unit.headcount;
          const grossAdjustment = index === tailIndex && grossTail ? `${grossTail > 0 ? '+' : ''}${grossTail}` : '';
          const netAdjustment = index === tailIndex && netTail ? `${netTail > 0 ? '+' : ''}${netTail}` : '';
          row.getCell(4).value = { formula: `ROUND($C$5/$C$${totalRowNumber}*C${rowNumber}, 0)${grossAdjustment}`, result: grossRounded[index] };
          row.getCell(5).value = { formula: `ROUND($E$5/$C$${totalRowNumber}*C${rowNumber},0)${netAdjustment}`, result: netRounded[index] };
          for (let column = 2; column <= 5; column += 1) {
            const cell = row.getCell(column);
            setFont(cell, 12, false, true);
            cell.alignment = column === 2 ? { vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
            setThinBox(cell);
          }
          row.getCell(4).numFmt = moneyFormat;
          row.getCell(5).numFmt = moneyFormat;
        });

        sheet.mergeCells(`A${totalRowNumber}:B${totalRowNumber}`);
        sheet.getCell(`A${totalRowNumber}`).value = '合計';
        sheet.getCell(`C${totalRowNumber}`).value = { formula: `SUM(C${firstUnitRow}:C${lastUnitRow})`, result: headcountTotal };
        sheet.getCell(`D${totalRowNumber}`).value = { formula: `SUM(D${firstUnitRow}:D${lastUnitRow})`, result: total };
        sheet.getCell(`E${totalRowNumber}`).value = { formula: `SUM(E${firstUnitRow}:E${lastUnitRow})`, result: netTotalDisplayed };
        for (let column = 1; column <= 5; column += 1) {
          const cell = sheet.getRow(totalRowNumber).getCell(column);
          setFont(cell, 12, false, true);
          setCenter(cell, false);
          setThinBox(cell);
        }
        sheet.getCell(`D${totalRowNumber}`).numFmt = moneyFormat;
        sheet.getCell(`E${totalRowNumber}`).numFmt = moneyFormat;
        sheet.getRow(totalRowNumber).height = 25;

        [9.05859375, 16.87890625, 10.9375, 20, 21.8203125, 8.9375, 13]
          .forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
        sheet.pageSetup.printArea = `A3:E${totalRowNumber + 4}`;
        return sheet;
      };
    }
  };

  if (document.readyState === 'complete') applyFrontendCompatibility();
  else window.addEventListener('load', applyFrontendCompatibility, { once: true });
}
