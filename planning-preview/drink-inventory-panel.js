(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.PlanningDrinkInventoryPanel = api;
    if (root.document) api.install(root.document, root);
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbyLKDauNZi4zQzztda_agrJF84ILNSL6mXBsTe6e7DUx7dIbNN3GKwSWkDURQjYxkf_aA/exec';
  const TOKEN_STORAGE_KEY = 'eventAccountingToken:' + DEFAULT_API_URL;
  const DOMAIN_VERSION = '20260901-planning-inventory1';
  let domainPromise = null;
  let inventoryData = { activity_id: '', groups: [] };

  function parseActivityId(search) {
    const params = new URLSearchParams(search || '');
    return String(params.get('activity_id') || '').trim();
  }

  function buildUpdateFields(activityId, groupId, remainingUnits) {
    const target = String(activityId || '').trim();
    const group = String(groupId || '').trim();
    if (!target) throw new Error('缺少 activity_id');
    if (!group) throw new Error('缺少 drink_group_id');
    if (remainingUnits === '' || remainingUnits === null || remainingUnits === undefined) {
      throw new Error('剩餘數量不可空白');
    }
    const remaining = Number(remainingUnits);
    if (!Number.isFinite(remaining) || remaining < 0) throw new Error('剩餘數量必須是 0 以上的數字');
    return {
      action: 'update_drink_inventory',
      activity_id: target,
      drink_group_id: group,
      remaining_units: remaining
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function installStyles(doc) {
    if (doc.querySelector('#planningDrinkInventoryStyles')) return;
    const style = doc.createElement('style');
    style.id = 'planningDrinkInventoryStyles';
    style.textContent = `
      .inventory-panel{background:#fff;border:1px solid #dedbd2;border-radius:18px;box-shadow:0 8px 24px rgba(30,40,34,.04);padding:18px}
      .inventory-heading{display:flex;justify-content:space-between;gap:16px;align-items:end;margin-bottom:14px}.inventory-heading h2{margin:0;font-size:26px}
      .inventory-status{min-height:22px;margin:8px 0;color:#35634a;font-size:13px}.inventory-status.error{color:#9b3428}
      .inventory-table-wrap{overflow:auto}.inventory-table{width:100%;border-collapse:collapse;font-size:13px}.inventory-table th{padding:8px 9px;text-align:left;color:#78817c;font-size:11px;border-bottom:1px solid #e9e5dc}.inventory-table td{padding:11px 9px;border-bottom:1px solid #f0ede6;vertical-align:middle}.inventory-table tr:last-child td{border-bottom:0}
      .inventory-input{width:104px;min-height:40px;border:1px solid #ccc8bf;border-radius:9px;padding:0 10px;text-align:right;background:#fbfaf7}.inventory-input:disabled{background:#f1f0ec;color:#999}
      .inventory-source,.inventory-capacity,.inventory-state{font-size:12px;line-height:1.45;color:#6d756f;margin-top:3px}.inventory-state.warning{color:#7d5a09}.inventory-state.error{color:#9b3428}.inventory-state.ok{color:#345947}
      .inventory-consumed{font-weight:800}.inventory-actions{display:flex;justify-content:flex-end;margin-top:15px}.inventory-actions button{min-height:44px;border:0;border-radius:10px;padding:0 18px;background:#204d3b;color:#fff;font:inherit;font-weight:800;cursor:pointer}.inventory-actions button:disabled{opacity:.55;cursor:wait}
      @media(max-width:700px){.inventory-heading{align-items:start;flex-direction:column}.inventory-actions button{width:100%}}
    `;
    doc.head.appendChild(style);
  }

  function installView(doc) {
    if (doc.querySelector('#inventoryView')) return;
    const tabs = doc.querySelector('.tabs');
    const planView = doc.querySelector('#planView');
    if (!tabs || !planView) return;

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'tab';
    button.dataset.tab = 'inventory';
    button.textContent = '酒水盤點';
    tabs.appendChild(button);

    const view = doc.createElement('section');
    view.id = 'inventoryView';
    view.className = 'view';
    view.hidden = true;
    view.innerHTML = `
      <div class="inventory-heading">
        <div><div class="eyebrow">INVENTORY</div><h2>酒水盤點</h2><div class="muted">採購量直接從帳務帶入。活動後只填剩餘數量，系統自動計算實際消耗。</div></div>
      </div>
      <section class="inventory-panel">
        <div class="muted">同一飲品若分多次採購會自動合併。容量尚未確認時先記件數，不會換算公升。</div>
        <div id="planningDrinkInventoryStatus" class="inventory-status" aria-live="polite"></div>
        <div id="planningDrinkInventoryTable" class="inventory-table-wrap"><div class="no-data">切換到本頁後讀取酒水資料。</div></div>
        <div class="inventory-actions"><button id="planningDrinkInventorySave" type="button">儲存盤點</button></div>
      </section>
    `;
    planView.parentNode.insertBefore(view, planView.nextSibling);
  }

  function groupState(group) {
    if (group.planning_record_missing) return { text: '規劃資料尚無對應飲品，暫不能儲存', kind: 'error', disabled: true };
    if (group.capacity_conflict) return { text: '帳務與規劃容量不一致，請先核對', kind: 'error', disabled: true };
    if (group.ordered_units_mismatch) return { text: '規劃採購數不同，儲存時以帳務採購數為準', kind: 'warning', disabled: false };
    if (!group.unit_capacity_ml) return { text: '容量待補，先記件數', kind: 'warning', disabled: false };
    return { text: '可盤點', kind: 'ok', disabled: false };
  }

  function loadDomain(doc, win) {
    if (win.EventDrinkInventory) return Promise.resolve(win.EventDrinkInventory);
    if (domainPromise) return domainPromise;
    domainPromise = new Promise((resolve, reject) => {
      const script = doc.createElement('script');
      script.src = '../assets/drink-inventory.js?v=' + DOMAIN_VERSION;
      script.onload = () => win.EventDrinkInventory ? resolve(win.EventDrinkInventory) : reject(new Error('酒水計算模組載入失敗'));
      script.onerror = () => reject(new Error('酒水計算模組載入失敗'));
      doc.head.appendChild(script);
    });
    return domainPromise;
  }

  function apiRead(doc, win, action, args) {
    return new Promise((resolve, reject) => {
      const token = win.sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
      if (!token) return reject(new Error('請先從活動管理入口輸入存取碼。'));
      const callback = '__planningDrinkInventory_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = doc.createElement('script');
      const params = new URLSearchParams({ action, token, callback, ...(args || {}) });
      const cleanup = () => {
        delete win[callback];
        script.remove();
      };
      win[callback] = result => {
        cleanup();
        result && result.ok ? resolve(result.data) : reject(new Error(result && result.error || '讀取失敗'));
      };
      script.onerror = () => {
        cleanup();
        reject(new Error('無法連線到酒水資料'));
      };
      script.src = DEFAULT_API_URL + '?' + params.toString();
      doc.body.appendChild(script);
    });
  }

  function setStatus(doc, message, error) {
    const el = doc.querySelector('#planningDrinkInventoryStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = error ? 'inventory-status error' : 'inventory-status';
  }

  function render(doc, win, data) {
    inventoryData = data && typeof data === 'object' ? data : { activity_id: parseActivityId(win.location.search), groups: [] };
    const groups = Array.isArray(inventoryData.groups) ? inventoryData.groups : [];
    const container = doc.querySelector('#planningDrinkInventoryTable');
    const save = doc.querySelector('#planningDrinkInventorySave');
    if (!container || !save) return;
    if (!groups.length) {
      container.innerHTML = '<div class="no-data">這個活動目前沒有飲品採購明細。</div>';
      save.disabled = true;
      return;
    }

    container.innerHTML = `
      <table class="inventory-table">
        <thead><tr><th>類別</th><th>飲品</th><th class="num">採購</th><th class="num">剩餘盤點</th><th class="num">自動消耗</th><th>資料狀態</th></tr></thead>
        <tbody>${groups.map(group => {
          const status = groupState(group);
          const remaining = group.remaining_units == null ? '' : group.remaining_units;
          const consumed = group.consumed_units == null ? '待盤點' : `${group.consumed_units} ${group.inventory_unit}`;
          const capacity = group.unit_capacity_ml ? `單位容量 ${group.unit_capacity_ml} ml` : '單位容量尚未確認';
          return `<tr data-drink-group="${escapeHtml(group.drink_group_id)}">
            <td>${escapeHtml(group.drink_category || '未分類')}</td>
            <td><strong>${escapeHtml(group.item_name)}</strong><div class="inventory-source">${escapeHtml(group.purchase_line_count || 0)} 筆採購來源</div></td>
            <td class="num"><strong>${escapeHtml(group.ordered_units)} ${escapeHtml(group.inventory_unit)}</strong></td>
            <td class="num"><input class="inventory-input" data-remaining type="number" min="0" max="${escapeHtml(group.ordered_units)}" step="any" value="${escapeHtml(remaining)}" ${status.disabled ? 'disabled' : ''}></td>
            <td class="num"><div class="inventory-consumed" data-consumed>${escapeHtml(consumed)}</div><div class="inventory-capacity">${escapeHtml(capacity)}</div></td>
            <td><div class="inventory-state ${status.kind}">${escapeHtml(status.text)}</div></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    save.disabled = false;
    bindPreview(doc, win);
  }

  function bindPreview(doc, win) {
    const domain = win.EventDrinkInventory;
    doc.querySelectorAll('[data-drink-group] [data-remaining]').forEach(input => {
      input.addEventListener('input', () => {
        const row = input.closest('[data-drink-group]');
        const group = (inventoryData.groups || []).find(item => item.drink_group_id === row.dataset.drinkGroup);
        const preview = row.querySelector('[data-consumed]');
        if (!group || !preview) return;
        if (input.value === '') {
          preview.textContent = group.consumed_units == null ? '待盤點' : `${group.consumed_units} ${group.inventory_unit}`;
          input.setCustomValidity('');
          return;
        }
        try {
          const result = domain.calculateConsumption(group, input.value);
          preview.textContent = `${result.consumed_units} ${group.inventory_unit}`;
          input.setCustomValidity('');
        } catch (err) {
          preview.textContent = '輸入有誤';
          input.setCustomValidity(err.message || '剩餘數量不正確');
        }
      });
    });
  }

  function postUpdate(doc, win, fields, expectedRemaining) {
    return new Promise((resolve, reject) => {
      const token = win.sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
      if (!token) return reject(new Error('請先從活動管理入口輸入存取碼。'));
      const iframeName = 'planning-drink-inventory-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const iframe = doc.createElement('iframe');
      iframe.name = iframeName;
      iframe.style.display = 'none';
      const form = doc.createElement('form');
      form.method = 'POST';
      form.action = DEFAULT_API_URL;
      form.target = iframeName;
      form.style.display = 'none';
      const values = { ...fields, token, origin: win.location.origin };
      Object.entries(values).forEach(([name, value]) => {
        const input = doc.createElement('input');
        input.name = name;
        input.value = value == null ? '' : value;
        form.appendChild(input);
      });

      let serverResult = null;
      const onMessage = event => {
        if (event.source !== iframe.contentWindow) return;
        const message = event.data;
        if (!message || message.type !== 'event-accounting-result') return;
        serverResult = message.payload || { ok: false, error: 'GAS 回覆格式錯誤' };
      };
      win.addEventListener('message', onMessage);
      doc.body.append(iframe, form);
      form.submit();

      (async () => {
        try {
          for (let attempt = 0; attempt < 12; attempt += 1) {
            await sleep(attempt === 0 ? 500 : 750);
            if (serverResult && !serverResult.ok) throw new Error(serverResult.error || 'GAS 寫入失敗');
            const after = await apiRead(doc, win, 'drink_inventory', { activity_id: fields.activity_id });
            const group = (after.groups || []).find(item => String(item.drink_group_id || '') === String(fields.drink_group_id || ''));
            if (group && Number(group.remaining_units) === Number(expectedRemaining)) return resolve(after);
          }
          throw new Error('尚未確認盤點寫入結果，請重新讀取後確認');
        } catch (err) {
          reject(err);
        } finally {
          win.removeEventListener('message', onMessage);
          form.remove();
          iframe.remove();
        }
      })();
    });
  }

  async function loadInventory(doc, win) {
    const activityId = parseActivityId(win.location.search);
    const container = doc.querySelector('#planningDrinkInventoryTable');
    const save = doc.querySelector('#planningDrinkInventorySave');
    if (!container || !save) return;
    if (!activityId) {
      container.innerHTML = '<div class="no-data">缺少活動識別，請從活動管理入口重新進入。</div>';
      save.disabled = true;
      return;
    }
    container.innerHTML = '<div class="no-data">正在讀取帳務酒水採購…</div>';
    save.disabled = true;
    setStatus(doc, '');
    try {
      await loadDomain(doc, win);
      const data = await apiRead(doc, win, 'drink_inventory', { activity_id: activityId });
      render(doc, win, data);
    } catch (err) {
      container.innerHTML = '<div class="no-data">酒水資料讀取失敗。</div>';
      setStatus(doc, err && err.message ? err.message : '酒水資料讀取失敗', true);
    }
  }

  async function saveInventory(doc, win) {
    const button = doc.querySelector('#planningDrinkInventorySave');
    if (!button || button.disabled) return;
    const activityId = parseActivityId(win.location.search);
    const domain = await loadDomain(doc, win);
    const changes = [];

    doc.querySelectorAll('[data-drink-group]').forEach(row => {
      const group = (inventoryData.groups || []).find(item => item.drink_group_id === row.dataset.drinkGroup);
      const input = row.querySelector('[data-remaining]');
      if (!group || !input || input.disabled || input.value === '') return;
      try {
        const result = domain.calculateConsumption(group, input.value);
        input.setCustomValidity('');
        if (group.remaining_units == null || Number(group.remaining_units) !== Number(result.remaining_units)) {
          changes.push({ fields: buildUpdateFields(activityId, group.drink_group_id, result.remaining_units), expected: result.remaining_units });
        }
      } catch (err) {
        input.setCustomValidity(err.message || '剩餘數量不正確');
        input.reportValidity();
      }
    });

    if (!changes.length) {
      setStatus(doc, '沒有需要儲存的盤點變更。');
      return;
    }

    button.disabled = true;
    setStatus(doc, `正在儲存 ${changes.length} 項盤點…`);
    try {
      let latest = inventoryData;
      for (const change of changes) latest = await postUpdate(doc, win, change.fields, change.expected);
      render(doc, win, latest);
      setStatus(doc, '酒水盤點已儲存，實際消耗已更新到規劃資料。');
    } catch (err) {
      setStatus(doc, err && err.message ? err.message : '酒水盤點儲存失敗', true);
      button.disabled = false;
    }
  }

  function activate(doc, win, name) {
    const valid = new Set(['history', 'plan', 'inventory']);
    const target = valid.has(name) ? name : 'history';
    doc.querySelectorAll('.tabs .tab').forEach(button => button.classList.toggle('active', button.dataset.tab === target));
    const history = doc.querySelector('#historyView');
    const plan = doc.querySelector('#planView');
    const inventory = doc.querySelector('#inventoryView');
    if (history) history.hidden = target !== 'history';
    if (plan) plan.hidden = target !== 'plan';
    if (inventory) inventory.hidden = target !== 'inventory';
    if (target === 'inventory') void loadInventory(doc, win);
  }

  function install(doc, win) {
    if (!doc || !win || doc.querySelector('#inventoryView')) return;
    installStyles(doc);
    installView(doc);
    const save = doc.querySelector('#planningDrinkInventorySave');
    if (!save) return;

    doc.querySelectorAll('.tabs .tab').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        activate(doc, win, button.dataset.tab);
      }, true);
    });
    save.addEventListener('click', () => void saveInventory(doc, win));
  }

  return {
    parseActivityId,
    buildUpdateFields,
    groupState,
    install
  };
});
