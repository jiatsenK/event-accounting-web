'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const dashboard = require('../dashboard-core.js');

const activities = [
  {
    activity_id: 'yearend2022', activity_name: '2022年度 忘年會', activity_type: '尾牙', activity_date: '2023-01-18',
    actual_headcount: 150, data_completeness: 'complete', total_expense: 632744, per_capita_expense: 4218.29,
    category_breakdown: [
      { category: '活動獎金／獎品', amount: 488000, ratio: 0.7712 },
      { category: '酒水', amount: 25960, ratio: 0.041 }
    ],
    budget: { total: 574400, variance: 58344, variance_rate: 0.1016 }
  },
  {
    activity_id: 'yearend2024', activity_name: '2024年度 忘年會', activity_type: '尾牙', activity_date: '2025-01-17',
    actual_headcount: 197, data_completeness: 'complete', total_expense: 961023, per_capita_expense: 4878.29,
    category_breakdown: [
      { category: '活動獎金／獎品', amount: 675800, ratio: 0.7032 },
      { category: '酒水', amount: 74988, ratio: 0.078 }
    ],
    budget: { total: 977720, variance: -16697, variance_rate: -0.0171 }
  },
  {
    activity_id: 'yearend2025', activity_name: '2025年度 忘年會', activity_type: '尾牙', activity_date: '2026-02-06',
    actual_headcount: 222, data_completeness: 'complete', total_expense: 1097926.25, per_capita_expense: 4945.61,
    category_breakdown: [
      { category: '活動獎金／獎品', amount: 743000, ratio: 0.6767 },
      { category: '酒水', amount: 17347, ratio: 0.0158 }
    ],
    budget: { total: 1189183, variance: -91256.75, variance_rate: -0.0767 }
  },
  {
    activity_id: 'yearend2023', activity_name: '2023年度 忘年會', activity_type: '尾牙', activity_date: '2024-02-02',
    actual_headcount: 170, data_completeness: 'activity_only', total_expense: null, per_capita_expense: null,
    category_breakdown: [], budget: null
  },
  {
    activity_id: 'midyear2023', activity_name: '2023年度 年中聚餐', activity_type: '年中聚餐', activity_date: '2023-07-21',
    actual_headcount: 170, data_completeness: 'complete', total_expense: 668051, per_capita_expense: 3929.71,
    category_breakdown: [{ category: '酒水', amount: 61416, ratio: 0.0919 }],
    budget: { total: 668051, variance: 0, variance_rate: 0 }
  },
  {
    activity_id: 'midyear2025', activity_name: '2025年度 年中聚餐', activity_type: '年中聚餐', activity_date: '2025-07-11',
    actual_headcount: 201, data_completeness: 'complete', total_expense: 709801, per_capita_expense: 3531.35,
    category_breakdown: [{ category: '酒水', amount: 62000, ratio: 0.0873 }],
    budget: { total: 709801, variance: 0, variance_rate: 0 }
  }
];

test('byType：全部回傳複本、指定類型時篩選且不改動原陣列', () => {
  const all = dashboard.byType(activities, '全部');
  assert.equal(all.length, activities.length);
  assert.notEqual(all, activities);
  const yearend = dashboard.byType(activities, '尾牙');
  assert.equal(yearend.length, 4);
  assert.ok(yearend.every(row => row.activity_type === '尾牙'));
});

test('headcountSeries：所有有可靠人數的活動都列入，不限 complete', () => {
  const series = dashboard.headcountSeries(activities, '尾牙');
  assert.equal(series.length, 4); // 包含 activity_only 的 yearend2023
  assert.deepEqual(series.map(row => row.activity_id), ['yearend2022', 'yearend2023', 'yearend2024', 'yearend2025']);
  assert.equal(series[0].value, 150);
});

test('totalExpenseSeries／perCapitaSeries：只計入 complete 活動', () => {
  const totals = dashboard.totalExpenseSeries(activities, '尾牙');
  assert.equal(totals.length, 3);
  assert.ok(totals.every(row => row.data_completeness === 'complete'));
  const perCapita = dashboard.perCapitaSeries(activities, '尾牙');
  assert.equal(perCapita.length, 3);
});

test('excludedFromTotals：列出被總支出圖排除、缺完整結算的活動', () => {
  const excluded = dashboard.excludedFromTotals(activities, '尾牙');
  assert.deepEqual(excluded.map(row => row.activity_id), ['yearend2023']);
});

test('categorySeries：只比較有該分類正式結算的活動，並回傳樣本數', () => {
  const series = dashboard.categorySeries(activities, '尾牙', '酒水');
  assert.equal(series.sample_count, 3);
  assert.equal(series.points.length, 3);
  assert.equal(series.points[0].value, 25960);
  const missing = dashboard.categorySeries(activities, '尾牙', '獎牌');
  assert.equal(missing.sample_count, 0);
});

test('shouldShowTrend／growthRate：樣本只有 1～2 次時不給趨勢線或成長率', () => {
  const twoPoints = dashboard.categorySeries(activities, '年中聚餐', '酒水').points;
  assert.equal(twoPoints.length, 2);
  assert.equal(dashboard.shouldShowTrend(twoPoints), false);
  assert.equal(dashboard.growthRate(twoPoints), null);

  const threePoints = dashboard.categorySeries(activities, '尾牙', '酒水').points;
  assert.equal(dashboard.shouldShowTrend(threePoints), true);
  const rate = dashboard.growthRate(threePoints);
  assert.ok(Math.abs(rate - (17347 - 25960) / 25960) < 1e-9);
});

test('categoryComposition：依金額由大到小排序單一活動的分類占比', () => {
  const rows = dashboard.categoryComposition(activities[0]);
  assert.deepEqual(rows.map(row => row.category), ['活動獎金／獎品', '酒水']);
  assert.deepEqual(dashboard.categoryComposition(null), []);
});

test('budgetComparisons：只有活動預算與實際支出都存在才回傳差異', () => {
  const rows = dashboard.budgetComparisons(activities, '尾牙');
  assert.equal(rows.length, 3); // yearend2023 沒有 budget，不列入
  assert.equal(rows[0].variance, 58344);
});

test('availableCategories：彙整所有活動出現過的標準分類，依字典排序', () => {
  const categories = dashboard.availableCategories(activities);
  assert.deepEqual(categories, ['活動獎金／獎品', '酒水']);
});

test('sortActivitiesForList：依日期新到舊排序', () => {
  const sorted = dashboard.sortActivitiesForList(activities);
  assert.equal(sorted[0].activity_id, 'yearend2025');
  assert.equal(sorted[sorted.length - 1].activity_id, 'yearend2022');
});
