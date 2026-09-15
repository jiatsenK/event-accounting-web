(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkViews = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  const CHECKLIST_STATUSES = ['待辦', '進行中', '完成', '不做'];

  function core() {
    if (!root || !root.PlanningCore) throw new Error('資料模組尚未載入');
    return root.PlanningCore;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  const CHECKLIST_TEMPLATE = '<div class="work-app">' +
    '<div class="card">' +
    '<div class="section-heading"><div><h2>籌備清單</h2><div class="muted">活動籌備行動項，可從標準範本帶入再就地調整</div></div>' +
    '<div class="checklist-toolbar"><button id="importChecklistTemplate" class="secondary" type="button">從範本帶入</button><button id="showChecklistEditor" type="button">新增項目</button></div></div>' +
    '<div id="checklistEditor" class="editor-panel" hidden>' +
    '<div class="section-heading"><h2 id="checklistFormTitle">新增項目</h2><button id="closeChecklistEditor" class="secondary" type="button">關閉</button></div>' +
    '<form id="checklistForm">' +
    '<input name="項目" placeholder="項目，例如：確認場地與檔期" required>' +
    '<div class="row"><input name="負責" placeholder="負責人（選填）"><input name="到期" type="date"></div>' +
    '<div class="row"><select name="狀態">' + CHECKLIST_STATUSES.map(status => '<option value="' + status + '">' + status + '</option>').join('') +
    '</select><input name="關聯" placeholder="關聯的流程段／獎項／申請單 id（選填）"></div>' +
    '<textarea name="備註" placeholder="備註（選填）"></textarea>' +
    '<div class="form-actions"><button id="submitChecklistItem" type="submit">儲存項目</button><button id="cancelChecklistEdit" class="secondary" type="button" hidden>取消修改</button></div>' +
    '<div id="checklistFormStatus" class="status form-status" aria-live="polite"></div>' +
    '</form></div>' +
    '<div id="checklistStatusMessage" class="status form-status" aria-live="polite"></div>' +
    '<div class="checklist-table-wrap"><table class="checklist-table">' +
    '<thead><tr><th>項目</th><th>負責</th><th>狀態</th><th>到期</th><th>關聯</th><th>備註</th><th></th></tr></thead>' +
    '<tbody id="checklistRows"><tr><td colspan="7" class="empty">讀取中…</td></tr></tbody>' +
    '</table></div></div></div>';

  function checklistRow(item) {
    return '<tr>' +
      '<td>' + escapeHtml(item['項目']) + '</td>' +
      '<td>' + escapeHtml(item['負責'] || '—') + '</td>' +
      '<td><span class="checklist-status checklist-status-' + escapeHtml(item['狀態']) + '">' + escapeHtml(item['狀態']) + '</span></td>' +
      '<td>' + escapeHtml(item['到期'] || '—') + '</td>' +
      '<td>' + escapeHtml(item['關聯'] || '—') + '</td>' +
      '<td>' + escapeHtml(item['備註'] || '—') + '</td>' +
      '<td><div class="checklist-row-actions">' +
      '<button type="button" class="table-action" data-edit-checklist-item="' + escapeHtml(item.item_id) + '">修改</button>' +
      '<button type="button" class="table-action danger-outline" data-delete-checklist-item="' + escapeHtml(item.item_id) + '">刪除</button>' +
      '</div></td></tr>';
  }

  function renderChecklistRows(container, items) {
    container.querySelector('#checklistRows').innerHTML = items.length
      ? items.map(checklistRow).join('')
      : '<tr><td colspan="7" class="empty">目前沒有籌備項目，可以「新增項目」或「從範本帶入」。</td></tr>';
  }

  function setChecklistStatus(container, text, error) {
    const el = container.querySelector('#checklistStatusMessage');
    el.textContent = text || '';
    el.className = error ? 'status form-status error' : 'status form-status';
  }

  function setChecklistFormStatus(container, text, error) {
    const el = container.querySelector('#checklistFormStatus');
    el.textContent = text || '';
    el.className = error ? 'status form-status error' : 'status form-status';
  }

  function openChecklistEditor(container, item) {
    const editor = container.querySelector('#checklistEditor');
    const form = container.querySelector('#checklistForm');
    form.reset();
    form.dataset.itemId = item ? item.item_id : '';
    if (item) {
      form.elements['項目'].value = item['項目'] || '';
      form.elements['負責'].value = item['負責'] || '';
      form.elements['到期'].value = item['到期'] || '';
      form.elements['狀態'].value = CHECKLIST_STATUSES.includes(item['狀態']) ? item['狀態'] : '待辦';
      form.elements['關聯'].value = item['關聯'] || '';
      form.elements['備註'].value = item['備註'] || '';
    }
    container.querySelector('#checklistFormTitle').textContent = item ? '修改項目' : '新增項目';
    container.querySelector('#cancelChecklistEdit').hidden = !item;
    setChecklistFormStatus(container, '');
    editor.hidden = false;
    form.elements['項目'].focus();
  }

  function closeChecklistEditor(container) {
    container.querySelector('#checklistEditor').hidden = true;
    container.querySelector('#checklistForm').reset();
  }

  const checklist = Object.freeze({
    async mount(container, context) {
      container.innerHTML = CHECKLIST_TEMPLATE;
      const activityId = context.activityId;
      let items = [];

      async function reload() {
        const payload = await core().apiRead('checklist', { activity_id: activityId });
        items = Array.isArray(payload.items) ? payload.items : [];
        renderChecklistRows(container, items);
      }

      async function refresh() {
        setChecklistStatus(container, '正在讀取籌備清單…');
        try {
          await reload();
          setChecklistStatus(container, '');
        } catch (error) {
          container.querySelector('#checklistRows').innerHTML = '<tr><td colspan="7" class="empty">讀取失敗</td></tr>';
          setChecklistStatus(container, error && error.message || '讀取失敗', true);
        }
      }

      container.querySelector('#showChecklistEditor').addEventListener('click', () => openChecklistEditor(container));
      container.querySelector('#closeChecklistEditor').addEventListener('click', () => closeChecklistEditor(container));
      container.querySelector('#cancelChecklistEdit').addEventListener('click', () => closeChecklistEditor(container));

      container.querySelector('#checklistRows').addEventListener('click', event => {
        const editButton = event.target.closest('[data-edit-checklist-item]');
        if (editButton) {
          const item = items.find(row => String(row.item_id) === editButton.dataset.editChecklistItem);
          if (item) openChecklistEditor(container, item);
          return;
        }
        const deleteButton = event.target.closest('[data-delete-checklist-item]');
        if (deleteButton) {
          const itemId = deleteButton.dataset.deleteChecklistItem;
          if (!root.confirm('確定刪除這筆籌備項目？')) return;
          setChecklistStatus(container, '正在刪除…');
          core().apiWrite({ action: 'save_checklist_item', activity_id: activityId, item_id: itemId, _delete: '1' }, {
            confirm: async () => {
              await reload();
              return !items.some(row => String(row.item_id) === itemId) ? { deleted: true } : false;
            }
          }).then(() => setChecklistStatus(container, '已刪除')).catch(error => setChecklistStatus(container, error && error.message || '刪除失敗', true));
          return;
        }
      });

      container.querySelector('#checklistForm').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.target;
        const itemId = form.dataset.itemId || '';
        const fields = {
          action: 'save_checklist_item',
          activity_id: activityId,
          item_id: itemId,
          '項目': form.elements['項目'].value.trim(),
          '負責': form.elements['負責'].value.trim(),
          '到期': form.elements['到期'].value,
          '狀態': form.elements['狀態'].value,
          '關聯': form.elements['關聯'].value.trim(),
          '備註': form.elements['備註'].value.trim()
        };
        if (!fields['項目']) { setChecklistFormStatus(container, '請填寫項目內容', true); return; }
        setChecklistFormStatus(container, '正在儲存…');
        try {
          await core().apiWrite(fields, {
            confirm: async () => {
              const beforeCount = items.length;
              await reload();
              if (itemId) {
                const updated = items.find(row => String(row.item_id) === itemId);
                return updated && updated['項目'] === fields['項目'] && updated['狀態'] === fields['狀態'] ? updated : false;
              }
              return items.length > beforeCount ? { created: true } : false;
            }
          });
          closeChecklistEditor(container);
          setChecklistStatus(container, itemId ? '已儲存修改' : '已新增項目');
        } catch (error) {
          setChecklistFormStatus(container, error && error.message || '儲存失敗', true);
        }
      });

      container.querySelector('#importChecklistTemplate').addEventListener('click', async () => {
        if (items.length && !root.confirm('從範本帶入會先清空這個活動目前的籌備清單，確定要繼續嗎？')) return;
        setChecklistStatus(container, '正在帶入範本…');
        try {
          await core().apiWrite({ action: 'import_checklist', activity_id: activityId }, {
            confirm: async () => {
              await reload();
              return items.length ? { imported: true } : false;
            }
          });
          setChecklistStatus(container, '已帶入標準籌備清單');
        } catch (error) {
          setChecklistStatus(container, error && error.message || '帶入失敗', true);
        }
      });

      await refresh();
    }
  });

  return {
    CHECKLIST_STATUSES,
    checklistRow,
    checklist
  };
});
