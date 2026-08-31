(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanningPreview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SNAPSHOT = {
    generated_date: '2026-08-31',
    source_title: 'JDC 活動規劃資料',
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

  return { SNAPSHOT, calculateRows };
});
