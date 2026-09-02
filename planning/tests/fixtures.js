'use strict';

const baselines = [
  { activity_type: '尾牙', drink_category: '啤酒', sample_count: 6, average: 0.3165, median: 0.2946, min: 0.0971, max: 0.655, confidence: '高', sources: ['yearend2019'], excluded: 0 },
  { activity_type: '尾牙', drink_category: '無酒精飲料', sample_count: 0, average: null, median: null, min: null, max: null, confidence: '不足', sources: [], excluded: 2 },
  { activity_type: '年中聚餐', drink_category: '啤酒', sample_count: 3, average: 0.3416, median: 0.343, min: 0.1313, max: 0.5506, confidence: '中', sources: ['midyear2023'], excluded: 1 }
];

const history = [
  { activity_id: 'yearend2025', activity_name: '2025年度 忘年會', activity_type: '尾牙', actual_headcount: 200, categories: [{ drink_category: '啤酒', item_count: 1, ordered_liters: 40, consumed_liters: null, remaining_liters: null }] },
  { activity_id: 'midyear2025', activity_name: '2025年度 年中聚餐', activity_type: '年中聚餐', actual_headcount: null, categories: [] }
];

const activities = [
  { activity_id: 'yearend2026', name: '2026年度 忘年會', activity_type: '尾牙', estimated_headcount: 220, actual_headcount: null }
];

module.exports = { baselines, history, activities };
