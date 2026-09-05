(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PrizeViews = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const FIELDS = ['獎別', '獎金用途', '名額', '單筆金額', '頒獎人', '狀態', '備註', '資金來源', '預算金額', '預算項目'];
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function staffMatches(staff, query) {
    const q = String(query || '').trim();
    return q ? staff.filter(p => p.name.includes(q)).slice(0, 8) : [];
  }
  function attachStaffSuggestions(container, staff) {
    container.querySelectorAll('input[list]').forEach(input => {
      input.removeAttribute('list');
      const suggestions = container.ownerDocument.createElement('div');
      suggestions.className = 'prize-staff-suggestions';
      input.insertAdjacentElement('afterend', suggestions);
      const clear = () => { suggestions.innerHTML = ''; };
      let selected = -1;
      const choose = name => { input.value = name; clear(); input.dispatchEvent(new root.Event('change', { bubbles: true })); };
      input.addEventListener('input', () => {
        selected = -1;
        suggestions.innerHTML = staffMatches(staff, input.value).map(p => '<button type="button" data-staff-name="' + esc(p.name) + '">' + esc(p.name) + '<small>' + esc([p.department, p.title].filter(Boolean).join('／')) + '</small></button>').join('');
        suggestions.querySelectorAll('button').forEach(button => {
          button.addEventListener('mousedown', event => event.preventDefault());
          button.addEventListener('click', () => choose(button.dataset.staffName));
        });
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape') clear();
        const buttons = Array.from(suggestions.querySelectorAll('button'));
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && buttons.length) {
          event.preventDefault();
          selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons.forEach((b, i) => { b.classList.toggle('staff-selected', i === selected); });
        }
        if (event.key === 'Enter' && buttons[selected]) { event.preventDefault(); choose(buttons[selected].dataset.staffName); }
      });
    });
  }
  function matches(prize, fields) {
    return FIELDS.every(k => fields[k] == null || String(prize[k] == null ? '' : prize[k]).trim() === String(fields[k]).trim());
  }
  function createController(container, context) {
    const state = { prizes: [], staff: [], busy: false, error: '', editing: null, message: '' };
    const api = () => root.PlanningCore;
    const activityId = context.activityId;
    async function read() { state.prizes = (await api().apiRead('prizes', { activity_id: activityId })).prizes || []; }
    async function load() {
      state.busy = true; render();
      try {
        await read();
        try { state.staff = (await api().apiRead('staff_directory')).staff || []; } catch (_) { /* 獎項仍可使用 */ }
        state.error = '';
      } catch (err) { state.error = err.message; }
      state.busy = false; render();
    }
    async function save(fields) {
      if (state.busy) return;
      const before = new Set(state.prizes.map(p => p.prize_id));
      state.busy = true; state.error = ''; render();
      try {
        await api().apiWrite(Object.assign({ action: 'save_accounting_prize', activity_id: activityId }, fields), {
          confirm: async () => {
            const rows = (await api().apiRead('prizes', { activity_id: activityId })).prizes || [];
            if (fields._delete) return !rows.some(p => p.prize_id === fields.prize_id);
            return rows.some(p => (fields.prize_id ? p.prize_id === fields.prize_id : !before.has(p.prize_id)) && matches(p, fields));
          }
        });
        state.editing = null;
        await read();
        state.message = fields._delete ? '獎項已刪除' : '獎項已儲存';
      } catch (err) { state.error = err.message; }
      state.busy = false; render();
    }
    function editor() {
      if (!state.editing) return '';
      const p = state.editing;
      const options = { 獎金用途: ['', '抽獎', '遊戲', '參加獎', '加碼', '其他'], 資金來源: ['', '公司', '廠商', '其他'], 預算項目: ['', '獎金-抽獎', '獎金-遊戲'] };
      return '<form data-prize-form class="prize-form">' + FIELDS.map(k => {
        const value = p[k] == null ? '' : p[k];
        let control;
        if (options[k]) {
          const values = options[k].includes(value) ? options[k] : options[k].concat(value);
          control = '<select name="' + k + '">' + values.map(v => '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(v || '未指定') + '</option>').join('') + '</select>';
        } else {
          const numeric = ['名額', '單筆金額', '預算金額'].includes(k);
          control = '<input name="' + k + '" value="' + esc(value) + '"' + (numeric ? ' type="number" min="0" step="' + (k === '名額' ? '1' : '0.01') + '"' : '') +
            (k === '獎別' ? ' required' : '') + (k === '頒獎人' ? ' list="prize-staff"' : '') + '>';
        }
        return '<label>' + k + control + '</label>';
      }).join('') + '<div><button type="submit">儲存獎項</button> <button type="button" data-cancel>取消</button></div></form>';
    }
    function render() {
      container.innerHTML = '<section class="card prize-view"><div class="section-heading"><h2>獎項</h2><div><button type="button" data-add>新增獎項</button> <button type="button" data-reload>重新讀取</button></div></div>' +
        '<p class="muted">獎項與流程表共用同一份資料。實際支出仍由支出明細登記。</p>' +
        '<p role="status">' + esc(state.busy ? '處理中…' : state.error || state.message) + '</p>' +
        '<datalist id="prize-staff">' + state.staff.map(p => '<option value="' + esc(p.name) + '">' + esc(p.department + '／' + p.title) + '</option>').join('') + '</datalist>' + editor() +
        '<div class="prize-scroll"><table><thead><tr>' + FIELDS.filter(k => k !== '備註').map(k => '<th>' + k + '</th>').join('') + '<th>實際發放金額</th><th></th></tr></thead><tbody>' +
        (state.prizes.map(p => '<tr>' + FIELDS.filter(k => k !== '備註').map(k => '<td>' + esc(p[k] === '' || p[k] == null ? '—' : p[k]) + '</td>').join('') +
          '<td>' + esc(p['實際發放金額'] === '' ? '—' : p['實際發放金額']) + '</td><td><button type="button" data-edit="' + esc(p.prize_id) + '">編輯</button> <button type="button" data-delete="' + esc(p.prize_id) + '">刪除</button></td></tr>').join('') || '<tr><td colspan="11">尚無獎項</td></tr>') + '</tbody></table></div></section>';
      container.querySelectorAll('button, input, select').forEach(el => { el.disabled = state.busy; });
      container.querySelector('[data-add]').addEventListener('click', () => { state.editing = {}; render(); });
      container.querySelector('[data-reload]').addEventListener('click', load);
      container.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', () => { state.editing = Object.assign({}, state.prizes.find(p => p.prize_id === el.dataset.edit)); render(); }));
      container.querySelectorAll('[data-delete]').forEach(el => el.addEventListener('click', () => {
        if (root.confirm('刪除這個獎項？已連結流程或有發放紀錄的獎項須先處理。')) save({ prize_id: el.dataset.delete, _delete: '1' });
      }));
      const form = container.querySelector('[data-prize-form]');
      if (form) {
        form.querySelector('[data-cancel]').addEventListener('click', () => { state.editing = null; render(); });
        form.addEventListener('submit', event => {
          event.preventDefault();
          if (!form.reportValidity()) return;
          const fields = state.editing.prize_id ? { prize_id: state.editing.prize_id } : {};
          form.querySelectorAll('[name]').forEach(el => { fields[el.name] = el.value.trim(); });
          state.editing = Object.assign({}, state.editing, fields);
          // 既有列只送改過的欄位，避免覆蓋同時在流程表進行的編輯。
          if (fields.prize_id) {
            const old = state.prizes.find(p => p.prize_id === fields.prize_id);
            FIELDS.forEach(k => { if (String(old[k] == null ? '' : old[k]) === fields[k]) delete fields[k]; });
          }
          save(fields);
        });
      }
      attachStaffSuggestions(container, state.staff);
    }
    return { state, load, render, save };
  }
  return { matches, staffMatches, attachStaffSuggestions, createController, async mount(container, context) { await createController(container, context).load(); } };
});
