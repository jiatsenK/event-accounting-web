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

  // 僅接受計算層的鐘面格式；異常時間不直接 String() 到畫面。
  function timeText(value) {
    const clock = '(?:(?:翌|前日|翌日\\+\\d+) )?(?:[01]\\d|2[0-3]):[0-5]\\d';
    return typeof value === 'string' && new RegExp('^' + clock + '(?:–' + clock + ')?$').test(value) ? value : '';
  }

  function clockText(value) {
    return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : '';
  }

  const MODES = [
    { id: 'edit', label: '編輯流程' },
    { id: 'assign', label: '排人' },
    { id: 'print', label: '列印版本' }
  ];

  const QUICK_SEGMENTS = [
    ['歌手演唱', 15, true], ['抽獎', 10, true], ['主管致詞', 5],
    ['團體合照', 5], ['員工表揚', 10], ['自訂…', 5]
  ];
  function chineseNumber(n) {
    const digits = '零一二三四五六七八九';
    if (n < 10) return digits[n];
    if (n < 100) return (n < 20 ? '' : digits[Math.floor(n / 10)]) + '十' + (n % 10 ? digits[n % 10] : '');
    return String(n).split('').map(d => digits[Number(d)]).join('');
  }
  function quickSegment(segments, index) {
    const [name, duration, numbered] = QUICK_SEGMENTS[index] || QUICK_SEGMENTS[5];
    const base = s => String(s.title || s['節目內容'] || '').replace(/[（(].*$/, '').trim();
    const count = segments.filter(s => base(s) === name).length + 1;
    return { action: 'save_rundown_segment', 節目內容: name === '自訂…' ? '新時段' : name + (numbered ? '（' + chineseNumber(count) + '）' : ''),
      duration_min: duration, 順序: Math.max(0, ...segments.map(s => s.order || 0)) + 10, 階段: '正式' };
  }
  const PRIZE_KEYS = { 獎別: 'tier', 獎金用途: 'use', 名額: 'count', 單筆金額: 'amount', 頒獎人: 'presenter', 狀態: 'status', 備註: 'note' };

  // ===========================================================================

  function createController(container, context) {
    const state = {
      activityId: String(context && context.activityId || ''),
      data: core().normalize({}),
      source: 'empty', // 'backend' | 'demo' | 'empty'
      mode: 'edit',
      taskView: 'segment',
      selectedRole: '',
      expandedSegments: new Set(),
      taskDraft: null,
      printVersion: 'control',
      templateId: null,    // 目前預覽／要帶入的範本
      busy: false,
      dirty: false,
      savedData: null,
      revision: 0,
      loadId: 0,
      staff: [],
      staffError: false,
      newPrizeSegment: '',
      message: '',
      error: false
    };
    state.templateId = (core().templates()[0] || {}).id || null;
    state.importTemplateId = state.templateId;

    function setMessage(message, error) {
      state.message = message || '';
      state.error = Boolean(error);
    }

    function rememberSaved() {
      state.savedData = JSON.parse(JSON.stringify(state.data));
      if (planning().cacheRundown) planning().cacheRundown(state.activityId, state.data);
    }

    async function load(source) {
      if (state.busy) return;
      if (state.dirty) { setMessage('尚有未儲存變更，請先儲存或取消變更。', true); renderStatusOnly(); return; }
      const loadId = ++state.loadId;
      const revision = state.revision;
      const cached = source !== 'demo' && planning().getCachedRundown && planning().getCachedRundown(state.activityId);
      if (cached) {
        state.data = core().normalize(cached);
        state.source = 'backend';
        state.savedData = JSON.parse(JSON.stringify(state.data));
        setMessage('已顯示上次資料，背景更新中…', false);
      }
      state.busy = !cached;
      render();
      if (source === 'demo') {
        const tpl = core().template(state.templateId);
        state.templateId = tpl.id; state.data = tpl; state.source = 'demo';
        setMessage('範例流程「' + tpl.label + '」（唯讀）。按「帶入到目前活動」寫進實際活動即可編輯。', false);
        state.busy = false; render(); return;
      }
      // 員工建議不阻擋流程表出現，也不因較晚回覆重繪正在編輯的欄位。
      const staff = planning().apiRead ? planning().apiRead('staff_directory') : Promise.resolve({ staff: [] });
      staff.then(result => {
        if (loadId !== state.loadId) return;
        state.staff = result.staff || []; state.staffError = false;
        if (root.PrizeViews) root.PrizeViews.attachStaffSuggestions(container, state.staff);
      }).catch(() => { if (loadId === state.loadId) state.staffError = true; });
      try {
        const raw = await planning().fetchRundown(state.activityId, { cache: false });
        if (loadId !== state.loadId || revision !== state.revision || state.dirty) return;
        state.data = core().normalize(raw); state.source = 'backend';
        rememberSaved();
        const empty = !state.data.segments.length && !state.data.roles.length;
        setMessage(empty ? '這場活動還沒有流程表內容，可開始編輯或帶入範例流程。' : '', false);
      } catch (err) {
        if (loadId !== state.loadId || revision !== state.revision || state.dirty) return;
        if (!cached) state.source = 'empty';
        setMessage((err.message || '讀取失敗') + (cached ? '；目前顯示上次資料。' : '；可先看範例流程。'), true);
      } finally {
        if (loadId === state.loadId && revision === state.revision && !state.dirty) { state.busy = false; render(); }
      }
    }

    // 樂觀更新：把這次寫入先套進本機資料，畫面立即反應，再送後端；失敗才重讀還原。
    function applyLocal(fields) {
      const d = state.data;
      const del = String(fields._delete || '') === '1';
      switch (fields.action) {
        case 'save_prize': {
          const p = d.prizes.find(p => p.prize_id === fields.prize_id);
          if (p) Object.keys(PRIZE_KEYS).forEach(k => { if (fields[k] != null) p[PRIZE_KEYS[k]] = fields[k]; });
          break;
        }
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

    // 成功採用回覆的 ID 與已送出的欄位，不為確認寫入而重讀整份表。
    function applySaved(fields, result) {
      const f = Object.assign({}, fields);
      const d = state.data;
      const del = String(f._delete || '') === '1';
      const addNormalized = (key, record) => core().normalize({ [key]: [record] })[key][0];
      if (!del && f.action === 'save_rundown_segment') {
        f.segment_id = f.segment_id || result.segment_id;
        if (!f.segment_id) throw new Error('未取得新增時段 ID');
        let seg = d.segments.find(x => x.segment_id === f.segment_id);
        if (!seg) { seg = addNormalized('segments', f); d.segments.push(seg); }
        if (f.prize_ids != null) seg.prize_ids = String(f.prize_ids).split(',').filter(Boolean);
        if (f['備註'] != null) seg.note = f['備註'];
      } else if (!del && f.action === 'save_rundown_task') {
        f.task_id = f.task_id || result.task_id;
        if (!f.task_id) throw new Error('未取得新增任務 ID');
        d.tasks = d.tasks.filter(x => x.task_id !== f.task_id).concat(addNormalized('tasks', f));
      } else if (!del && f.action === 'save_rundown_role') {
        d.roles = d.roles.filter(x => x.role !== f['角色']).concat(addNormalized('roles', f));
      } else if (!del && f.action === 'save_rundown_crew') {
        d.crew = d.crew.filter(x => x.name !== f['姓名']).concat(addNormalized('crew', f));
      } else if (f.action === 'save_prize') {
        f.prize_id = f.prize_id || result.prize_id;
        if (!f.prize_id) throw new Error('未取得獎項 ID');
        if (del) d.prizes = d.prizes.filter(x => x.prize_id !== f.prize_id);
        else if (!d.prizes.some(x => x.prize_id === f.prize_id)) d.prizes.push(addNormalized('prizes', f));
      }
      applyLocal(f);
      d.segments.sort((a, b) => a.order - b.order);
    }

    async function write(fields, okMessage, options) {
      const opts = options || {};
      if (state.busy) return false;
      if (state.dirty) { setMessage('請先儲存或取消時段變更，再執行其他寫入。', true); renderStatusOnly(); return false; }
      const previous = JSON.parse(JSON.stringify(state.data));
      state.revision++;
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
        const result = await planning().apiWrite(
          Object.assign({ activity_id: state.activityId }, fields),
          { receipt: true }
        );
        if (fields.action === 'import_rundown') state.data = core().normalize(await planning().fetchRundown(state.activityId));
        else applySaved(fields, result || {});
        rememberSaved();
        state.source = 'backend';
        state.busy = false;
        setMessage(okMessage || '已儲存', false);
        paint();
        return true;
      } catch (err) {
        setMessage((err && err.message) || '寫入失敗', true);
        state.data = previous;
        try { state.data = core().normalize(await planning().fetchRundown(state.activityId)); rememberSaved(); }
        catch (e) { setMessage((err.message || '寫入失敗') + '；無法重讀，目前顯示操作前資料，請重新讀取確認。', true); }
        state.busy = false;
        render();
        return false;
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
      lockControls();
      const el = container.querySelector('.rd-status');
      if (!el) { render(); return; }
      const save = container.querySelector('[data-action="save-draft"]');
      const cancel = container.querySelector('[data-action="cancel-draft"]');
      if (save) save.disabled = state.busy || !state.dirty;
      if (cancel) cancel.disabled = state.busy || !state.dirty;
      el.textContent = state.message;
      el.classList.toggle('error', state.error);
      el.classList.toggle('rd-hidden', !state.message);
    }

    function lockControls() {
      container.querySelectorAll('button, input, select, textarea').forEach(el => {
        if (state.busy && el.dataset.writeDisabled == null) {
          el.dataset.writeDisabled = el.disabled ? '1' : '0';
          el.disabled = true;
        } else if (!state.busy && el.dataset.writeDisabled != null) {
          el.disabled = el.dataset.writeDisabled === '1';
          delete el.dataset.writeDisabled;
        }
      });
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
      if (state.busy) container.querySelectorAll('button, input, select').forEach(el => { el.disabled = true; });
      if (root.PrizeViews) root.PrizeViews.attachStaffSuggestions(container, state.staff);
      lockControls();
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
        (editable ? '<button type="button" class="rd-primary" data-action="save-draft"' + (!state.dirty || state.busy ? ' disabled' : '') + '>儲存</button>' +
          '<button type="button" data-action="cancel-draft"' + (!state.dirty || state.busy ? ' disabled' : '') + '>取消變更</button>' : '') +
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
      const prizeIndex = core().prizeIndexOf(d);

      const readOnly = state.source === 'demo';
      const dis = readOnly ? ' disabled' : '';
      // 段落只存 duration／錨定時間；牆上時間在這裡即時算出來唯讀顯示。
      const timed = core().calculateTimeline(d.segments, d.config);

      // 獎項：直接列出可用獎項當可點的標籤，點一下就連結／取消連結，不用打 prize_id。
      function prizeCellHtml(seg, readOnly) {
        if (readOnly) {
          return core().segmentPrizes(seg, prizeIndex).map(p => '<span class="rd-chip">' + esc(core().prizeLabel(p)) + '</span>').join('');
        }
        const linked = new Set(seg.prize_ids || []);
        return d.prizes.map(p => {
          const active = linked.has(p.prize_id);
          return '<button type="button" class="rd-prize-toggle' + (active ? ' rd-prize-toggle-active' : '') +
            '" data-action="toggle-prize" data-prize="' + esc(p.prize_id) + '" title="' + esc(core().prizeLabel(p)) + '">' + esc(p.tier || p.prize_id) + '</button>';
        }).join('') + '<button type="button" class="rd-prize-toggle" data-action="new-prize">＋ 獎項</button>' +
          (state.newPrizeSegment === seg.segment_id ? '<form data-new-prize><label>獎別<input name="獎別" required></label><label>名額<input name="名額" type="number" min="0" step="1"></label><label>單筆金額<input name="單筆金額" type="number" min="0" step="0.01"></label><label>頒獎人<input name="頒獎人" list="rd-staff"></label><button type="submit">新增並連結</button><button type="button" data-action="cancel-prize">取消</button></form>' : '');
      }

      function prizeField(seg, field, key) {
        const prizes = core().segmentPrizes(seg, prizeIndex);
        if (!prizes.length) return '—';
        return prizes.map(p => '<label class="rd-prize-field"><span>' + esc(p.tier) + '</span><input class="rd-in" data-prize-id="' + esc(p.prize_id) + '" data-prize-field="' + field + '" aria-label="' + esc(p.tier + ' ' + field) + '" value="' + esc(p[key]) + '"' +
          (key === 'presenter' ? ' list="rd-staff"' : key === 'tier' ? '' : ' type="number" min="0" step="' + (key === 'count' ? '1' : '0.01') + '"') + dis + '></label>').join('');
      }

      // 順序只用拖曳調（不做上下箭頭）；順序值用隱藏欄位跟著列一起送出，
      // 錨定時間畫面上不開放編輯，但既有值仍要跟著列一起送出，不能被其他欄位的存檔洗掉。
      const segmentRows = timed.map(seg =>
        '<article data-seg="' + esc(seg.segment_id) + '" class="rd-segment-card ' + (seg.stage === '彩排' ? 'rd-stage-rehearsal' : 'rd-stage-official') + '">' +
          '<div class="rd-segment-main">' + (readOnly ? '' : '<button type="button" class="rd-drag-handle" draggable="true" aria-pressed="false" aria-label="選取時段，再點目標把手移到其前方" title="拖曳，或先點此處再點目標把手">⠿</button>') +
          '<input type="hidden" data-field="順序" value="' + esc(seg.order) + '">' +
          '<input type="hidden" data-field="階段" value="' + esc(seg.stage) + '">' +
          '<input type="hidden" data-field="prize_ids" value="' + esc((seg.prize_ids || []).join(',')) + '">' +
          '<input type="hidden" data-field="備註" value="' + esc(seg.note) + '">' +
          '<input type="hidden" data-field="錨定時間" value="' + esc(seg.anchor_time) + '">' +
          '<span class="rd-muted">' + esc(seg.stage) + '</span><span class="rd-time-readout">' + esc(timeText(seg.time)) + '</span>' +
          '<label class="rd-segment-title">節目<input class="rd-in" data-field="節目內容" value="' + esc(seg.title) + '"' + dis + '></label>' +
          '<label>長度（分）<input class="rd-in rd-in-num rd-in-duration" data-field="duration_min" value="' + esc(seg.duration_min) + '" inputmode="numeric"' + dis + '></label>' +
          (readOnly ? '' : '<button type="button" class="rd-icon rd-danger" data-action="del-seg" aria-label="刪除時段">✕</button>') + '</div>' +
          '<div class="rd-prize-cell">' + prizeCellHtml(seg, readOnly) + '</div>' +
          (seg.prize_ids.length ? '<div class="rd-prize-fields">' + [['獎別', 'tier'], ['頒獎人', 'presenter'], ['名額', 'count'], ['單筆金額', 'amount']].map(([field, key]) => '<div>' + field + prizeField(seg, field, key) + '</div>').join('') + '</div>' : '') +
          '<details data-task-details' + (state.expandedSegments.has(seg.segment_id) ? ' open' : '') + '><summary>任務（' + d.tasks.filter(t => t.segment_id === seg.segment_id).length + '）</summary>' +
          taskContent(seg.segment_id) + '</details></article>').join('');

      return '<div class="rd-edit">' +
        '<datalist id="rd-staff">' + state.staff.map(p => '<option value="' + esc(p.name) + '">' + esc([p.department, p.title].filter(Boolean).join('／')) + '</option>').join('') + '</datalist>' +
        (state.staffError ? '<p class="rd-hint">員工名冊暫時無法讀取，請重新讀取後使用姓名建議。</p>' : '') +
        importPanel() +
        configPanel() +
        '<section class="rd-panel"><div class="rd-panel-head"><h3>時段與任務</h3>' +
          '<span class="rd-muted">' +
          (readOnly ? '' : '拖曳最左邊調整順序，或先點把手再點目標把手移到其前方；改「持續」會自動存檔，「時間」是算出來的，不能直接改') + '</span></div>' +
          (readOnly ? '' : '<div class="rd-quick-segments">' + QUICK_SEGMENTS.map((p, i) => '<button type="button" data-quick-segment="' + i + '">' + p[0] + (i === 5 ? '' : '・' + p[1] + '分') + '</button>').join('') + '</div>') +
          '<nav class="rd-task-views" aria-label="任務檢視">' +
            [['segment', '依時段'], ['role', '依角色']].map(([id, label]) => '<button type="button" data-task-view="' + id + '" aria-pressed="' + (state.taskView === id) + '">' + label + '</button>').join('') + '</nav>' +
          (state.taskView === 'role' ? roleTimeline(timed) : '<div class="rd-segments">' + (segmentRows || '<p class="rd-empty">尚無時段</p>') + '</div>') +
        '</section>' +
        '<section class="rd-panel"><div class="rd-panel-head"><h3>角色</h3><span class="rd-muted">從主流程拆出的固定角色，人員之後再排</span></div>' +
          '<div class="rd-role-chips">' + d.roles.map(r =>
            '<span class="rd-chip rd-chip-role" data-role="' + esc(r.role) + '">' + esc(r.role) +
            (readOnly ? '' : '<button type="button" class="rd-chip-x" data-action="del-role" title="刪除">✕</button>') + '</span>').join('') +
          (readOnly ? '' : '<span class="rd-add-inline"><input data-add="角色" placeholder="新角色（音控、報到…）"><button type="button" data-action="add-role">加</button></span>') +
          '</div>' +
        '</section>' +
      '</div>';
    }

    function taskRoles() {
      return [...new Set(state.data.roles.map(r => r.role).concat(state.data.tasks.map(t => t.role)))];
    }

    function taskContent(segmentId, role) {
      const readOnly = state.source !== 'backend';
      const tasks = state.data.tasks.filter(t => t.segment_id === segmentId && (role == null || t.role === role));
      const groups = new Map();
      tasks.forEach(t => { if (!groups.has(t.role)) groups.set(t.role, []); groups.get(t.role).push(t); });
      const people = core().assigneesByRole(state.data);
      const rows = [...groups].map(([name, items]) => '<section class="rd-task-block"><h4>' + esc(name) +
        '<span class="rd-muted"> · ' + esc((people.get(name) || []).join('、') || '未排人') + '</span></h4>' +
        '<ul class="rd-task-list">' + items.map(t => '<li data-task="' + esc(t.task_id) + '"><span class="rd-task-content">' + esc(t.content) + '</span>' +
          '<span class="rd-task-aud">' + esc(t.audience) + '</span>' +
          (readOnly ? '' : '<button type="button" class="rd-icon rd-danger" data-action="del-task" aria-label="刪除任務">✕</button>') + '</li>').join('') + '</ul></section>').join('');
      const draft = state.taskDraft;
      const adding = draft && draft.segmentId === segmentId;
      const roles = taskRoles();
      return (rows || '<p class="rd-empty">尚無任務</p>') + (readOnly ? '' : adding ?
        '<form class="rd-task-add" data-task-form><label>角色<select data-new="角色">' + roles.map(r => '<option value="' + esc(r) + '"' + (r === draft.role ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></label>' +
        '<label>任務內容<input data-new="任務內容" required value="' + esc(draft.content) + '"></label>' +
        '<label>列印對象<select data-new="對象">' + core().AUDIENCES.map(a => '<option value="' + esc(a) + '"' + (a === draft.audience ? ' selected' : '') + '>' + esc(a) + '</option>').join('') + '</select></label>' +
        '<button type="submit">儲存任務</button><button type="button" data-action="cancel-task">取消</button></form>' :
        roles.length ? '<button type="button" data-action="open-task">＋ 加任務</button>' : '<p class="rd-hint">先在下方新增角色，才能新增任務。</p>');
    }

    function roleTimeline(timed) {
      const roles = taskRoles();
      if (!roles.includes(state.selectedRole)) state.selectedRole = roles[0] || '';
      const role = state.selectedRole;
      const segments = timed.filter(s => state.data.tasks.some(t => t.segment_id === s.segment_id && t.role === role));
      return '<div class="rd-role-timeline"><label>角色 <select data-role-filter>' + roles.map(r =>
        '<option value="' + esc(r) + '"' + (r === role ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></label>' +
        (segments.map(seg => '<article class="rd-segment-card" data-seg="' + esc(seg.segment_id) + '"><h4><span class="rd-time-readout">' + esc(timeText(seg.time)) + '</span> ' +
          esc(seg.stage + ' · ' + seg.title) + '</h4>' + taskContent(seg.segment_id, role) + '</article>').join('') ||
          '<p class="rd-empty">這個角色尚無任務；切到「依時段」加入任務。</p>') + '</div>';
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
          '<label>正式段開始<input class="rd-in rd-in-time" type="time" data-config="正式_基準開始" value="' + esc(clockText(c.official_start)) + '"' + dis + '></label>' +
          '<label>彩排基準<select class="rd-in" data-config="彩排_基準"' + dis + '>' +
            '<option value="接續正式"' + (fixed ? '' : ' selected') + '>接續正式（往前推）</option>' +
            '<option value="固定開始"' + (fixed ? ' selected' : '') + '>固定開始時間</option>' +
          '</select></label>' +
          (fixed
            ? '<label class="rd-config-third">彩排開始<input class="rd-in rd-in-time" type="time" data-config="彩排_固定開始" value="' + esc(clockText(c.rehearsal_start)) + '"' + dis + '></label>'
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
              '<ul>' + p.rows.map(row => '<li><span class="rd-preview-time">' + esc(timeText(row.time)) + '</span> ' + esc(row.segment) +
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
          '<tr class="rd-seg-row"><td class="rd-time">' + esc(timeText([seg.start, seg.end].filter(Boolean).join('–'))) + '</td>' +
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
          '<tr><td class="rd-time">' + esc(timeText(row.time)) + '</td><td><b>' + esc(row.segment) + '</b>（' + esc(row.role) + '）<br>' + esc(row.content) + '</td></tr>').join('') +
        '</tbody></table></div>').join('') +
        (model.idlePeople.length ? '<p class="rd-sheet-foot">尚未安排任務：' + model.idlePeople.map(esc).join('、') + '</p>' : '');
    }

    function sheetVenue(model) {
      if (!model.rows.length) return '<p class="rd-empty">沒有標記為「飯店」對象的任務。</p>';
      return '<table class="rd-sheet-table"><tbody>' + model.rows.map(row =>
        '<tr><td class="rd-time">' + esc(timeText(row.time)) + '</td><td><b>' + esc(row.segment) + '</b><ul>' +
        row.tasks.map(t => '<li>' + esc(t.content) + '</li>').join('') + '</ul></td></tr>').join('') +
        '</tbody></table>';
    }

    function sheetDesigner(model) {
      return '<table class="rd-sheet-table rd-designer"><tbody>' + model.segments.map(seg =>
        '<tr><td class="rd-time">' + esc(timeText(seg.time)) + '</td><td><div class="rd-seg-title">' + esc(seg.title) +
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

      on('[data-task-view]', 'click', event => {
        state.taskView = event.currentTarget.dataset.taskView;
        render();
      });
      on('[data-role-filter]', 'change', event => { state.selectedRole = event.currentTarget.value; render(); });
      on('[data-task-details]', 'toggle', event => {
        const el = event.currentTarget;
        if (!container.contains(el)) return;
        const id = el.closest('[data-seg]').dataset.seg;
        if (el.open) state.expandedSegments.add(id); else state.expandedSegments.delete(id);
      });
      on('[data-action="open-task"]', 'click', event => {
        const segmentId = event.currentTarget.closest('[data-seg]').dataset.seg;
        if (!state.taskDraft || state.taskDraft.segmentId !== segmentId) {
          state.taskDraft = { segmentId, role: state.taskView === 'role' ? state.selectedRole : taskRoles()[0], content: '', audience: core().AUDIENCES[0] };
        }
        state.expandedSegments.add(segmentId);
        render();
        const input = container.querySelector('[data-task-form] [data-new="任務內容"]');
        if (input) input.focus();
      });
      on('[data-action="cancel-task"]', 'click', () => { state.taskDraft = null; render(); });
      on('[data-task-form] [data-new]', 'input', event => {
        const keys = { 角色: 'role', 任務內容: 'content', 對象: 'audience' };
        if (state.taskDraft) state.taskDraft[keys[event.currentTarget.dataset.new]] = event.currentTarget.value;
      });

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
            ? '<label class="rd-config-third">彩排開始<input class="rd-in rd-in-time" type="time" data-config="彩排_固定開始" value="' + esc(clockText(state.data.config.rehearsal_start)) + '"></label>'
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
      on('[data-quick-segment]', 'click', async event => {
        if (state.busy) return;
        const beforeIds = new Set(state.data.segments.map(s => s.segment_id));
        await write(quickSegment(state.data.segments, Number(event.currentTarget.dataset.quickSegment)), '已新增時段');
        const added = state.data.segments.find(s => !beforeIds.has(s.segment_id));
        const input = added && container.querySelector('[data-seg="' + added.segment_id + '"] [data-field="節目內容"]');
        if (input) { input.focus(); input.select(); }
      });
      // 輸入即留在草稿；不重繪 input、不等待 blur，也不送後端。
      const editSegment = event => {
        if (state.busy || state.source !== 'backend') return;
        const el = event.target;
        const tr = el.closest('[data-seg]');
        const seg = state.data.segments.find(s => s.segment_id === tr.dataset.seg);
        if (!seg || !['節目內容', 'duration_min'].includes(el.dataset.field)) return;
        beginDraft();
        if (el.dataset.field === '節目內容') seg.title = el.value;
        else seg.duration_min = el.value === '' ? '' : Number(el.value);
        setMessage('尚有未儲存變更', false);
        refreshTimeReadouts(); renderStatusOnly();
      };
      on('.rd-segments [data-field]', 'input', editSegment);
      on('.rd-segments [data-field]', 'change', editSegment);
      on('[data-action="save-draft"]', 'click', saveDraft);
      on('[data-action="cancel-draft"]', 'click', () => {
        if (state.busy) return;
        state.data = JSON.parse(JSON.stringify(state.savedData || state.data));
        state.dirty = false; state.revision++;
        setMessage('已取消未儲存變更', false); render();
      });
      on('[data-action="del-seg"]', 'click', event => {
        const tr = event.target.closest('[data-seg]');
        if (!root.confirm('刪除這個時段？它的任務也會一併刪除。')) return;
        write({ action: 'save_rundown_segment', segment_id: tr.dataset.seg, _delete: '1' }, '已刪除時段');
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
      on('[data-task-form]', 'submit', async event => {
        event.preventDefault();
        if (state.busy || !event.currentTarget.reportValidity()) return;
        const form = event.currentTarget;
        const fields = { action: 'save_rundown_task', segment_id: form.closest('[data-seg]').dataset.seg };
        form.querySelectorAll('[data-new]').forEach(el => { fields[el.dataset.new] = el.value.trim(); });
        if (!fields['任務內容']) { setMessage('任務內容不可空白', true); renderStatusOnly(); return; }
        if (await write(fields, '已新增任務')) { state.taskDraft = null; render(); }
      });
      on('[data-action="del-task"]', 'click', event => {
        const li = event.target.closest('[data-task]');
        write({ action: 'save_rundown_task', task_id: li.dataset.task, _delete: '1' }, '已刪除任務');
      });

      // 獎項：點標籤直接連結／取消連結，不用打 prize_id
      on('[data-action="new-prize"]', 'click', event => {
        if (state.busy) return;
        state.newPrizeSegment = event.target.closest('article[data-seg]').dataset.seg;
        render();
      });
      on('[data-action="cancel-prize"]', 'click', () => { state.newPrizeSegment = ''; render(); });
      on('[data-new-prize]', 'submit', async event => {
        event.preventDefault();
        if (state.busy) return;
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const segmentId = form.closest('article[data-seg]').dataset.seg;
        const fields = { action: 'save_prize', 獎金用途: '抽獎' };
        form.querySelectorAll('[name]').forEach(el => { fields[el.name] = el.value.trim(); });
        const before = new Set(state.data.prizes.map(p => p.prize_id));
        if (!await write(fields, '獎項已新增，正在連結流程…', { optimistic: false })) return;
        const prize = state.data.prizes.find(p => !before.has(p.prize_id) && p.tier === fields['獎別']);
        const seg = state.data.segments.find(s => s.segment_id === segmentId);
        state.newPrizeSegment = '';
        if (!prize || !seg) { setMessage('獎項已新增；請重新讀取並點選獎項完成連結。', true); render(); return; }
        const linked = (seg.prize_ids || []).concat(prize.prize_id);
        await write({ action: 'save_rundown_segment', segment_id: seg.segment_id, 節目內容: seg.title, duration_min: seg.duration_min,
          錨定時間: seg.anchor_time, 順序: seg.order, 階段: seg.stage, 備註: seg.note, prize_ids: linked.join(',') },
          '獎項已新增並連結', { optimistic: false });
      });
      on('[data-prize-field]', 'change', event => {
        const el = event.currentTarget;
        if (!el.reportValidity()) return;
        write({ action: 'save_prize', prize_id: el.dataset.prizeId, [el.dataset.prizeField]: el.value.trim() }, '獎項已更新', { optimistic: false });
      });
      on('[data-action="toggle-prize"]', 'click', event => {
        if (state.busy) return;
        const tr = event.target.closest('article[data-seg]');
        const seg = tr && state.data.segments.find(s => s.segment_id === tr.dataset.seg);
        if (!seg) return;
        const linked = new Set(seg.prize_ids || []);
        const prizeId = event.target.dataset.prize;
        const nowActive = !linked.has(prizeId);
        if (nowActive) linked.add(prizeId); else linked.delete(prizeId);

        write({ action: 'save_rundown_segment', segment_id: seg.segment_id, 節目內容: seg.title, duration_min: seg.duration_min,
          錨定時間: seg.anchor_time, 順序: seg.order, 階段: seg.stage, 備註: seg.note, prize_ids: Array.from(linked).join(',') },
          '已更新獎項連動', { optimistic: false });
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
      const rows = Array.from(container.querySelectorAll('.rd-segments > article[data-seg]'));
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
        if (cell) cell.textContent = timeText(timeById.get(tr.dataset.seg));
      });
    }

    // 拖曳與點選共用排序；取消拖曳時重繪原順序。
    function bindSegmentDrag() {
      const tbody = container.querySelector('.rd-segments');
      if (!tbody || state.source !== 'backend' || state.busy) return;
      let dragId = '';
      let pickedId = '';
      tbody.querySelectorAll('.rd-drag-handle').forEach(handle => {
        handle.addEventListener('click', () => {
          if (state.busy) return;
          const id = handle.closest('article[data-seg]').dataset.seg;
          if (!pickedId) {
            pickedId = id;
            handle.setAttribute('aria-pressed', 'true');
            handle.classList.add('rd-picked');
            return;
          }
          if (pickedId === id) { pickedId = ''; render(); return; }
          const ids = state.data.segments.map(s => s.segment_id).filter(x => x !== pickedId);
          ids.splice(ids.indexOf(id), 0, pickedId);
          const moved = pickedId;
          pickedId = '';
          return reorderAndSave(ids, moved);
        });
        handle.addEventListener('dragstart', event => {
          if (state.busy) { event.preventDefault(); return; }
          const tr = handle.closest('article[data-seg]');
          dragId = tr ? tr.dataset.seg : '';
          if (tr) tr.classList.add('rd-dragging');
          if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragId); }
        });
        handle.addEventListener('dragend', () => {
          const tr = handle.closest('article[data-seg]');
          if (tr) tr.classList.remove('rd-dragging');
          if (dragId) { dragId = ''; render(); }
        });
      });
      tbody.addEventListener('dragover', event => {
        if (!dragId) return;
        event.preventDefault();
        const tr = event.target.closest('article[data-seg]');
        const dragRow = tbody.querySelector('article[data-seg="' + dragId + '"]');
        if (!tr || !dragRow || tr === dragRow) return;
        const rect = tr.getBoundingClientRect();
        const before = (event.clientY - rect.top) < rect.height / 2;
        tbody.insertBefore(dragRow, before ? tr : tr.nextSibling);
      });
      tbody.addEventListener('drop', event => {
        event.preventDefault();
        if (dragId) {
          const ids = Array.from(container.querySelectorAll('.rd-segments > article[data-seg]')).map(tr => tr.dataset.seg);
          const moved = dragId;
          dragId = '';
          return reorderAndSave(ids, moved);
        }
        dragId = '';
      });
    }

    function beginDraft() {
      if (!state.dirty) state.savedData = JSON.parse(JSON.stringify(state.data));
      state.dirty = true; state.revision++;
    }

    function reorderAndSave(ids, movedId) {
      if (state.busy || state.source !== 'backend') return;
      const byId = new Map(state.data.segments.map(s => [s.segment_id, s]));
      if (!byId.has(movedId) || ids.length !== byId.size || new Set(ids).size !== ids.length || ids.some(id => !byId.has(id))) return;
      if (ids.every((id, i) => id === state.data.segments[i].segment_id)) { render(); return; }
      beginDraft();
      state.data.segments = ids.map((id, i) => Object.assign({}, byId.get(id), { order: (i + 1) * 10 }));
      setMessage('順序已調整，尚未儲存', false); render();
    }

    async function saveDraft() {
      if (state.busy || !state.dirty || state.source !== 'backend') return false;
      const before = new Map(state.savedData.segments.map(s => [s.segment_id, s]));
      const edits = [];
      for (const seg of state.data.segments) {
        const old = before.get(seg.segment_id);
        if (!old || !seg.title.trim() || /^[=+@-]/.test(seg.title.trim()) || !Number.isSafeInteger(seg.duration_min) || seg.duration_min < 0) {
          setMessage('請填寫有效節目名與非負整數長度。', true); renderStatusOnly(); return false;
        }
        const edit = { segment_id: seg.segment_id };
        if (seg.title.trim() !== old.title) edit['節目內容'] = seg.title.trim();
        if (seg.duration_min !== old.duration_min) edit.duration_min = seg.duration_min;
        if (Object.keys(edit).length > 1) edits.push(edit);
      }
      const data = {};
      if (state.data.segments.some(s => s.order !== before.get(s.segment_id).order)) data.order = state.data.segments.map(s => ({ segment_id: s.segment_id, 順序: s.order }));
      if (edits.length) data.edits = edits;
      if (!Object.keys(data).length) { state.dirty = false; setMessage('沒有需要儲存的變更', false); render(); return true; }
      state.busy = true; state.revision++;
      setMessage('儲存中…', false); render();
      try {
        await planning().apiWrite({ action: 'save_rundown_order', activity_id: state.activityId, data: JSON.stringify(data) }, { receipt: true });
        state.data.segments.forEach(s => { s.title = s.title.trim(); });
        state.dirty = false; rememberSaved();
        setMessage('已儲存', false); return true;
      } catch (err) {
        state.data = JSON.parse(JSON.stringify(state.savedData));
        state.dirty = false;
        try {
          state.data = core().normalize(await planning().fetchRundown(state.activityId)); rememberSaved();
          setMessage((err.message || '儲存失敗') + '；已重讀後端資料', true);
        } catch (readError) {
          setMessage((err.message || '儲存失敗') + '；無法重讀，目前顯示上次已確認資料，請重新讀取確認。', true);
        }
        return false;
      } finally { state.busy = false; render(); }
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

  return { rundown, createController, quickSegment };
});
