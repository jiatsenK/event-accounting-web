(function () {
  'use strict';

  const DOMAIN_VERSION = '20260831-inventory1';
  let domainPromise = null;
  let inventoryData = { activity_id: '', groups: [] };

  function loadInventoryDomain() {
    if (window.EventDrinkInventory) return Promise.resolve(window.EventDrinkInventory);
    if (domainPromise) return domainPromise;
    domainPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `assets/drink-inventory.js?v=${DOMAIN_VERSION}`;
      script.onload = () => window.EventDrinkInventory ? resolve(window.EventDrinkInventory) : reject(new Error('酒水計算模組載入失敗'));
      script.onerror = () => reject(new Error('酒水計算模組載入失敗'));
      document.head.appendChild(script);
    });
    return domainPromise;
  }

  function inventoryEscape(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function installInventoryStyles() {
    if (document.querySelector('#drinkInventoryStyles')) return;
    const style = document.createElement('style');
    style.id = 'drinkInventoryStyles';
    style.textContent = `
      .drink-inventory-note{margin:0 0 14px}.drink-inventory-table{overflow:auto}.drink-inventory-table td{vertical-align:middle}.drink-inventory-input{width:110px;text-align:right}.drink-inventory-status{font-size:12px;line-height:1.45;white-space:normal;max-width:260px}.drink-inventory-warning{color:#9b5c18}.drink-inventory-error{color:#9b2c2c}.drink-inventory-ok{color:#35634a}.drink-inventory-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.drink-inventory-source{font-size:12px;color:#777;margin-top:3px;white-space:normal}.drink-inventory-consumed{font-weight:700}.drink-inventory-capacity{font-size:12px;color:#777;margin-top:3px}
      @media(max-width:620px){.drink-inventory-actions{justify-content:stretch}.drink-inventory-actions button{flex:1}.drink-inventory-input{width:90px}}
    `;
    document.head.appendChild(style);
  }

  function installInventoryPanel() {
    if (document.querySelector('[data-tab="drink-inventory"]')) return;
    const nav = document.querySelector('.tabs');
    const reimbursementButton = nav && nav.querySelector('[data-tab="reimbursement"]');
    if (!nav || !reimbursementButton) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-button';
    button.dataset.tab = 'drink-inventory';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.textContent = '酒水盤點';
    nav.insertBefore(button, reimbursementButton);

    const reimbursementPanel = document.querySelector('[data-tab-panel="reimbursement"]');
    if (!reimbursementPanel) return;
    const panel = document.createElement('section');
    panel.className = 'tab-panel';
    panel.dataset.tabPanel = 'drink-inventory';
    panel.setAttribute('role', 'tabpanel');
    panel.hidden = true;
    panel.innerHTML = `
      <div class="card">
        <div class="section-heading"><div><h2>酒水盤點</h2><div class="muted">採購數量直接從帳務帶入；活動後只填剩餘數量，消耗量自動計算。</div></div></div>
        <p class="muted drink-inventory-note">同一飲品若分多次採購會自動合併。容量尚未確認的品項先記件數，不會換算公升。</p>
        <div id="drinkInventoryStatus" class="status form-status" aria-live="polite"></div>
        <div id="drinkInventoryTable" class="drink-inventory-table"><div class="empty compact">切換到本頁後讀取酒水資料。</div></div>
        <div class="drink-inventory-actions"><button id="saveDrinkInventory" type="button">儲存盤點</button></div>
      </div>
    `;
    reimbursementPanel.parentNode.insertBefore(panel, reimbursementPanel);
  }

  function setInventoryStatus(text, error) {
    const el = document.querySelector('#drinkInventoryStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = error ? 'status form-status error' : 'status form-status';
  }

  function inventoryPanelActive() {
    const panel = document.querySelector('[data-tab-panel="drink-inventory"]');
    return Boolean(panel && !panel.hidden);
  }

  function activateInventoryTab() {
    document.querySelectorAll('[data-tab]').forEach(button => {
      const active = button.dataset.tab === 'drink-inventory';
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-tab-panel]').forEach(panel => {
      panel.hidden = panel.dataset.tabPanel !== 'drink-inventory';
    });
    try { sessionStorage.setItem('eventAccountingActiveTab', 'drink-inventory'); } catch (_) {}
    void loadDrinkInventory();
  }

  function installTabBehavior() {
    const button = document.querySelector('[data-tab="drink-inventory"]');
    if (button) button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      activateInventoryTab();
    }, true);

    const originalActivate = window.activateAccountingTab;
    if (typeof originalActivate === 'function') {
      window.activateAccountingTab = function (name) {
        if (name === 'drink-inventory') return activateInventoryTab();
        return originalActivate(name);
      };
    }
  }

  function groupWarning(group) {
    if (group.planning_record_missing) return { text: 'planning 尚無對應飲品列，暫不能儲存', type: 'error' };
    if (group.capacity_conflict) return { text: '帳務與 planning 容量不一致，請先核對', type: 'error' };
    if (group.ordered_units_mismatch) return { text: 'planning 採購數不同；儲存時以帳務採購數為準', type: 'warning' };
    if (!group.unit_capacity_ml) return { text: '容量待補，先記件數', type: 'warning' };
    return { text: '可盤點', type: 'ok' };
  }

  function renderDrinkInventory(data) {
    inventoryData = data && typeof data === 'object' ? data : { activity_id: state.activityId, groups: [] };
    const groups = Array.isArray(inventoryData.groups) ? inventoryData.groups : [];
    const container = document.querySelector('#drinkInventoryTable');
    const save = document.querySelector('#saveDrinkInventory');
    if (!container || !save) return;
    if (!groups.length) {
      container.innerHTML = '<div class="empty compact">這個活動目前沒有飲品採購明細。</div>';
      save.disabled = true;
      return;
    }
    container.innerHTML = `
      <table>
        <thead><tr><th>類別</th><th>飲品</th><th class="num">採購</th><th class="num">剩餘盤點</th><th class="num">自動消耗</th><th>資料狀態</th></tr></thead>
        <tbody>${groups.map(group => {
          const warning = groupWarning(group);
          const currentRemaining = group.remaining_units == null ? '' : group.remaining_units;
          const consumed = group.consumed_units == null ? '待盤點' : `${group.consumed_units} ${group.inventory_unit}`;
          const disabled = group.planning_record_missing || group.capacity_conflict;
          const capacity = group.unit_capacity_ml ? `單位容量 ${group.unit_capacity_ml} ml` : '單位容量尚未確認';
          return `<tr data-drink-group="${inventoryEscape(group.drink_group_id)}">
            <td>${inventoryEscape(group.drink_category || '未分類')}</td>
            <td><div>${inventoryEscape(group.item_name)}</div><div class="drink-inventory-source">${group.purchase_line_count || 0} 筆採購來源 · ${group.expense_count || 0} 筆帳務支出</div></td>
            <td class="num"><strong>${inventoryEscape(group.ordered_units)} ${inventoryEscape(group.inventory_unit)}</strong></td>
            <td class="num"><input class="drink-inventory-input" data-remaining-input type="number" min="0" max="${inventoryEscape(group.ordered_units)}" step="any" value="${inventoryEscape(currentRemaining)}" ${disabled ? 'disabled' : ''} aria-label="${inventoryEscape(group.item_name)} 剩餘數量"></td>
            <td class="num"><div class="drink-inventory-consumed" data-consumed-preview>${inventoryEscape(consumed)}</div><div class="drink-inventory-capacity">${inventoryEscape(capacity)}</div></td>
            <td><div class="drink-inventory-status drink-inventory-${warning.type}">${inventoryEscape(warning.text)}</div></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    save.disabled = !state.capabilities.includes('drink_inventory');
    bindInventoryInputs();
  }

  function bindInventoryInputs() {
    const domain = window.EventDrinkInventory;
    document.querySelectorAll('[data-drink-group] [data-remaining-input]').forEach(input => {
      input.addEventListener('input', () => {
        const row = input.closest('[data-drink-group]');
        const group = (inventoryData.groups || []).find(item => item.drink_group_id === row.dataset.drinkGroup);
        const preview = row.querySelector('[data-consumed-preview]');
        if (!group || !preview) return;
        if (input.value === '') {
          preview.textContent = group.consumed_units == null ? '待盤點' : `${group.consumed_units} ${group.inventory_unit}`;
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

  async function loadDrinkInventory() {
    const container = document.querySelector('#drinkInventoryTable');
    const save = document.querySelector('#saveDrinkInventory');
    if (!container || !save) return;
    if (!state.capabilities.includes('drink_inventory')) {
      container.innerHTML = '<div class="empty compact">酒水盤點介面已準備完成，但目前部署中的 GAS 尚未支援酒水盤點 API。</div>';
      save.disabled = true;
      setInventoryStatus('需要先部署新版 GAS 後端，部署後此頁會直接讀取帳務採購。', true);
      return;
    }
    container.innerHTML = '<div class="empty compact">正在讀取帳務酒水採購…</div>';
    save.disabled = true;
    setInventoryStatus('');
    try {
      await loadInventoryDomain();
      const data = await apiRead('drink_inventory', { activity_id: state.activityId });
      renderDrinkInventory(data);
    } catch (err) {
      container.innerHTML = '<div class="empty compact">酒水資料讀取失敗。</div>';
      setInventoryStatus(err && err.message ? err.message : '酒水資料讀取失敗', true);
    }
  }

  function postInventoryUpdate(fields, expectedRemaining) {
    return new Promise((resolve, reject) => {
      if (!state.apiUrl || !state.token) return reject(new Error('尚未輸入存取碼'));
      const iframeName = 'gas-drink-inventory-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.style.display = 'none';
      iframe.setAttribute('aria-hidden', 'true');
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = state.apiUrl;
      form.target = iframeName;
      form.style.display = 'none';
      form.setAttribute('aria-hidden', 'true');
      const values = { ...fields, token: state.token, origin: location.origin };
      Object.entries(values).forEach(([name, value]) => {
        const input = document.createElement('input');
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
      window.addEventListener('message', onMessage);
      document.body.append(iframe, form);
      form.submit();
      (async () => {
        try {
          for (let attempt = 0; attempt < 12; attempt += 1) {
            await sleep(attempt === 0 ? 500 : 750);
            if (serverResult && !serverResult.ok) throw new Error(serverResult.error || 'GAS 寫入失敗');
            const after = await apiRead('drink_inventory', { activity_id: fields.activity_id });
            const group = (after.groups || []).find(item => String(item.drink_group_id || '') === String(fields.drink_group_id || ''));
            if (group && Number(group.remaining_units) === Number(expectedRemaining)) return resolve(after);
          }
          throw new Error('尚未確認盤點寫入結果，請重新讀取後確認');
        } catch (err) {
          reject(err);
        } finally {
          window.removeEventListener('message', onMessage);
          form.remove();
          iframe.remove();
        }
      })();
    });
  }

  async function saveDrinkInventory() {
    const button = document.querySelector('#saveDrinkInventory');
    if (!button || button.disabled) return;
    const domain = await loadInventoryDomain();
    const changes = [];
    document.querySelectorAll('[data-drink-group]').forEach(row => {
      const group = (inventoryData.groups || []).find(item => item.drink_group_id === row.dataset.drinkGroup);
      const input = row.querySelector('[data-remaining-input]');
      if (!group || !input || input.disabled || input.value === '') return;
      try {
        const result = domain.calculateConsumption(group, input.value);
        input.setCustomValidity('');
        if (group.remaining_units == null || Number(group.remaining_units) !== Number(result.remaining_units)) {
          changes.push({ group, result });
        }
      } catch (err) {
        input.setCustomValidity(err.message || '剩餘數量不正確');
        input.reportValidity();
      }
    });
    if (!changes.length) {
      setInventoryStatus('沒有需要儲存的盤點變更。');
      return;
    }
    button.disabled = true;
    setInventoryStatus(`正在儲存 ${changes.length} 項盤點…`);
    try {
      let latest = inventoryData;
      for (const change of changes) {
        latest = await postInventoryUpdate({
          action: 'update_drink_inventory',
          activity_id: state.activityId,
          drink_group_id: change.group.drink_group_id,
          remaining_units: change.result.remaining_units
        }, change.result.remaining_units);
      }
      renderDrinkInventory(latest);
      setInventoryStatus(`已儲存 ${changes.length} 項盤點，消耗量已自動更新。`);
    } catch (err) {
      setInventoryStatus(err && err.message ? err.message : '酒水盤點儲存失敗', true);
      button.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    installInventoryStyles();
    installInventoryPanel();
    installTabBehavior();
    document.querySelector('#saveDrinkInventory')?.addEventListener('click', () => void saveDrinkInventory());
    try { await loadInventoryDomain(); } catch (_) {}

    const previousRender = window.render;
    if (typeof previousRender === 'function') {
      window.render = function drinkInventoryRender(data) {
        previousRender(data);
        if (inventoryPanelActive()) void loadDrinkInventory();
      };
    }
  });
})();