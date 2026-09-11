'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = undefined;
const DashboardCore = require('../../planning/dashboard-core.js');
global.DashboardCore = DashboardCore;

const views = require('../dashboard-views.js');

const completeActivity = {
  activity_id: 'yearend2025', activity_name: '2025年度 忘年會', activity_type: '尾牙', activity_date: '2026-02-06',
  actual_headcount: 222, data_completeness: 'complete', total_expense: 1097926.25, per_capita_expense: 4945.61,
  data_issues: [],
  category_breakdown: [
    { category: '活動獎金／獎品', amount: 743000, ratio: 0.6767, raw_categories: ['獎金'] },
    { category: '酒水', amount: 17347, ratio: 0.0158, raw_categories: ['酒水'] }
  ],
  budget: { total: 1189183, variance: -91256.75, variance_rate: -0.0767 }
};

const partialActivity = {
  activity_id: 'partial1', activity_name: '部分活動', activity_type: '年中聚餐', activity_date: '2025-07-11',
  actual_headcount: 150, data_completeness: 'partial', total_expense: 300000, per_capita_expense: 2000,
  data_issues: ['1 筆支出缺分類'],
  category_breakdown: [{ category: '場地餐飲', amount: 200000, ratio: 0.6667, raw_categories: ['場地餐飲'] }],
  budget: null
};

test('money／percent／dateLabel：缺值一律顯示 em dash，不補 0', () => {
  assert.equal(views.money(1234.6), '1,235');
  assert.equal(views.money(null), '—');
  assert.equal(views.percent(0.1234), '12.3%');
  assert.equal(views.percent(null), '—');
  assert.equal(views.dateLabel('2026-02-06'), '2026/02/06');
});

test('completenessBadge：依資料完整度狀態換文字與樣式', () => {
  assert.match(views.completenessBadge('complete'), /完整結算/);
  assert.match(views.completenessBadge('activity_only'), /badge empty/);
  assert.match(views.completenessBadge('source_conflict'), /來源待確認/);
});

test('activityRow：缺結算資料時金額顯示 em dash 而不是 0', () => {
  const row = views.activityRow({
    activity_id: 'a1', activity_name: '無資料活動', activity_type: '尾牙', activity_date: '2019-01-18',
    actual_headcount: 100, total_expense: null, per_capita_expense: null, data_completeness: 'activity_only'
  });
  assert.match(row, /100 人/);
  assert.match(row, /<td class="num">—<\/td>/);
  assert.match(row, /無結算資料/);
});

test('lineChart：樣本只有 1～2 點時不畫連線，只標原始點並附註', () => {
  const points = DashboardCore.categorySeries([completeActivity, partialActivity], '全部', '酒水').points;
  assert.equal(points.length, 1);
  const html = views.lineChart(points);
  assert.doesNotMatch(html, /chart-line/);
  assert.match(html, /樣本只有 1 筆/);
});

test('lineChart：沒有資料時顯示無資料提示，不畫空圖', () => {
  assert.match(views.lineChart([]), /目前沒有可顯示的資料/);
});

test('barChart：沒有資料時顯示無資料提示', () => {
  assert.match(views.barChart([]), /目前沒有可顯示的資料/);
});

test('categoryCompositionList：partial 活動會把 data_issues 顯示在上方', () => {
  const html = views.categoryCompositionList(partialActivity);
  assert.match(html, /1 筆支出缺分類/);
  assert.match(html, /場地餐飲/);
});

test('categoryCompositionList：complete 活動沒有 data_issues 時不顯示提示區塊', () => {
  const html = views.categoryCompositionList(completeActivity);
  assert.doesNotMatch(html, /page-status/);
  assert.match(html, /活動獎金／獎品/);
});

test('budgetRow：差異為正時標示 over 樣式與加號', () => {
  const row = views.budgetRow({
    activity_id: 'a1', activity_name: '超支活動', activity_date: '2023-01-18',
    budget_total: 500000, actual_total: 600000, variance: 100000, variance_rate: 0.2
  });
  assert.match(row, /variance over/);
  assert.match(row, /\+100,000/);
});

test('模組匯出 dashboard.mount', () => {
  assert.equal(typeof views.dashboard.mount, 'function');
});
