(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AccountingViews = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  const ACCOUNTING_TEMPLATE = "<div class=\"accounting-app\">\n<div class=\"accounting-context-fields\" hidden aria-hidden=\"true\">\n  <span id=\"activityName\"></span><span id=\"activityMeta\"></span>\n  <select id=\"activitySelector\"><option value=\"\"></option></select>\n</div>\n<div id=\"configPanel\" class=\"card section\" hidden><h2>第一次設定</h2><p class=\"config-note\">輸入活動帳務存取碼。存取碼只保留在這次瀏覽器工作階段，不會寫進網址或 GitHub。</p><input id=\"tokenInput\" type=\"password\" autocomplete=\"off\" placeholder=\"存取碼\"><button id=\"saveConfig\" type=\"button\" style=\"margin-top:10px\">開始使用</button></div>\n<div id=\"appContent\">\n  <div id=\"status\" class=\"status\"></div><div hidden aria-hidden=\"true\"><div id=\"budgetAlert\"></div><table><tbody id=\"budgetRows\"></tbody></table></div>\n\n  <section class=\"tab-panel\" data-tab-panel=\"overview\" role=\"tabpanel\">\n    <div class=\"summary-grid\">\n      <div class=\"card metric-card\"><div class=\"label\">活動預算</div><div id=\"budget\" class=\"value\">讀取中…</div></div>\n      <div class=\"card metric-card\"><div class=\"label\">目前實際支出</div><div id=\"actualExpense\" class=\"value\">讀取中…</div><div class=\"budget-delta\">預算差額 <span id=\"budgetRemaining\">…</span></div></div>\n      <div class=\"card metric-card\"><div class=\"label\">人均費用</div><div id=\"perCapitaExpense\" class=\"value\">讀取中…</div><div id=\"participantCount\" class=\"muted\">參加人數讀取中…</div></div>\n      <div class=\"card metric-card\"><div class=\"label\">零用金</div><div class=\"petty-grid\"><div class=\"petty-stat\"><div class=\"label\">暫支</div><div id=\"pettyCashAdvance\" class=\"value\">…</div></div><div class=\"petty-stat\"><div class=\"label\">已使用</div><div id=\"pettyCashUsed\" class=\"value\">…</div></div><div class=\"petty-stat\"><div class=\"label\">剩餘待沖銷</div><div id=\"pettyCashRemaining\" class=\"value\">…</div></div></div></div>\n    </div>\n\n    <div class=\"overview-split section\">\n      <div class=\"card\"><div class=\"section-heading\"><div><h2>待核銷代墊</h2><div class=\"muted\">尚未完成核銷的個人代墊</div></div></div><div class=\"pending-total\"><span class=\"label\">待核銷合計</span><div id=\"pendingAdvanceTotal\" class=\"value\">…</div></div><div id=\"pendingAdvances\"><div class=\"empty compact\">讀取中…</div></div></div>\n      <div class=\"card\"><div class=\"section-heading\"><div><h2>最近支出</h2><div class=\"muted\">最新 5 筆帳務記錄</div></div><button type=\"button\" class=\"link-button\" data-open-tab=\"expenses\">查看全部</button></div><div style=\"overflow:auto\"><table class=\"recent-table\"><thead><tr><th>日期</th><th>項目</th><th class=\"num\">金額</th></tr></thead><tbody id=\"recentExpenseRows\"><tr><td colspan=\"3\" class=\"empty compact\">讀取中…</td></tr></tbody></table></div></div>\n    </div>\n  </section>\n\n  <section class=\"tab-panel\" data-tab-panel=\"expenses\" role=\"tabpanel\" hidden>\n    <div class=\"card\">\n      <div class=\"section-heading\"><div><h2>支出明細</h2><div class=\"muted\">查詢、篩選或修正已登記的支出</div></div><button id=\"showExpenseEditor\" type=\"button\">新增支出</button></div>\n      <div id=\"expenseEditor\" class=\"editor-panel\" hidden><div class=\"section-heading\"><h2 id=\"expenseFormTitle\">新增支出</h2><button id=\"closeExpenseEditor\" class=\"secondary\" type=\"button\">關閉</button></div><form id=\"expenseForm\"><div class=\"row\"><input name=\"date\" type=\"date\" required><input name=\"amount\" type=\"number\" min=\"1\" step=\"1\" placeholder=\"金額\" required></div><div class=\"row\"><input name=\"item\" placeholder=\"項目，例如：車資\" required><input name=\"category\" placeholder=\"分類（選填）\"></div><div class=\"row\"><select name=\"budget_item\" required><option value=\"\">選擇預算項目</option></select><select name=\"payment_method\" required><option value=\"公司轉帳\">公司轉帳</option><option value=\"活動零用金\">活動零用金</option><option value=\"個人代墊\">個人代墊</option></select></div><input name=\"payer\" placeholder=\"支付人，個人代墊時必填\"><textarea name=\"note\" placeholder=\"備註（選填）\"></textarea><div class=\"form-actions\"><button id=\"submitExpenseButton\" type=\"submit\">登記支出</button><button id=\"cancelEdit\" class=\"secondary\" type=\"button\" hidden>取消修改</button></div><div id=\"expenseStatus\" class=\"status form-status\" aria-live=\"polite\"></div></form></div>\n      <div class=\"table-tools\"><input id=\"expenseSearch\" type=\"search\" placeholder=\"搜尋日期、項目、分類、備註或支付人\"><select id=\"expensePaymentFilter\"><option value=\"\">全部支付方式</option><option value=\"公司轉帳\">公司轉帳</option><option value=\"活動零用金\">活動零用金</option><option value=\"個人代墊\">個人代墊</option></select></div>\n      <div class=\"muted inline-hint\">直接點表格中的欄位即可原地修改；核銷狀態由支付方式自動帶入，不在此手動改。</div><div id=\"inlineExpenseStatus\" class=\"status form-status\" aria-live=\"polite\"></div>\n      <div style=\"overflow:auto\"><table><thead><tr><th>日期</th><th>項目</th><th>分類</th><th>預算項目</th><th>支付方式</th><th>支付人</th><th>核銷狀態</th><th class=\"num\">金額</th><th>備註</th><th></th></tr></thead><tbody id=\"expenseRows\"><tr><td colspan=\"10\" class=\"empty\">讀取中…</td></tr></tbody></table></div>\n    </div>\n  </section>\n\n  <section class=\"tab-panel\" data-tab-panel=\"reimbursement\" role=\"tabpanel\" hidden>\n    <div class=\"card\"><div class=\"section-heading\"><div><h2>核銷整理</h2><div class=\"muted\">下載前先確認最後會如何合併與顯示</div></div><div class=\"compact-downloads\"><button id=\"generateReimbursementReport\" type=\"button\">下載完整核銷</button><button id=\"generatePettyCashReport\" class=\"secondary\" type=\"button\">零用金明細</button></div></div><p class=\"muted export-preview-note\">這裡顯示「核銷總覽」實際會怎麼彙總。主要廠商依廠商合併；JDC 活動零用金可在下載前直接調整用途分組。</p><div id=\"exportPreview\"><div class=\"empty compact\">讀取中…</div></div><div id=\"exportPreviewStatus\" class=\"status form-status\" aria-live=\"polite\"></div><div id=\"reportStatus\" class=\"status form-status\" aria-live=\"polite\"></div></div>\n  </section>\n</div>\n</div>";
  const VENDOR_PANEL = '<section class="tab-panel" data-tab-panel="vendors" role="tabpanel" hidden>' +
    '<div class="card"><div class="section-heading"><div><h2>廠商主檔</h2><div class="muted">依統編或名稱查詢匯款資料狀態與正式文件</div></div></div>' +
    '<div class="table-tools"><input id="vendorSearch" type="search" inputmode="search" placeholder="搜尋 8 碼統編或廠商名稱"></div>' +
    '<div id="vendorStatus" class="status form-status" aria-live="polite"></div><div class="vendor-table-wrap"><table class="vendor-table">' +
    '<thead><tr><th>廠商名稱</th><th>統一編號</th><th>匯款資料</th><th>正式文件</th><th>更新時間</th></tr></thead>' +
    '<tbody id="vendorRows"><tr><td colspan="5" class="empty">讀取中…</td></tr></tbody></table></div></div></section>';
  function templateWithVendorPanel() {
    const marker = '<section class="tab-panel" data-tab-panel="reimbursement"';
    return ACCOUNTING_TEMPLATE.replace(marker, VENDOR_PANEL + marker);
  }
  const SCRIPT_SOURCES = Object.freeze([
    Object.freeze({ key: 'exceljs', src: 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js' }),
    Object.freeze({ key: 'accounting-domain', src: '../assets/domain.js?v=20260831-01' }),
    Object.freeze({ key: 'accounting-core', src: '../assets/app-core.js?v=20260904-46' }),
    Object.freeze({ key: 'accounting-ui', src: '../assets/accounting-ui.js?v=20260904-46' }),
    Object.freeze({ key: 'accounting-issue17', src: '../assets/issue17.js?v=20260902-app1' })
  ]);
  let dependenciesPromise = null;
  let initialized = false;
  let currentActivityId = '';

  function loadScript(doc, descriptor) {
    const existing = doc.querySelector('script[data-event-module="' + descriptor.key + '"]');
    if (existing) {
      if (existing.dataset.loaded === 'true') return Promise.resolve();
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('無法載入帳務模組：' + descriptor.key)), { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = doc.createElement('script');
      script.dataset.eventModule = descriptor.key;
      script.src = descriptor.src;
      script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
      script.onerror = () => reject(new Error('無法載入帳務模組：' + descriptor.key));
      doc.body.appendChild(script);
    });
  }

  function ensureDependencies(doc) {
    if (!dependenciesPromise) {
      dependenciesPromise = SCRIPT_SOURCES.reduce(
        (promise, descriptor) => promise.then(() => loadScript(doc, descriptor)),
        Promise.resolve()
      );
    }
    return dependenciesPromise;
  }

  async function mount(container, context) {
    if (!initialized) {
      container.innerHTML = templateWithVendorPanel();
      container.addEventListener('click', event => {
        const opener = event.target.closest('[data-open-tab]');
        if (opener && typeof context.navigate === 'function') context.navigate({ view: opener.dataset.openTab });
      });
      await ensureDependencies(container.ownerDocument);
      if (!root || !root.EventAccountingCore || typeof root.EventAccountingCore.initialize !== 'function') {
        throw new Error('帳務核心尚未完成初始化');
      }
      root.EventAccountingCore.initialize();
      initialized = true;
      currentActivityId = context.activityId;
    } else if (context.activityId !== currentActivityId && root && typeof root.switchActivity === 'function') {
      await root.switchActivity(context.activityId);
      currentActivityId = context.activityId;
    }
    if (!root || typeof root.activateAccountingTab !== 'function') throw new Error('帳務 view 尚未完成初始化');
    root.activateAccountingTab(context.view);
  }

  return {
    cacheKey: 'accounting',
    template: templateWithVendorPanel(),
    scriptSources: SCRIPT_SOURCES,
    loadScript,
    mount
  };
});
