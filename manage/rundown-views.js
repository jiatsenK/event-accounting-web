(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RundownViews = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function (root) {
  'use strict';

  function core() {
    if (!root || !root.RundownCore) throw new Error('流程表資料模組尚未載入');
    return root.RundownCore;
  }

  function planning() {
    if (!root || !root.PlanningCore) throw new Error('規劃資料模組尚未載入');
    return root.PlanningCore;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  const MODES = [
    { id: 'edit', label: '編輯流程' },
    { id: 'assign', label: '排人' },
    { id: 'print', label: '列印版本' }
  ];

  // ===========================================================================

  function createController(container, context) {
    const state = {
      activityId: String(context && context.activityId || ''),
      data: core().normalize({}),
      source: 'empty', // 'backend' | 'demo' | 'empty'
      mode: 'edit',
      printVersion: 'control',
      templateId: null,    // 目前預覽／要帶入的範本
      busy: false,
      message: '',
      error: false
    };
    state.templateId = (core().templates()[0] || {}).id || null;
    state.importTemplateId = state.templateId;
    state.anchorEditing = new Set(); // 正在編輯錨定時間的 segment_id；多數段落用不到，預設收起來

    function setMessage(message, error) {
      state.message = message || '';
      state.error = Boolean(error);
    }

    async function load(source) {
      state.busy = true;
      render();
      try {
        if (source === 'demo') {
          const tpl = core().template(state.templateId);
          state.templateId = tpl.id;
          state.data = tpl;
          state.source = 'demo';
          setMessage('範例流程「' + tpl.label + '」（唯讀）。按「帶入到目前活動」寫進實際活動即可編輯。', false);
        } else {
          const raw = await planning().fetchRundown(state.activityId);
          state.data = core().normalize(raw);
          state.source = 'backend';
          const empty = !state.data.segments.length && !state.data.roles.length;
          setMessage(empty ? '這場活動還沒有流程表內容，可從「編輯流程」開始，或按「看範例流程」帶入去年的流程。' : '', false);
        }
      } catch (err) {
        if (source !== 'demo') {
          state.source = 'empty';
          setMessage((err && err.message || '讀取失敗') + '；可先按「看範例流程」預覽版面。', true);
        }
      } finally {
        state.busy = false;
        render();
      }
    }

    // 樂觀更新：把這次寫入先套進本機資料，畫面立即反應，再送後端；失敗才重讀還原。
    function applyLocal(fields) {
      const d = state.data;
      const del = String(fields._delete || '') === '1';
      switch (fields.action) {
        case 'save_rundown_segment':
          if (del) {
            d.segments = d.segments.filter(s => s.segment_id !== fields.segment_id);
            d.tasks = d.tasks.filter(t => t.segment_id !== fields.segment_id);
          } else if (fields.segment_id) {
            const s = d.segments.find(x => x.segment_id === fields.segment_id);
            if (s) {
              if (fields['節目內容'] != null) s.title = fields['節目內容'];
              if (fields.duration_min != null && fields.duration_min !== '') s.duration_min = Number(fields.duration_min) || 0;
              if (fields['錨定時間'] != null) s.anchor_time = fields['錨定時間'];
              if (fields['順序'] != null && fields['順序'] !== '') s.order = Number(fields['順序']) || s.order;
              if (fields['階段']) s.stage = fields['階段'];
            }
          }
          break;
        case 'save_rundown_config': {
          if (!d.config) d.config = {};
          if (fields['正式_基準開始'] != null) d.config.official_start = fields['正式_基準開始'];
          if (fields['彩排_基準'] != null) d.config.rehearsal_mode = fields['彩排_基準'] === '固定開始' ? '固定開始' : '接續正式';
          if (fields['彩排_固定開始'] != null) d.config.rehearsal_start = fields['彩排_固定開始'];
          if (fields['彩排_緩衝分鐘'] != null && fields['彩排_緩衝分鐘'] !== '') d.config.rehearsal_buffer_min = Number(fields['彩排_緩衝分鐘']) || 0;
          break;
        }
        case 'save_rundown_role':
          if (del) d.roles = d.roles.filter(r => r.role !== fields['角色']);
          break;
        case 'save_rundown_task':
          if (del) d.tasks = d.tasks.filter(t => t.task_id !== fields.task_id);
          break;
        case 'save_rundown_assignment':
          if (del) {
            d.assignments = d.assignments.filter(x => !(x.role === fields['角色'] && x.person === fields['人員姓名']));
          } else if (!d.assignments.some(x => x.role === fields['角色'] && x.person === fields['人員姓名'])) {
            d.assignments.push({ role: fields['角色'], person: fields['人員姓名'] });
          }
          break;
        case 'save_rundown_crew':
          if (del) d.crew = d.crew.filter(c => c.name !== fields['姓名']);
          break;
        default:
          break;
      }
    }

    // 用重讀結果確認寫入是否生效（postMessage 常被瀏覽器擋掉）
    async function confirmWrite(fields) {
      const d = core().normalize(await planning().fetchRundown(state.activityId));
      state._fresh = d;
      const del = String(fields._delete || '') === '1';
      const t = s => String(s == null ? '' : s).trim();
      switch (fields.action) {
        case 'save_rundown_segment':
          if (del) return !d.segments.some(s => s.segment_id === fields.segment_id);
          if (fields.segment_id) return d.segments.some(s => s.segment_id === fields.segment_id && s.title === t(fields['節目內容']));
          return d.segments.some(s => s.title === t(fields['節目內容']));
        case 'save_rundown_role':
          return del ? !d.roles.some(r => r.role === fields['角色']) : d.roles.some(r => r.role === fields['角色']);
        case 'save_rundown_task':
          if (del) return !d.tasks.some(x => x.task_id === fields.task_id);
          return d.tasks.some(x => x.segment_id === fields.segment_id && x.content === t(fields['任務內容']));
        case 'save_rundown_assignment': {
          const has = d.assignments.some(a => a.role === fields['角色'] && a.person === fields['人員姓名']);
          return del ? !has : has;
        }
        case 'save_rundown_crew':
          return del ? !d.crew.some(c => c.name === fields['姓名']) : d.crew.some(c => c.name === fields['姓名']);
        case 'save_rundown_config':
          return !!(d.config && (fields['正式_基準開始'] == null || d.config.official_start === t(fields['正式_基準開始'])));
        case 'import_rundown': {
          // 清空（帶空 data）跟一般帶入的「成功」判斷相反：清空要看到變空，不是變有內容
          let expected;
          try { expected = JSON.parse(fields.data || '{}'); } catch (e) { expected = {}; }
          const expectEmpty = !(expected.segments || []).length && !(expected.roles || []).length;
          return expectEmpty ? (d.segments.length === 0 && d.roles.length === 0) : (d.segments.length > 0 || d.roles.length > 0);
        }
        default:
          return null;
      }
    }

    async function write(fields, okMessage, options) {
      const opts = options || {};
      if (state.source === 'demo' && !opts.allowDemo) {
        setMessage('這是範例流程（唯讀）。用上方的「帶入到目前活動」寫進實際活動。', true);
        render();
        return;
      }
      const paint = opts.noRender ? renderStatusOnly : render;
      if (opts.optimistic !== false) applyLocal(fields);
      state.busy = true;
      setMessage(opts.pending || '處理中…', false);
      paint();
      try {
        await planning().apiWrite(
          Object.assign({ activity_id: state.activityId }, fields),
          { confirm: () => confirmWrite(fields) }
        );
        if (state._fresh) { state.data = state._fresh; state._fresh = null; }
        else { try { state.data = core().normalize(await planning().fetchRundown(state.activityId)); } catch (e) { /* keep local */ } }
        state.source = 'backend';
        state.busy = false;
        setMessage(okMessage || '已儲存', false);
        paint();
      } catch (err) {
        state.busy = false;
        setMessage((err && err.message) || '寫入失敗', true);
        try { state.data = core().normalize(await planning().fetchRundown(state.activityId)); } catch (e) { /* keep local */ }
        render();
      }
    }

    async function importTemplate(templateId, mode) {
      let template = core().template(templateId || state.templateId);
      if (!template) { setMessage('找不到這份流程範本', true); render(); return; }
      const target = (context && context.activity && context.activity.name) || state.activityId;
      if (state.source === 'demo') state.source = 'backend';
      const payload = {
        segments: template.segments, roles: template.roles, tasks: template.tasks,
        crew: template.crew, assignments: template.assignments
      };
      const label = template.label;
      if (mode === 'replace' && typeof root.confirm === 'function' &&
          !root.confirm('帶入「' + label + '」前會清空「' + target + '」目前的流程內容，確定？')) return;
      await write(
        { action: 'import_rundown', mode: mode === 'append' ? 'append' : 'replace', data: JSON.stringify(payload) },
        '已帶入「' + label + '」', { allowDemo: true, optimistic: false, pending: '帶入中，這步會慢一點…' }
      );
    }

    function renderStatusOnly() {
      const el = container.querySelector('.rd-status');
      if (!el) { render(); return; }
      el.textContent = state.message;
      el.classList.toggle('error', state.error);
      el.classList.toggle('rd-hidden', !state.message);
    }

    // -- rendering -----------------------------------------------------------

    function render() {
      container.innerHTML =
        '<div class="rundown">' +
          header() +
          '<nav class="rd-modes" aria-label="流程表模式">' +
            MODES.map(m => '<button type="button" data-mode="' + m.id + '"' +
              (m.id === state.mode ? ' class="active" aria-current="true"' : '') + '>' + esc(m.label) + '</button>').join('') +
          '</nav>' +
          '<p class="rd-status' + (state.error ? ' error' : '') + (state.message ? '' : ' rd-hidden') + '" role="status">' + esc(state.message) + '</p>' +
          '<div class="rd-body">' + body() + '</div>' +
        '</div>';
      bind();
    }

    function templateOptions(selectedId) {
      return core().templates().map(t =>
        '<option value="' + esc(t.id) + '"' + (t.id === selectedId ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('');
    }

    // 活動名稱由外殼的 section-header 顯示，這裡不重複；只留動作按鈕。
    function header() {
      const editable = state.source === 'backend';
      return '<header class="rd-head">' +
        '<div class="rd-head-actions">' +
        '<button type="button" data-action="reload"' + (state.busy ? ' disabled' : '') + '>重新讀取</button>' +
        (state.source === 'demo'
          ? '<label class="rd-tpl-pick">範本 <select data-tpl-pick' + (state.busy ? ' disabled' : '') + '>' + templateOptions(state.templateId) + '</select></label>' +
            '<button type="button" data-action="import-current" class="rd-primary"' + (state.busy ? ' disabled' : '') + '>帶入到目前活動</button>' +
            '<button type="button" data-action="load-backend"' + (state.busy ? ' disabled' : '') + '>切回實際活動</button>'
          : '<button type="button" data-action="load-demo"' + (state.busy ? ' disabled' : '') + '>看範例流程</button>') +
        '</div>' +
        (editable ? '' : '<span class="rd-badge">' + (state.source === 'demo' ? '範例（唯讀）' : '尚未連線') + '</span>') +
        '</header>';
    }

    function body() {
      if (state.mode === 'edit') return editView();
      if (state.mode === 'assign') return assignView();
      return printView();
    }

    // -- 編輯流程 ------------------------------------------------------------

    function editView() {
      const d = state.data;
      const stageOptions = core().STAGES.map(s => '<option value="' + s + '">' + s + '</option>').join('');
      const roleOptions = d.roles.map(r => '<option value="' + esc(r.role) + '">' + esc(r.role) + '</option>').join('');
      const audienceOptions = core().AUDIENCES.map(a => '<option value="' + a + '">' + a + '</option>').join('');
      const prizeIndex = core().prizeIndexOf(d);

      const readOnly = state.source === 'demo';
      const dis = readOnly ? ' disabled' : '';
      // 段落只存 duration／錨定時間；牆上時間在這裡即時算出來唯讀顯示。
      const timed = core().calculateTimeline(d.segments, d.config);
      const timeById = new Map(timed.map(s => [s.segment_id, s]));

      // 錨定時間絕大多數段落用不到（只有少數要釘死時刻），預設收成一個小按鈕；
      // 點開才變成真正的時間欄位，不是每一列都攤開一個空的時間框。
      function anchorCellHtml(seg, readOnly) {
        if (readOnly) return seg.anchor_time ? esc(seg.anchor_time) : '';
        if (seg.anchor_time || state.anchorEditing.has(seg.segment_id)) {
          return '<input class="rd-in rd-in-time" type="time" data-field="錨定時間" value="' + esc(seg.anchor_time) + '">';
        }
        return '<button type="button" class="rd-link" data-action="add-anchor" data-seg="' + esc(seg.segment_id) + '" title="把這段釘在固定時刻，其餘段落不用設">📌 釘時刻</button>';
      }

      // 獎項：直接列出可用獎項當可點的標籤，點一下就連結／取消連結，不用打 prize_id。
      function prizeCellHtml(seg, readOnly) {
        if (!d.prizes.length) return '';
        if (readOnly) {
          return core().segmentPrizes(seg, prizeIndex).map(p => '<span class="rd-chip">' + esc(core().prizeLabel(p)) + '</span>').join('');
        }
        const linked = new Set(seg.prize_ids || []);
        return d.prizes.map(p => {
          const active = linked.has(p.prize_id);
          return '<button type="button" class="rd-prize-toggle' + (active ? ' rd-prize-toggle-active' : '') +
            '" data-action="toggle-prize" data-prize="' + esc(p.prize_id) + '" title="' + esc(core().prizeLabel(p)) + '">' + esc(p.tier || p.prize_id) + '</button>';
        }).join('');
      }

      // 順序不給手打：拖把手調（滑鼠），或按 ▲▼（觸控／鍵盤都能用，拖曳在手機上常常失靈）。
      // 順序值本身用隱藏欄位跟著列一起送出。
      const segmentRows = timed.map((seg, i) =>
        '<tr data-seg="' + esc(seg.segment_id) + '">' +
          '<td class="rd-order-cell">' + (readOnly ? '' :
            '<span class="rd-drag-handle" draggable="true" title="拖曳調整順序">⠿</span>' +
            '<button type="button" class="rd-icon rd-order-btn" data-action="move-seg" data-dir="up"' + (i === 0 ? ' disabled' : '') + ' title="上移">▲</button>' +
            '<button type="button" class="rd-icon rd-order-btn" data-action="move-seg" data-dir="down"' + (i === timed.length - 1 ? ' disabled' : '') + ' title="下移">▼</button>') +
            '<input type="hidden" data-field="順序" value="' + esc(seg.order) + '"></td>' +
          '<td class="rd-time-readout">' + esc(seg.time) + '</td>' +
          '<td><input class="rd-in rd-in-num rd-in-duration" data-field="duration_min" value="' + esc(seg.duration_min) + '" inputmode="numeric"' + dis + '></td>' +
          '<td class="rd-anchor-cell">' + anchorCellHtml(seg, readOnly) + '</td>' +
          '<td><input class="rd-in" data-field="節目內容" value="' + esc(seg.title) + '"' + dis + '></td>' +
          '<td><select class="rd-in" data-field="階段"' + dis + '>' + stageOptions.replace('value="' + seg.stage + '"', 'value="' + seg.stage + '" selected') + '</select></td>' +
          '<td class="rd-prize-cell">' + prizeCellHtml(seg, readOnly) + '</td>' +
          '<td>' + (readOnly ? '' : '<button type="button" class="rd-icon rd-danger" data-action="del-seg" title="刪除">✕</button>') + '</td>' +
        '</tr>').join('');

      const tasksBySeg = new Map();
      d.tasks.forEach(t => { if (!tasksBySeg.has(t.segment_id)) tasksBySeg.set(t.segment_id, []); tasksBySeg.get(t.segment_id).push(t); });
      const taskBlocks = d.segments.map(seg => {
        const rows = (tasksBySeg.get(seg.segment_id) || []).map(t =>
          '<li data-task="' + esc(t.task_id) + '"><span class="rd-task-role">' + esc(t.role) + '</span>' +
          '<span class="rd-task-content">' + esc(t.content) + '</span>' +
          '<span class="rd-task-aud rd-aud-' + esc(t.audience) + '">' + esc(t.audience) + '</span>' +
          '<button type="button" class="rd-icon rd-danger" data-action="del-task" title="刪除">✕</button></li>').join('');
        const time = (timeById.get(seg.segment_id) || {}).time || '';
        return '<section class="rd-task-block" data-seg="' + esc(seg.segment_id) + '">' +
          '<h4>' + esc([time, seg.title].filter(Boolean).join(' ')) + '</h4>' +
          '<ul class="rd-task-list">' + (rows || '<li class="rd-empty">尚無任務</li>') + '</ul>' +
          (readOnly ? '' : (d.roles.length ?
            '<div class="rd-task-add">' +
              '<select data-new="角色">' + roleOptions + '</select>' +
              '<input data-new="任務內容" placeholder="任務內容">' +
              '<select data-new="對象">' + audienceOptions + '</select>' +
              '<button type="button" data-action="add-task">加任務</button>' +
            '</div>' : '<p class="rd-hint">先在下方新增角色，才能指派任務。</p>')) +
        '</section>';
      }).join('');

      return '<div class="rd-edit">' +
        importPanel() +
        configPanel() +
        '<section class="rd-panel"><div class="rd-panel-head"><h3>時段</h3>' +
          '<span class="rd-muted">' +
          (readOnly ? '' : '拖 ⠿ 調順序；改「持續」或「錨定時間」自動存，牆上時間欄是算出來的，唯讀') + '</span></div>' +
          '<div class="rd-scroll"><table class="rd-table"><thead><tr>' +
            '<th></th><th>時間</th><th>持續(分)</th><th>錨定</th><th>節目內容</th><th>階段</th><th>獎項</th><th></th>' +
          '</tr></thead><tbody>' + (segmentRows || '<tr><td colspan="8" class="rd-empty">尚無時段</td></tr>') + '</tbody></table></div>' +
          (readOnly ? '' : '<button type="button" class="rd-add-btn" data-action="add-seg">＋ 新增時段</button>') +
        '</section>' +
        '<section class="rd-panel"><div class="rd-panel-head"><h3>角色</h3><span class="rd-muted">從主流程拆出的固定角色，人員之後再排</span></div>' +
          '<div class="rd-role-chips">' + d.roles.map(r =>
            '<span class="rd-chip rd-chip-role" data-role="' + esc(r.role) + '">' + esc(r.role) +
            (readOnly ? '' : '<button type="button" class="rd-chip-x" data-action="del-role" title="刪除">✕</button>') + '</span>').join('') +
          (readOnly ? '' : '<span class="rd-add-inline"><input data-add="角色" placeholder="新角色（音控、報到…）"><button type="button" data-action="add-role">加</button></span>') +
          '</div>' +
        '</section>' +
        '<section class="rd-panel"><div class="rd-panel-head"><h3>任務</h3><span class="rd-muted">一段一列，標「對象」決定哪個列印版本看得到</span></div>' +
          taskBlocks +
        '</section>' +
      '</div>';
    }

    function importPanel() {
      const templates = core().templates();
      if (state.source !== 'backend' || !templates.length) return '';
      const hasContent = state.data.segments.length || state.data.roles.length;
      return '<section class="rd-panel rd-import"><div class="rd-panel-head"><h3>帶入起始流程</h3>' +
        '<span class="rd-muted">' + (hasContent ? '目前活動已有內容，帶入前可選清空或附加' : '從過去的流程直接帶入，不用重打') + '</span></div>' +
        '<div class="rd-import-row">' +
          '<select data-import="template">' + templateOptions(state.importTemplateId) + '</select>' +
          '<select data-import="mode">' +
            '<option value="replace">清空後帶入</option>' +
            '<option value="append">加在現有內容後</option>' +
          '</select>' +
          '<button type="button" data-action="import-template"' + (state.busy ? ' disabled' : '') + '>帶入</button>' +
        '</div>' +
        (hasContent ? '<button type="button" class="rd-link" data-action="clear-rundown"' + (state.busy ? ' disabled' : '') + '>清空這場活動的流程表（測試資料用，無法復原）</button>' : '') +
        '</section>';
    }

    // 流程時間設定：正式段基準開始 + 彩排要「接續正式往前推」還是「固定開始時間」。
    // 改欄位不即時寫入；按「儲存」才送出一次。
    function configPanel() {
      if (state.source !== 'backend') return '';
      const c = state.data.config || {};
      const fixed = c.rehearsal_mode === '固定開始';
      const dis = state.busy ? ' disabled' : '';
      return '<section class="rd-panel rd-config"><div class="rd-panel-head"><h3>流程時間設定</h3>' +
        '<span class="rd-muted">正式段的基準開始時間，彩排段接續往前推或另訂固定時間；改完按「儲存」才套用</span></div>' +
        '<div class="rd-config-row">' +
          '<label>正式段開始<input class="rd-in rd-in-time" type="time" data-config="正式_基準開始" value="' + esc(c.official_start) + '"' + dis + '></label>' +
          '<label>彩排基準<select class="rd-in" data-config="彩排_基準"' + dis + '>' +
            '<option value="接續正式"' + (fixed ? '' : ' selected') + '>接續正式（往前推）</option>' +
            '<option value="固定開始"' + (fixed ? ' selected' : '') + '>固定開始時間</option>' +
          '</select></label>' +
          (fixed
            ? '<label class="rd-config-third">彩排開始<input class="rd-in rd-in-time" type="time" data-config="彩排_固定開始" value="' + esc(c.rehearsal_start) + '"' + dis + '></label>'
            : '<label class="rd-config-third">彩排緩衝(分)<input class="rd-in rd-in-num" data-config="彩排_緩衝分鐘" value="' + esc(c.rehearsal_buffer_min) + '" inputmode="numeric"' + dis + '></label>') +
          '<button type="button" class="rd-primary" data-action="save-config"' + dis + '>儲存</button>' +
        '</div></section>';
    }

    // -- 排人（拖曳）-------------------------------------------------------

    function assignView() {
      const d = state.data;
      const assignees = core().assigneesByRole(d);
      const unassigned = new Set(core().unassignedRoles(d));
      const groups = new Map();
      d.crew.forEach(m => { const g = m.group || '（未分組）'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(m); });

      const crewCol = '<aside class="rd-crew"><h3>工作人員</h3>' +
        '<div class="rd-add-inline"><input data-add="姓名" placeholder="姓名"><input data-add="組別" placeholder="組別"><button type="button" data-action="add-crew">加</button></div>' +
        [...groups.entries()].map(([g, members]) =>
          '<div class="rd-crew-group"><p class="rd-crew-group-name">' + esc(g) + '</p>' +
          members.map(m => '<span class="rd-person" draggable="true" data-person="' + esc(m.name) + '">' + esc(m.name) +
            '<button type="button" class="rd-chip-x" data-action="del-crew" title="移除">✕</button></span>').join('') +
          '</div>').join('') +
        (d.crew.length ? '' : '<p class="rd-hint">先新增工作人員，再拖到右邊的角色上。</p>') +
        '</aside>';

      const roleCards = d.roles.map(r => {
        const people = assignees.get(r.role) || [];
        return '<div class="rd-role-card' + (unassigned.has(r.role) ? ' rd-unassigned' : '') + '" data-role="' + esc(r.role) + '">' +
          '<div class="rd-role-card-head"><strong>' + esc(r.role) + '</strong>' +
          (unassigned.has(r.role) ? '<span class="rd-tag-unset">未排</span>' : '<span class="rd-tag-set">' + people.length + ' 人</span>') + '</div>' +
          '<p class="rd-muted">' + esc(r.description || '') + '</p>' +
          '<div class="rd-drop" data-role="' + esc(r.role) + '">' +
            people.map(p => '<span class="rd-person rd-person-set" data-person="' + esc(p) + '">' + esc(p) +
              '<button type="button" class="rd-chip-x" data-action="unassign" data-role="' + esc(r.role) + '" data-person="' + esc(p) + '" title="取消指派">✕</button></span>').join('') +
            '<span class="rd-drop-hint">拖人到這裡</span>' +
          '</div>' +
        '</div>';
      }).join('');

      const crewProjection = core().projectCrew(d);
      const preview = '<section class="rd-panel"><div class="rd-panel-head"><h3>工作人員版預覽</h3><span class="rd-muted">拖完即時更新</span></div>' +
        (crewProjection.people.some(p => p.rows.length)
          ? crewProjection.people.filter(p => p.rows.length).map(p =>
              '<div class="rd-preview-person"><h4>' + esc(p.name) + '<span class="rd-muted"> · ' + esc(p.roles.join('、')) + '</span></h4>' +
              '<ul>' + p.rows.map(row => '<li><span class="rd-preview-time">' + esc(row.time) + '</span> ' + esc(row.segment) +
                ' — ' + esc(row.content) + '</li>').join('') + '</ul></div>').join('')
          : '<p class="rd-empty">還沒有可顯示的指派任務。</p>') +
        '</section>';

      return '<div class="rd-assign">' +
        '<div class="rd-assign-grid">' + crewCol + '<div class="rd-roles">' + (roleCards || '<p class="rd-empty">先到「編輯流程」新增角色。</p>') + '</div></div>' +
        preview +
      '</div>';
    }

    // -- 列印版本 ---------------------------------------------------------

    function printView() {
      const d = state.data;
      const versions = core().VERSIONS;
      const active = versions.find(v => v.id === state.printVersion) || versions[0];
      const sheet = renderSheet(active.id, d);
      return '<div class="rd-print">' +
        '<div class="rd-print-bar">' +
          '<div class="rd-print-tabs">' + versions.map(v =>
            '<button type="button" data-version="' + v.id + '"' + (v.id === active.id ? ' class="active"' : '') + '>' + esc(v.label) + '</button>').join('') +
          '</div>' +
          '<button type="button" class="rd-print-go" data-action="print">列印 / 存 PDF</button>' +
        '</div>' +
        '<div class="rd-sheet" data-version="' + active.id + '">' + sheet + '</div>' +
      '</div>';
    }

    function renderSheet(versionId, d) {
      const title = esc(context && context.activity && context.activity.name || state.activityId);
      const label = (core().VERSIONS.find(v => v.id === versionId) || {}).label || '';
      const head = '<div class="rd-sheet-head"><h3>' + title + '</h3><span>' + esc(label) + '</span></div>';
      if (versionId === 'control') return head + sheetControl(core().projectControl(d));
      if (versionId === 'crew') return head + sheetCrew(core().projectCrew(d));
      if (versionId === 'venue') return head + sheetVenue(core().projectVenue(d));
      return head + sheetDesigner(core().projectDesigner(d));
    }

    function sheetControl(model) {
      const stages = model.stages.map(group =>
        '<h4 class="rd-stage">' + esc(group.stage) + '</h4>' +
        '<table class="rd-sheet-table"><tbody>' +
        group.segments.map(seg =>
          '<tr class="rd-seg-row"><td class="rd-time">' + esc([seg.start, seg.end].filter(Boolean).join('–')) + '</td>' +
          '<td><div class="rd-seg-title">' + esc(seg.title) + '</div>' +
          (seg.prizeLabels.length ? '<div class="rd-seg-prize">' + seg.prizeLabels.map(esc).join('；') + '</div>' : '') +
          (seg.note ? '<div class="rd-seg-note">' + esc(seg.note) + '</div>' : '') +
          (seg.tasks.length ? '<ul class="rd-seg-tasks">' + seg.tasks.map(t =>
            '<li><b>' + esc(t.role) + '</b>' + (t.unassigned ? ' <em class="rd-unset">未排</em>' : ' <span class="rd-who">' + esc(t.assignees.join('、')) + '</span>') +
            '：' + esc(t.content) + ' <span class="rd-aud rd-aud-' + esc(t.audience) + '">' + esc(t.audience) + '</span></li>').join('') + '</ul>' : '') +
          '</td></tr>').join('') +
        '</tbody></table>').join('');
      const note = model.unassignedRoles.length ? '<p class="rd-sheet-foot">未排角色：' + model.unassignedRoles.map(esc).join('、') + '</p>' : '';
      return stages + note;
    }

    function sheetCrew(model) {
      const people = model.people.filter(p => p.rows.length);
      if (!people.length) return '<p class="rd-empty">還沒有指派任務。到「排人」把人拖到角色上。</p>';
      return people.map(p =>
        '<div class="rd-crew-sheet"><h4>' + esc(p.name) + '<span class="rd-muted"> · ' + esc(p.group || p.roles.join('、')) + '</span></h4>' +
        '<table class="rd-sheet-table"><tbody>' + p.rows.map(row =>
          '<tr><td class="rd-time">' + esc(row.time) + '</td><td><b>' + esc(row.segment) + '</b>（' + esc(row.role) + '）<br>' + esc(row.content) + '</td></tr>').join('') +
        '</tbody></table></div>').join('') +
        (model.idlePeople.length ? '<p class="rd-sheet-foot">尚未安排任務：' + model.idlePeople.map(esc).join('、') + '</p>' : '');
    }

    function sheetVenue(model) {
      if (!model.rows.length) return '<p class="rd-empty">沒有標記為「飯店」對象的任務。</p>';
      return '<table class="rd-sheet-table"><tbody>' + model.rows.map(row =>
        '<tr><td class="rd-time">' + esc(row.time) + '</td><td><b>' + esc(row.segment) + '</b><ul>' +
        row.tasks.map(t => '<li>' + esc(t.content) + '</li>').join('') + '</ul></td></tr>').join('') +
        '</tbody></table>';
    }

    function sheetDesigner(model) {
      return '<table class="rd-sheet-table rd-designer"><tbody>' + model.segments.map(seg =>
        '<tr><td class="rd-time">' + esc(seg.time) + '</td><td><div class="rd-seg-title">' + esc(seg.title) +
        '</div>' +
        (seg.prizeLabels.length ? '<div class="rd-designer-prize">' + seg.prizeLabels.map(esc).join('<br>') + '</div>' : '') +
        '</td></tr>').join('') + '</tbody></table>';
    }

    // -- events -----------------------------------------------------------

    function bind() {
      container.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => {
        state.mode = btn.dataset.mode; render();
      }));
      container.querySelectorAll('[data-version]').forEach(btn => btn.addEventListener('click', () => {
        state.printVersion = btn.dataset.version; render();
      }));
      const tplPick = container.querySelector('[data-tpl-pick]');
      if (tplPick) tplPick.addEventListener('change', () => { state.templateId = tplPick.value; load('demo'); });
      const importTpl = container.querySelector('[data-import="template"]');
      if (importTpl) importTpl.addEventListener('change', () => { state.importTemplateId = importTpl.value; render(); });

      const on = (selector, event, handler) => container.querySelectorAll(selector).forEach(el => el.addEventListener(event, handler));

      // 流程時間設定：切彩排基準只換第三個欄位（不寫入、不整頁重繪——避免打斷下面時段表還沒存檔的編輯）
      on('[data-config="彩排_基準"]', 'change', event => {
        const panel = container.querySelector('.rd-config-row');
        if (!state.data.config) state.data.config = {};
        const officialEl = panel.querySelector('[data-config="正式_基準開始"]');
        if (officialEl) state.data.config.official_start = officialEl.value;
        const fixed = event.target.value === '固定開始';
        state.data.config.rehearsal_mode = fixed ? '固定開始' : '接續正式';
        const third = panel.querySelector('.rd-config-third');
        if (third) {
          third.outerHTML = fixed
            ? '<label class="rd-config-third">彩排開始<input class="rd-in rd-in-time" type="time" data-config="彩排_固定開始" value="' + esc(state.data.config.rehearsal_start) + '"></label>'
            : '<label class="rd-config-third">彩排緩衝(分)<input class="rd-in rd-in-num" data-config="彩排_緩衝分鐘" value="' + esc(state.data.config.rehearsal_buffer_min) + '" inputmode="numeric"></label>';
        }
      });
      on('[data-action="save-config"]', 'click', () => {
        const panel = container.querySelector('.rd-config-row');
        const fields = { action: 'save_rundown_config' };
        panel.querySelectorAll('[data-config]').forEach(el => { fields[el.dataset.config] = el.value.trim(); });
        write(fields, '流程時間設定已更新');
      });

      on('[data-action="reload"]', 'click', () => load(state.source === 'demo' ? 'demo' : 'backend'));
      on('[data-action="load-demo"]', 'click', () => load('demo'));
      on('[data-action="load-backend"]', 'click', () => load('backend'));
      on('[data-action="import-current"]', 'click', () => importTemplate(state.templateId, 'replace'));
      on('[data-action="import-template"]', 'click', () => {
        const wrap = container.querySelector('.rd-import-row');
        importTemplate(
          wrap.querySelector('[data-import="template"]').value,
          wrap.querySelector('[data-import="mode"]').value
        );
      });
      // 清空測試資料：走既有的 import_rundown replace，帶空資料等於全部清掉
      on('[data-action="clear-rundown"]', 'click', () => {
        const target = (context && context.activity && context.activity.name) || state.activityId;
        if (!root.confirm('清空「' + target + '」目前的流程表內容？時段、角色、任務、人員、指派全部清空，沒辦法復原。')) return;
        write({ action: 'import_rundown', mode: 'replace', data: '{}' }, '已清空流程表', { optimistic: false, pending: '清空中…' });
      });
      on('[data-action="print"]', 'click', () => {
        const body = container.ownerDocument.body;
        body.classList.add('rd-printing');
        const clear = () => { body.classList.remove('rd-printing'); root.removeEventListener('afterprint', clear); };
        root.addEventListener('afterprint', clear);
        root.print();
        root.setTimeout(clear, 1500);
      });

      // 時段：「＋」直接加一列在最後面，帶預設標題，馬上可以就地改名
      on('[data-action="add-seg"]', 'click', async () => {
        const beforeIds = new Set(state.data.segments.map(s => s.segment_id));
        const last = state.data.segments[state.data.segments.length - 1];
        const order = (last ? last.order : 0) + 10;
        await write({ action: 'save_rundown_segment', 節目內容: '新時段', duration_min: 0, 順序: order, 階段: '正式' }, '已新增時段');
        const added = state.data.segments.find(s => !beforeIds.has(s.segment_id));
        const input = added && container.querySelector('[data-seg="' + added.segment_id + '"] [data-field="節目內容"]');
        if (input) { input.focus(); input.select(); }
      });
      // 時段欄位：改完（blur / 選完）就地存，不整頁重繪；牆上時間欄靠下面的即時重算，不等網路
      on('.rd-table [data-field]', 'change', event => {
        const tr = event.target.closest('[data-seg]');
        const fields = { action: 'save_rundown_segment', segment_id: tr.dataset.seg };
        tr.querySelectorAll('[data-field]').forEach(el => { fields[el.dataset.field] = el.value.trim(); });
        if (!fields['節目內容']) { setMessage('節目內容不可空白', true); renderStatusOnly(); return; }
        write(fields, '時段已更新', { noRender: true });
      });
      // 打字當下就照目前畫面上的欄位重算牆上時間，不必等存檔完成才看到後面時段跟著動
      on('.rd-table [data-field="duration_min"], .rd-table [data-field="錨定時間"], .rd-table [data-field="階段"]', 'input', () => {
        refreshTimeReadouts();
      });
      on('[data-action="del-seg"]', 'click', event => {
        const tr = event.target.closest('[data-seg]');
        if (!root.confirm('刪除這個時段？它的任務也會一併刪除。')) return;
        write({ action: 'save_rundown_segment', segment_id: tr.dataset.seg, _delete: '1' }, '已刪除時段');
      });
      // ▲▼：跟拖曳走同一條 reorderAndSave，觸控／鍵盤都能操作
      on('[data-action="move-seg"]', 'click', event => {
        const tr = event.target.closest('tr[data-seg]');
        if (tr) moveSegment(tr.dataset.seg, event.target.dataset.dir);
      });
      bindSegmentDrag();

      // 角色
      on('[data-action="add-role"]', 'click', () => {
        const input = container.querySelector('[data-add="角色"]');
        const role = input.value.trim();
        if (!role) return;
        write({ action: 'save_rundown_role', 角色: role }, '已新增角色');
      });
      on('[data-action="del-role"]', 'click', event => {
        const chip = event.target.closest('[data-role]');
        if (!root.confirm('刪除角色「' + chip.dataset.role + '」？')) return;
        write({ action: 'save_rundown_role', 角色: chip.dataset.role, _delete: '1' }, '已刪除角色');
      });

      // 任務
      on('[data-action="add-task"]', 'click', event => {
        const block = event.target.closest('[data-seg]');
        const fields = { action: 'save_rundown_task', segment_id: block.dataset.seg };
        block.querySelectorAll('[data-new]').forEach(el => { fields[el.dataset.new] = el.value.trim(); });
        if (!fields['任務內容']) { setMessage('任務內容不可空白', true); render(); return; }
        write(fields, '已新增任務');
      });
      on('[data-action="del-task"]', 'click', event => {
        const li = event.target.closest('[data-task]');
        write({ action: 'save_rundown_task', task_id: li.dataset.task, _delete: '1' }, '已刪除任務');
      });

      // 獎項：點標籤直接連結／取消連結，不用打 prize_id
      on('[data-action="toggle-prize"]', 'click', event => {
        const tr = event.target.closest('tr[data-seg]');
        const seg = tr && state.data.segments.find(s => s.segment_id === tr.dataset.seg);
        if (!seg) return;
        const linked = new Set(seg.prize_ids || []);
        const prizeId = event.target.dataset.prize;
        const nowActive = !linked.has(prizeId);
        if (nowActive) linked.add(prizeId); else linked.delete(prizeId);
        seg.prize_ids = Array.from(linked);
        event.target.classList.toggle('rd-prize-toggle-active', nowActive);
        write({ action: 'save_rundown_segment', segment_id: seg.segment_id, 節目內容: seg.title, duration_min: seg.duration_min,
          錨定時間: seg.anchor_time, 順序: seg.order, 階段: seg.stage, 備註: seg.note, prize_ids: seg.prize_ids.join(',') },
          '已更新獎項連動', { noRender: true, optimistic: false });
      });
      // 錨定時間：預設收成按鈕，點開才變成真正的時間欄位
      on('[data-action="add-anchor"]', 'click', event => {
        state.anchorEditing.add(event.target.dataset.seg);
        render();
        const input = container.querySelector('[data-seg="' + event.target.dataset.seg + '"] [data-field="錨定時間"]');
        if (input) input.focus();
      });

      // 工作人員
      on('[data-action="add-crew"]', 'click', () => {
        const wrap = container.querySelector('.rd-crew .rd-add-inline');
        const fields = { action: 'save_rundown_crew' };
        wrap.querySelectorAll('[data-add]').forEach(el => { fields[el.dataset.add] = el.value.trim(); });
        if (!fields['姓名']) return;
        write(fields, '已新增人員');
      });
      on('[data-action="del-crew"]', 'click', event => {
        const chip = event.target.closest('[data-person]');
        write({ action: 'save_rundown_crew', 姓名: chip.dataset.person, _delete: '1' }, '已移除人員');
      });
      on('[data-action="unassign"]', 'click', event => {
        write({ action: 'save_rundown_assignment', 角色: event.target.dataset.role, 人員姓名: event.target.dataset.person, _delete: '1' }, '已取消指派');
      });

      bindDragAssign();
    }

    // 讀目前畫面上每一列的欄位值（不是 state.data，因為使用者可能還沒 blur、還沒存檔），
    // 就地重算牆上時間，只更新唯讀的時間欄文字——不動任何 input，不會打斷打字。
    function refreshTimeReadouts() {
      const rows = Array.from(container.querySelectorAll('.rd-table tbody tr[data-seg]'));
      if (!rows.length) return;
      const byId = new Map(state.data.segments.map(s => [s.segment_id, s]));
      const draft = rows.map(tr => {
        const base = byId.get(tr.dataset.seg) || {};
        const duration = tr.querySelector('[data-field="duration_min"]');
        const anchor = tr.querySelector('[data-field="錨定時間"]');
        const stage = tr.querySelector('[data-field="階段"]');
        return Object.assign({}, base, {
          segment_id: tr.dataset.seg,
          duration_min: duration ? (Number(duration.value) || 0) : base.duration_min,
          anchor_time: anchor ? anchor.value : base.anchor_time,
          stage: stage ? stage.value : base.stage
        });
      });
      const timed = core().calculateTimeline(draft, state.data.config);
      const timeById = new Map(timed.map(s => [s.segment_id, s.time]));
      rows.forEach(tr => {
        const cell = tr.querySelector('.rd-time-readout');
        if (cell) cell.textContent = timeById.get(tr.dataset.seg) || '';
      });
    }

    // 拖 ⠿ 調整順序：放開時只送被拖動那一段的新順序值（取新鄰居的中間值），不動其他列。
    function bindSegmentDrag() {
      const tbody = container.querySelector('.rd-table tbody');
      if (!tbody) return;
      let dragId = '';
      tbody.querySelectorAll('.rd-drag-handle').forEach(handle => {
        handle.addEventListener('dragstart', event => {
          const tr = handle.closest('tr[data-seg]');
          dragId = tr ? tr.dataset.seg : '';
          if (tr) tr.classList.add('rd-dragging');
          if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragId); }
        });
        handle.addEventListener('dragend', () => {
          const tr = handle.closest('tr[data-seg]');
          if (tr) tr.classList.remove('rd-dragging');
        });
      });
      tbody.addEventListener('dragover', event => {
        if (!dragId) return;
        event.preventDefault();
        const tr = event.target.closest('tr[data-seg]');
        const dragRow = tbody.querySelector('tr[data-seg="' + dragId + '"]');
        if (!tr || !dragRow || tr === dragRow) return;
        const rect = tr.getBoundingClientRect();
        const before = (event.clientY - rect.top) < rect.height / 2;
        tbody.insertBefore(dragRow, before ? tr : tr.nextSibling);
      });
      tbody.addEventListener('drop', event => {
        event.preventDefault();
        if (dragId) {
          const ids = Array.from(container.querySelectorAll('.rd-table tbody tr[data-seg]')).map(tr => tr.dataset.seg);
          reorderAndSave(ids, dragId);
        }
        dragId = '';
      });
    }

    // 鍵盤／觸控可用的順序調整：跟拖曳共用同一套「取新鄰居中間值」寫入邏輯。
    function moveSegment(segmentId, dir) {
      const ids = state.data.segments.map(s => s.segment_id);
      const index = ids.indexOf(segmentId);
      const swapWith = dir === 'up' ? index - 1 : index + 1;
      if (index < 0 || swapWith < 0 || swapWith >= ids.length) return;
      const next = ids.slice();
      next[index] = ids[swapWith];
      next[swapWith] = ids[index];
      reorderAndSave(next, segmentId);
    }

    function reorderAndSave(ids, movedId) {
      const byId = new Map(state.data.segments.map(s => [s.segment_id, s]));
      const seg = byId.get(movedId);
      const index = ids.indexOf(movedId);
      if (!seg || index < 0) return;
      const prev = index > 0 ? byId.get(ids[index - 1]) : null;
      const next = index < ids.length - 1 ? byId.get(ids[index + 1]) : null;
      const prevOrder = prev ? prev.order : (next ? next.order - 20 : 0);
      const nextOrder = next ? next.order : (prev ? prev.order + 20 : 20);
      state.data.segments = ids.map(id => byId.get(id));
      write({ action: 'save_rundown_segment', segment_id: seg.segment_id, 節目內容: seg.title, duration_min: seg.duration_min,
        錨定時間: seg.anchor_time, 順序: (prevOrder + nextOrder) / 2, 階段: seg.stage, 備註: seg.note,
        prize_ids: (seg.prize_ids || []).join(',') }, '順序已更新');
    }

    function bindDragAssign() {
      let dragging = '';
      container.querySelectorAll('.rd-person[draggable="true"]').forEach(chip => {
        chip.addEventListener('dragstart', e => {
          dragging = chip.dataset.person;
          if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', dragging); }
        });
        // 觸控 / 點擊備援：點人 → 點角色
        chip.addEventListener('click', e => {
          if (e.target.closest('.rd-chip-x')) return;
          container.querySelectorAll('.rd-person.rd-picked').forEach(el => el.classList.remove('rd-picked'));
          chip.classList.add('rd-picked');
          state._picked = chip.dataset.person;
        });
      });
      container.querySelectorAll('.rd-drop').forEach(zone => {
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('rd-drop-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('rd-drop-over'));
        zone.addEventListener('drop', e => {
          e.preventDefault();
          zone.classList.remove('rd-drop-over');
          const person = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || dragging;
          if (person) assign(zone.dataset.role, person);
        });
        zone.addEventListener('click', () => {
          if (state._picked) { assign(zone.dataset.role, state._picked); state._picked = ''; }
        });
      });
    }

    function assign(role, person) {
      if (!role || !person) return;
      const exists = state.data.assignments.some(a => a.role === role && a.person === person);
      if (exists) { setMessage(person + ' 已在「' + role + '」', false); render(); return; }
      write({ action: 'save_rundown_assignment', 角色: role, 人員姓名: person }, person + ' → ' + role);
    }

    return { render, load, state };
  }

  const rundown = Object.freeze({
    async mount(container, context) {
      const controller = createController(container, context || {});
      controller.render();
      await controller.load('backend');
    }
  });

  return { rundown, createController };
});
