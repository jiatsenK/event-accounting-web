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
    isAlreadySubmittedExpense,
    allocateAmount,
    expenseEditableFieldsEqual,
    findDuplicateExpense
  };
});
