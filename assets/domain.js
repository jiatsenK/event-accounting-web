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
      amount: normalizeAmount(input.amount),
      payment_method: String(input.payment_method || '').trim(),
      payer: String(input.payer || '').trim(),
      note: String(input.note || '').trim(),
    };
    if (!expense.activity_id) throw new Error('缺少活動');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.date)) throw new Error('支出日期格式錯誤');
    if (!expense.item) throw new Error('請填寫項目');
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
        payment_method: String(row.payment_method || ''),
        payer: String(row.payer || ''),
        reimbursement_status: String(row.reimbursement_status || ''),
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

  function expenseEditableFieldsEqual(left, right) {
    if (!left || !right) return false;
    return String(left.date || '') === String(right.date || '') &&
      String(left.item || '').trim() === String(right.item || '').trim() &&
      String(left.category || '').trim() === String(right.category || '').trim() &&
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
      pendingAdvances: Array.from(pendingByPayer, ([payer, amount]) => ({ payer, amount }))
    };
  }

  return {
    PAYMENT_METHODS,
    normalizeAmount,
    validateExpense,
    summarizeExpenses,
    summarizePettyCashSettlement,
    summarizeDashboard,
    expenseEditableFieldsEqual,
    findDuplicateExpense
  };
});