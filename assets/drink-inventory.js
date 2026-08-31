(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EventDrinkInventory = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function asNonNegativeNumber(value, field) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new RangeError(`${field} 必須是 0 以上的數字`);
    return n;
  }

  function groupPurchaseLines(lines, activityId) {
    const target = String(activityId || '').trim();
    if (!target) throw new Error('缺少 activity_id');
    const groups = new Map();
    for (const line of lines || []) {
      if (String(line.activity_id || '').trim() !== target) continue;
      const groupId = String(line.drink_group_id || '').trim();
      if (!groupId) throw new Error('飲品採購行缺少 drink_group_id');
      const ordered = asNonNegativeNumber(line.ordered_units, 'ordered_units');
      const unit = String(line.inventory_unit || '').trim();
      const item = String(line.item_name || '').trim();
      const category = String(line.drink_category || '').trim();
      if (!item || !unit) throw new Error(`飲品採購行資料不完整：${groupId}`);
      let group = groups.get(groupId);
      if (!group) {
        group = {
          drink_group_id: groupId,
          activity_id: target,
          drink_category: category,
          item_name: item,
          inventory_unit: unit,
          unit_capacity_ml: line.unit_capacity_ml === '' || line.unit_capacity_ml == null ? null : Number(line.unit_capacity_ml),
          ordered_units: 0,
          purchase_line_ids: [],
          expense_ids: []
        };
        groups.set(groupId, group);
      } else {
        if (group.item_name !== item || group.inventory_unit !== unit || group.drink_category !== category) {
          throw new Error(`同一 drink_group_id 的品項資料不一致：${groupId}`);
        }
        const capacity = line.unit_capacity_ml === '' || line.unit_capacity_ml == null ? null : Number(line.unit_capacity_ml);
        if (group.unit_capacity_ml != null && capacity != null && group.unit_capacity_ml !== capacity) {
          throw new Error(`同一 drink_group_id 的容量不一致：${groupId}`);
        }
        if (group.unit_capacity_ml == null && capacity != null) group.unit_capacity_ml = capacity;
      }
      group.ordered_units += ordered;
      const purchaseLineId = String(line.purchase_line_id || '').trim();
      const expenseId = String(line.expense_id || '').trim();
      if (purchaseLineId) group.purchase_line_ids.push(purchaseLineId);
      if (expenseId && !group.expense_ids.includes(expenseId)) group.expense_ids.push(expenseId);
    }
    return Array.from(groups.values());
  }

  function calculateConsumption(group, remainingUnits) {
    if (!group || !String(group.drink_group_id || '').trim()) throw new Error('缺少飲品群組');
    const ordered = asNonNegativeNumber(group.ordered_units, '採購數量');
    const remaining = asNonNegativeNumber(remainingUnits, '剩餘數量');
    if (remaining > ordered) throw new RangeError('剩餘數量不可大於採購數量');
    const consumed = ordered - remaining;
    const capacity = group.unit_capacity_ml == null || group.unit_capacity_ml === '' ? null : Number(group.unit_capacity_ml);
    return {
      drink_group_id: group.drink_group_id,
      ordered_units: ordered,
      remaining_units: remaining,
      consumed_units: consumed,
      inventory_unit: group.inventory_unit,
      consumed_liters: Number.isFinite(capacity) && capacity > 0 ? consumed * capacity / 1000 : null,
      remaining_liters: Number.isFinite(capacity) && capacity > 0 ? remaining * capacity / 1000 : null
    };
  }

  return { groupPurchaseLines, calculateConsumption };
});