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

  function summarizeExpenses(expenses) {
    return (expenses || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }

  return { PAYMENT_METHODS, normalizeAmount, validateExpense, summarizeExpenses };
});
