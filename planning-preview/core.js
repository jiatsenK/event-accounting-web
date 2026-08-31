(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanningPreview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SNAPSHOT = {
    generated_date: '2026-08-31',
    source_title: 'JDC 活動規劃資料',
    history: [
      {
        activity_id: 'midyear2026', activity_name: '2026年度 年中聚餐', activity_type: '年中聚餐', activity_date: '2026-08-28', actual_headcount: 137,
        warning_count: 0, categories: []
      },
      {
        activity_id: 'yearend2025', activity_name: '2025忘年會', activity_type: '尾牙', activity_date: '2026-02-06', actual_headcount: 222,
        warning_count: 2,
        categories: [
          { drink_category: '啤酒', item_count: 3, ordered_liters: 79.84, consumed_liters: 66.85, remaining_liters: 12.99, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '威士忌', item_count: 1, ordered_liters: 28, consumed_liters: 27.3, remaining_liters: 0.7, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '紅酒', item_count: 1, ordered_liters: 16.5, consumed_liters: 16.5, remaining_liters: 0, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '調酒', item_count: 1, ordered_liters: 70, consumed_liters: 70, remaining_liters: 0, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '無酒精飲料', item_count: 2, ordered_liters: null, consumed_liters: null, remaining_liters: null, warning_count: 2, missing_capacity_count: 2 }
        ]
      },
      {
        activity_id: 'midyear2025', activity_name: '2025年中聚餐', activity_type: '年中聚餐', activity_date: '2025-07-11', actual_headcount: 201,
        warning_count: 2,
        categories: [
          { drink_category: '啤酒', item_count: 1, ordered_liters: 57.6, consumed_liters: 26.4, remaining_liters: 31.2, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '威士忌', item_count: 1, ordered_liters: 28, consumed_liters: 21.7, remaining_liters: 6.3, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '無酒精飲料', item_count: 2, ordered_liters: null, consumed_liters: null, remaining_liters: null, warning_count: 2, missing_capacity_count: 2 }
        ]
      },
      {
        activity_id: 'yearend2024', activity_name: '2024忘年會', activity_type: '尾牙', activity_date: '2025-01-17', actual_headcount: 197,
        warning_count: 3,
        categories: [
          { drink_category: '啤酒', item_count: 3, ordered_liters: 101.172, consumed_liters: 40.128, remaining_liters: 61.044, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '威士忌', item_count: 1, ordered_liters: 25.2, consumed_liters: 18.2, remaining_liters: 7, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '紅酒', item_count: 1, ordered_liters: 15, consumed_liters: 2.25, remaining_liters: 12.75, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '調酒', item_count: 1, ordered_liters: 55, consumed_liters: 62, remaining_liters: -7, warning_count: 1, missing_capacity_count: 0 },
          { drink_category: '無酒精飲料', item_count: 2, ordered_liters: null, consumed_liters: null, remaining_liters: null, warning_count: 2, missing_capacity_count: 2 }
        ]
      },
      {
        activity_id: 'midyear2024', activity_name: '2024年中聚餐', activity_type: '年中聚餐', activity_date: '2024-09-06', actual_headcount: 200,
        warning_count: 0,
        categories: [
          { drink_category: '啤酒', item_count: 1, ordered_liters: 78.4, consumed_liters: 68.6, remaining_liters: 9.8, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '威士忌', item_count: 1, ordered_liters: 21, consumed_liters: 16.1, remaining_liters: 4.9, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '紅酒', item_count: 1, ordered_liters: 22.5, consumed_liters: 8.25, remaining_liters: 14.25, warning_count: 0, missing_capacity_count: 0 }
        ]
      },
      {
        activity_id: 'yearend2023', activity_name: '2023忘年會', activity_type: '尾牙', activity_date: '2024-02-02', actual_headcount: 170,
        warning_count: 0,
        categories: [
          { drink_category: '啤酒', item_count: 1, ordered_liters: 16.5, consumed_liters: 16.5, remaining_liters: 0, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '威士忌', item_count: 1, ordered_liters: 17.5, consumed_liters: 14, remaining_liters: 3.5, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '紅酒', item_count: 1, ordered_liters: 25.5, consumed_liters: 13.5, remaining_liters: 12, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '調酒', item_count: 1, ordered_liters: 70.875, consumed_liters: 54, remaining_liters: 16.875, warning_count: 0, missing_capacity_count: 0 }
        ]
      },
      {
        activity_id: 'midyear2023', activity_name: '2023年中聚餐', activity_type: '年中聚餐', activity_date: '2023-07-21', actual_headcount: 170,
        warning_count: 0,
        categories: [
          { drink_category: '啤酒', item_count: 1, ordered_liters: 102, consumed_liters: 93.6, remaining_liters: 8.4, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '威士忌', item_count: 1, ordered_liters: 11.9, consumed_liters: 8.4, remaining_liters: 3.5, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '紅酒', item_count: 1, ordered_liters: 22.5, consumed_liters: 9.75, remaining_liters: 12.75, warning_count: 0, missing_capacity_count: 0 }
        ]
      },
      {
        activity_id: 'yearend2022', activity_name: '2022忘年會', activity_type: '尾牙', activity_date: '2023-01-18', actual_headcount: 150,
        warning_count: 0,
        categories: [
          { drink_category: '啤酒', item_count: 1, ordered_liters: 102, consumed_liters: 43.2, remaining_liters: 58.8, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '威士忌', item_count: 1, ordered_liters: 15.4, consumed_liters: 9.1, remaining_liters: 6.3, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '紅酒', item_count: 1, ordered_liters: 15, consumed_liters: 15, remaining_liters: 0, warning_count: 0, missing_capacity_count: 0 }
        ]
      },
      {
        activity_id: 'yearend2020', activity_name: '2020忘年會', activity_type: '尾牙', activity_date: '2020-01-10', actual_headcount: 120,
        warning_count: 1,
        categories: [
          { drink_category: '啤酒', item_count: 1, ordered_liters: 114, consumed_liters: 78.6, remaining_liters: 35.4, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '威士忌', item_count: 1, ordered_liters: 7, consumed_liters: 9.1, remaining_liters: -2.1, warning_count: 1, missing_capacity_count: 0 },
          { drink_category: '紅酒', item_count: 1, ordered_liters: 22.5, consumed_liters: 15, remaining_liters: 7.5, warning_count: 0, missing_capacity_count: 0 }
        ]
      },
      {
        activity_id: 'midyear2019', activity_name: '2019年中聚餐', activity_type: '年中聚餐', activity_date: '2019-05-24', actual_headcount: 110,
        warning_count: 1,
        categories: [
          { drink_category: '啤酒', item_count: 1, ordered_liters: 39.6, consumed_liters: 76.8, remaining_liters: -37.2, warning_count: 1, missing_capacity_count: 0 },
          { drink_category: '威士忌', item_count: 1, ordered_liters: 10.5, consumed_liters: 4.55, remaining_liters: 5.95, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '紅酒', item_count: 1, ordered_liters: 22.5, consumed_liters: 10.5, remaining_liters: 12, warning_count: 0, missing_capacity_count: 0 }
        ]
      },
      {
        activity_id: 'yearend2019', activity_name: '2019忘年會', activity_type: '尾牙', activity_date: '2019-01-18', actual_headcount: 100,
        warning_count: 0,
        categories: [
          { drink_category: '啤酒', item_count: 1, ordered_liters: 60, consumed_liters: 35.4, remaining_liters: 24.6, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '威士忌', item_count: 1, ordered_liters: 7, consumed_liters: 4.9, remaining_liters: 2.1, warning_count: 0, missing_capacity_count: 0 },
          { drink_category: '紅酒', item_count: 1, ordered_liters: 22.5, consumed_liters: 16.5, remaining_liters: 6, warning_count: 0, missing_capacity_count: 0 }
        ]
      }
    ],
    baselines: [
      { activity_type: '尾牙', drink_category: '啤酒', sample_count: 6, average: 0.3165, median: 0.2946, min: 0.0971, max: 0.6550, confidence: '高', sources: ['yearend2019','yearend2020','yearend2022','yearend2023','yearend2024','yearend2025'], excluded: 0 },
      { activity_type: '尾牙', drink_category: '威士忌', sample_count: 5, average: 0.0815, median: 0.0824, min: 0.0490, max: 0.1230, confidence: '高', sources: ['yearend2019','yearend2022','yearend2023','yearend2024','yearend2025'], excluded: 1 },
      { activity_type: '尾牙', drink_category: '紅酒', sample_count: 6, average: 0.0925, median: 0.0897, min: 0.0114, max: 0.1650, confidence: '高', sources: ['yearend2019','yearend2020','yearend2022','yearend2023','yearend2024','yearend2025'], excluded: 0 },
      { activity_type: '尾牙', drink_category: '調酒', sample_count: 2, average: 0.3165, median: 0.3165, min: 0.3153, max: 0.3176, confidence: '低', sources: ['yearend2023','yearend2025'], excluded: 1 },
      { activity_type: '尾牙', drink_category: '無酒精飲料', sample_count: 0, confidence: '不足', sources: [], excluded: 2 },
      { activity_type: '年中聚餐', drink_category: '啤酒', sample_count: 3, average: 0.3416, median: 0.3430, min: 0.1313, max: 0.5506, confidence: '中', sources: ['midyear2023','midyear2024','midyear2025'], excluded: 1 },
      { activity_type: '年中聚餐', drink_category: '威士忌', sample_count: 4, average: 0.0698, median: 0.0650, min: 0.0414, max: 0.1080, confidence: '中', sources: ['midyear2019','midyear2023','midyear2024','midyear2025'], excluded: 0 },
      { activity_type: '年中聚餐', drink_category: '紅酒', sample_count: 3, average: 0.0647, median: 0.0574, min: 0.0413, max: 0.0955, confidence: '中', sources: ['midyear2019','midyear2023','midyear2024'], excluded: 0 },
      { activity_type: '年中聚餐', drink_category: '無酒精飲料', sample_count: 0, confidence: '不足', sources: [], excluded: 1 }
    ]
  };

  function asNonNegative(value, name) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new RangeError(`${name} 必須是 0 以上的數字`);
    return n;
  }

  function getHistory(activityType = '全部') {
    if (activityType === '全部' || activityType === '') return SNAPSHOT.history.slice();
    if (!['尾牙', '年中聚餐'].includes(activityType)) throw new RangeError('請選擇活動類型');
    return SNAPSHOT.history.filter(row => row.activity_type === activityType);
  }

  function calculateRows(activityType, forecastHeadcount, safetyRatePercent, safetyLiters) {
    if (!['尾牙', '年中聚餐'].includes(activityType)) throw new RangeError('請選擇活動類型');
    const headcount = asNonNegative(forecastHeadcount, '預估人數');
    if (headcount === 0) throw new RangeError('預估人數必須大於 0');
    const ratePercent = asNonNegative(safetyRatePercent, '安全率');
    const fixedSafety = asNonNegative(safetyLiters, '固定安全量');
    const rate = ratePercent / 100;

    return SNAPSHOT.baselines.filter(row => row.activity_type === activityType).map(row => {
      if (!Number.isFinite(row.average) || row.sample_count < 2) {
        return { ...row, baseline_liters: null, safety_from_rate_liters: null, total_safety_liters: null, system_recommended_liters: null };
      }
      const baselineLiters = row.average * headcount;
      const safetyFromRate = baselineLiters * rate;
      const totalSafety = safetyFromRate + fixedSafety;
      return {
        ...row,
        baseline_liters: baselineLiters,
        safety_rate_percent: ratePercent,
        safety_from_rate_liters: safetyFromRate,
        fixed_safety_liters: fixedSafety,
        total_safety_liters: totalSafety,
        system_recommended_liters: baselineLiters + totalSafety
      };
    });
  }

  return { SNAPSHOT, getHistory, calculateRows };
});
