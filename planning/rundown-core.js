(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RundownCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STAGES = ['彩排', '正式'];
  const AUDIENCES = ['總控', '工作人員', '飯店', '全部'];
  const CREW_AUDIENCES = ['工作人員', '全部'];
  const VENUE_AUDIENCES = ['飯店', '全部'];

  const DEMO_ACTIVITY_ID = 'yearend2025';

  // ---------------------------------------------------------------------------
  // 正規化：把後端（或示範資料）的原始物件收斂成穩定形狀
  // ---------------------------------------------------------------------------

  function str(value) {
    return value == null ? '' : String(value).trim();
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeStage(value) {
    return STAGES.indexOf(str(value)) >= 0 ? str(value) : '正式';
  }

  function normalizeAudience(value) {
    return AUDIENCES.indexOf(str(value)) >= 0 ? str(value) : '全部';
  }

  function toList(value) {
    if (Array.isArray(value)) return value.map(str).filter(Boolean);
    return str(value).split(/[,，]/).map(s => s.trim()).filter(Boolean);
  }

  function normalize(raw) {
    const data = raw || {};
    const segments = (data.segments || []).map((row, index) => ({
      segment_id: str(row.segment_id) || ('seg-' + index),
      order: num(row['順序'] != null ? row['順序'] : row.order) || 0,
      start: str(row['開始時間'] || row.start),
      end: str(row['結束時間'] || row.end),
      title: str(row['節目內容'] || row.title),
      stage: normalizeStage(row['階段'] || row.stage),
      plan: str(row['方案'] || row.plan),
      prize_ids: toList(row.prize_ids),
      note: str(row['備註'] || row.note)
    })).sort((a, b) => (a.order - b.order) || a.start.localeCompare(b.start));

    const roles = (data.roles || []).map(row => ({
      role: str(row['角色'] || row.role),
      description: str(row['說明'] || row.description)
    })).filter(row => row.role);

    const tasks = (data.tasks || []).map((row, index) => ({
      task_id: str(row.task_id) || ('task-' + index),
      segment_id: str(row.segment_id),
      role: str(row['角色'] || row.role),
      content: str(row['任務內容'] || row.content),
      audience: normalizeAudience(row['對象'] || row.audience)
    })).filter(row => row.segment_id && row.role);

    const assignments = (data.assignments || []).map(row => ({
      role: str(row['角色'] || row.role),
      person: str(row['人員姓名'] || row.person)
    })).filter(row => row.role && row.person);

    const crew = (data.crew || []).map(row => ({
      name: str(row['姓名'] || row.name),
      group: str(row['組別'] || row.group),
      note: str(row['備註'] || row.note)
    })).filter(row => row.name);

    const prizes = (data.prizes || []).map(row => ({
      prize_id: str(row.prize_id),
      tier: str(row['獎別'] || row.tier),
      use: str(row['獎金用途'] || row.use),
      count: num(row['名額'] != null ? row['名額'] : row.count),
      amount: num(row['單筆金額'] != null ? row['單筆金額'] : row.amount),
      presenter: str(row['頒獎人'] || row.presenter),
      status: str(row['狀態'] || row.status)
    })).filter(row => row.prize_id);

    return {
      activity_id: str(data.activity_id),
      segments,
      roles,
      tasks,
      assignments,
      crew,
      prizes
    };
  }

  // ---------------------------------------------------------------------------
  // 獎項圖文字串：四等獎 $5,000 × 15名／彭玉明協理
  // ---------------------------------------------------------------------------

  function money(value) {
    return Number.isFinite(value) ? '$' + value.toLocaleString('en-US') : '';
  }

  function prizeLabel(prize) {
    if (!prize) return '';
    const head = [prize.tier, money(prize.amount)].filter(Boolean).join(' ');
    const count = Number.isFinite(prize.count) ? prize.count + '名' : '';
    const body = [head, count].filter(Boolean).join(' × ');
    return prize.presenter ? body + '／' + prize.presenter : body;
  }

  function segmentPrizes(segment, prizeIndex) {
    return (segment.prize_ids || []).map(id => prizeIndex.get(id)).filter(Boolean);
  }

  function prizeIndexOf(data) {
    return new Map(data.prizes.map(prize => [prize.prize_id, prize]));
  }

  // ---------------------------------------------------------------------------
  // 指派 / 晚綁定
  // ---------------------------------------------------------------------------

  function assigneesByRole(data) {
    const map = new Map(data.roles.map(role => [role.role, []]));
    data.assignments.forEach(row => {
      if (!map.has(row.role)) map.set(row.role, []);
      map.get(row.role).push(row.person);
    });
    return map;
  }

  function unassignedRoles(data) {
    const assigned = new Set(data.assignments.map(row => row.role));
    return data.roles.filter(role => !assigned.has(role.role)).map(role => role.role);
  }

  function rolesForPerson(data, person) {
    return data.assignments.filter(row => row.person === person).map(row => row.role);
  }

  // ---------------------------------------------------------------------------
  // 四種列印版本 = 同一份 rundown 的投影
  // ---------------------------------------------------------------------------

  function tasksBySegment(data) {
    const map = new Map();
    data.tasks.forEach(task => {
      if (!map.has(task.segment_id)) map.set(task.segment_id, []);
      map.get(task.segment_id).push(task);
    });
    return map;
  }

  // 總控版：完整 rundown，彩排段／正式段分區
  function projectControl(data) {
    const prizeIndex = prizeIndexOf(data);
    const bySegment = tasksBySegment(data);
    const assignees = assigneesByRole(data);
    const stages = STAGES.map(stage => ({
      stage,
      segments: data.segments.filter(seg => seg.stage === stage).map(seg => ({
        segment_id: seg.segment_id,
        start: seg.start,
        end: seg.end,
        title: seg.title,
        plan: seg.plan,
        note: seg.note,
        prizeLabels: segmentPrizes(seg, prizeIndex).map(prizeLabel),
        tasks: (bySegment.get(seg.segment_id) || []).map(task => ({
          role: task.role,
          content: task.content,
          audience: task.audience,
          assignees: (assignees.get(task.role) || []).slice(),
          unassigned: !(assignees.get(task.role) || []).length
        }))
      }))
    })).filter(group => group.segments.length);
    return { stages, unassignedRoles: unassignedRoles(data) };
  }

  // 工作人員版：依人員分組，只列該人被指派角色、對象含工作人員的任務
  function projectCrew(data) {
    const bySegment = tasksBySegment(data);
    const segmentOrder = new Map(data.segments.map((seg, index) => [seg.segment_id, index]));
    const segmentById = new Map(data.segments.map(seg => [seg.segment_id, seg]));
    const people = data.crew.map(member => {
      const roles = rolesForPerson(data, member.name);
      const rows = [];
      roles.forEach(role => {
        data.tasks
          .filter(task => task.role === role && CREW_AUDIENCES.indexOf(task.audience) >= 0)
          .forEach(task => {
            const seg = segmentById.get(task.segment_id);
            if (!seg) return;
            rows.push({
              order: segmentOrder.get(task.segment_id) || 0,
              time: [seg.start, seg.end].filter(Boolean).join('–'),
              segment: seg.title,
              role: role,
              content: task.content
            });
          });
      });
      rows.sort((a, b) => a.order - b.order);
      return { name: member.name, group: member.group, roles, rows };
    });
    return {
      people,
      idlePeople: people.filter(person => !person.rows.length).map(person => person.name)
    };
  }

  // 飯店版：只留對象含飯店的任務
  function projectVenue(data) {
    const segmentById = new Map(data.segments.map(seg => [seg.segment_id, seg]));
    const rows = [];
    data.segments.forEach((seg, index) => {
      const tasks = data.tasks.filter(task =>
        task.segment_id === seg.segment_id && VENUE_AUDIENCES.indexOf(task.audience) >= 0
      );
      if (!tasks.length) return;
      rows.push({
        order: index,
        time: [seg.start, seg.end].filter(Boolean).join('–'),
        segment: seg.title,
        tasks: tasks.map(task => ({ role: task.role, content: task.content }))
      });
    });
    void segmentById;
    return { rows };
  }

  // 設計師（圖文）版：segment 時間軸 + 獎項字串 + 頒獎人，不含任務
  function projectDesigner(data) {
    const prizeIndex = prizeIndexOf(data);
    return {
      segments: data.segments
        .filter(seg => seg.stage === '正式')
        .map(seg => {
          const prizes = segmentPrizes(seg, prizeIndex);
          return {
            time: [seg.start, seg.end].filter(Boolean).join('–'),
            title: seg.title,
            plan: seg.plan,
            prizeLabels: prizes.map(prizeLabel),
            presenters: prizes.map(prize => prize.presenter).filter(Boolean)
          };
        })
    };
  }

  const VERSIONS = [
    { id: 'control', label: '總控版', project: projectControl },
    { id: 'crew', label: '工作人員版', project: projectCrew },
    { id: 'venue', label: '飯店版', project: projectVenue },
    { id: 'designer', label: '設計師（圖文）版', project: projectDesigner }
  ];

  function project(versionId, data) {
    const version = VERSIONS.find(item => item.id === versionId) || VERSIONS[0];
    return version.project(data);
  }

  // ---------------------------------------------------------------------------
  // 示範資料：2025 忘年會（供尚未接後端時「看看」四種版本）
  // ---------------------------------------------------------------------------

  function demoRundown() {
    return normalize({
      activity_id: DEMO_ACTIVITY_ID,
      segments: [
        { segment_id: 'r1', 順序: 1, 開始時間: '15:00', 結束時間: '15:30', 節目內容: '工作人員到場、場佈', 階段: '彩排', 備註: '報到區、酒水區、音控區定位' },
        { segment_id: 'r2', 順序: 2, 開始時間: '16:00', 結束時間: '16:30', 節目內容: '音控測試', 階段: '彩排' },
        { segment_id: 'r3', 順序: 3, 開始時間: '16:30', 結束時間: '17:00', 節目內容: '主持人彩排、合照位置確認', 階段: '彩排' },
        { segment_id: 'r4', 順序: 4, 開始時間: '17:00', 結束時間: '17:30', 節目內容: '歌手彩排、工作人員就位', 階段: '彩排' },
        { segment_id: 's1', 順序: 10, 開始時間: '17:30', 結束時間: '18:20', 節目內容: '迎賓酒會', 階段: '正式' },
        { segment_id: 's2', 順序: 11, 開始時間: '18:20', 結束時間: '18:30', 節目內容: '開放進場', 階段: '正式' },
        { segment_id: 's3', 順序: 12, 開始時間: '18:30', 結束時間: '18:35', 節目內容: '正式開場／支店長致詞', 階段: '正式' },
        { segment_id: 's4', 順序: 13, 開始時間: '18:35', 結束時間: '18:40', 節目內容: '團體合照', 階段: '正式' },
        { segment_id: 's5', 順序: 14, 開始時間: '18:40', 結束時間: '19:10', 節目內容: '歌手演唱', 階段: '正式' },
        { segment_id: 's6', 順序: 15, 開始時間: '19:10', 結束時間: '19:15', 節目內容: '資深員工表揚', 階段: '正式', 備註: '5／10／15 年' },
        { segment_id: 's7', 順序: 16, 開始時間: '19:15', 結束時間: '19:25', 節目內容: '抽獎活動 四等獎', 階段: '正式', prize_ids: ['prize-4'] },
        { segment_id: 's8', 順序: 17, 開始時間: '19:25', 結束時間: '19:30', 節目內容: '健身環頒獎', 階段: '正式', prize_ids: ['prize-game-1'] },
        { segment_id: 's9', 順序: 18, 開始時間: '19:30', 結束時間: '19:35', 節目內容: '抽獎活動 三等獎', 階段: '正式', prize_ids: ['prize-3'] },
        { segment_id: 's10', 順序: 19, 開始時間: '19:35', 結束時間: '20:00', 節目內容: '趣味遊戲 甩甩便利貼', 階段: '正式', 方案: '六輪', prize_ids: ['prize-game-2'] },
        { segment_id: 's11', 順序: 20, 開始時間: '20:00', 結束時間: '20:05', 節目內容: '抽獎活動 二等獎', 階段: '正式', prize_ids: ['prize-2'] },
        { segment_id: 's12', 順序: 21, 開始時間: '20:05', 結束時間: '20:35', 節目內容: '歌手演唱', 階段: '正式' },
        { segment_id: 's13', 順序: 22, 開始時間: '20:35', 結束時間: '20:40', 節目內容: '抽獎活動 一等獎', 階段: '正式', prize_ids: ['prize-1'] },
        { segment_id: 's14', 順序: 23, 開始時間: '20:40', 結束時間: '20:45', 節目內容: '抽獎活動 支店長獎', 階段: '正式', prize_ids: ['prize-0'] },
        { segment_id: 's15', 順序: 24, 開始時間: '20:45', 結束時間: '21:00', 節目內容: '歌手演唱', 階段: '正式' },
        { segment_id: 's16', 順序: 25, 開始時間: '21:00', 結束時間: '', 節目內容: '活動結束', 階段: '正式' }
      ],
      roles: [
        { 角色: '主持', 說明: '流程推進、唱名、頒獎引導' },
        { 角色: '音控', 說明: '音樂、燈光、麥克風、投影' },
        { 角色: '報到組', 說明: '員工與廠商報到、禮盒紅包發放' },
        { 角色: '財務組', 說明: '獎金準備、托盤、簽收、廠商付款' },
        { 角色: '抽獎組', 說明: '籤筒籤條、登記中獎' },
        { 角色: '遊戲組', 說明: '遊戲主責與協助、分組籤' },
        { 角色: '紀錄組', 說明: '得獎紀錄、主機操作' },
        { 角色: '後勤支援組', 說明: '布置品、頒獎品、酒缸、收拾' },
        { 角色: '場地聯絡', 說明: '對飯店窗口：出菜、敬酒、燈光、飲料補充' },
        { 角色: '攝影', 說明: '平面與錄影' }
      ],
      tasks: [
        { segment_id: 's1', 角色: '場地聯絡', 任務內容: '小菜、一口杯、冰塊、威士忌、啤酒上桌，酒缸放滿', 對象: '飯店' },
        { segment_id: 's1', 角色: '報到組', 任務內容: '員工／廠商報到、發禮盒（每廠商 1 份）與紅包（每人 1 包）', 對象: '工作人員' },
        { segment_id: 's1', 角色: '抽獎組', 任務內容: '籤筒／籤條管理', 對象: '工作人員' },
        { segment_id: 's1', 角色: '紀錄組', 任務內容: '主機操作、播放迎賓音樂', 對象: '工作人員' },
        { segment_id: 's3', 角色: '主持', 任務內容: '提醒 19:00 前撕下抽獎券投入抽獎箱；引導支店長上台致詞', 對象: '總控' },
        { segment_id: 's3', 角色: '場地聯絡', 任務內容: '敬酒飲料（酒 1／飲料 1）遞送上台', 對象: '飯店' },
        { segment_id: 's4', 角色: '場地聯絡', 任務內容: '團體合照後開始出菜', 對象: '飯店' },
        { segment_id: 's4', 角色: '攝影', 任務內容: '引導拍攝團體合照', 對象: '工作人員' },
        { segment_id: 's6', 角色: '財務組', 任務內容: '準備獎金與獎狀，托盤：紅包＋獎狀', 對象: '工作人員' },
        { segment_id: 's6', 角色: '後勤支援組', 任務內容: '托盤上台供支店長拿取獎狀及紅包頒發', 對象: '工作人員' },
        { segment_id: 's7', 角色: '主持', 任務內容: '請頒獎人上台、逐一抽籤唱名、主管頒發紅包、全體合影', 對象: '總控' },
        { segment_id: 's7', 角色: '抽獎組', 任務內容: '籤筒上台、抽畢下台、登記中獎', 對象: '工作人員' },
        { segment_id: 's7', 角色: '財務組', 任務內容: '空托盤 x1、紅包托盤、合照手牌', 對象: '工作人員' },
        { segment_id: 's7', 角色: '場地聯絡', 任務內容: '暫停出菜、控場燈光配合抽獎', 對象: '飯店' },
        { segment_id: 's10', 角色: '遊戲組', 任務內容: '參賽者上台、抽籤分組、第一／二組遊戲、頒獎', 對象: '工作人員' },
        { segment_id: 's10', 角色: '紀錄組', 任務內容: '登記排名', 對象: '工作人員' },
        { segment_id: 's16', 角色: '財務組', 任務內容: '攝影／餐廳付款', 對象: '工作人員' },
        { segment_id: 's16', 角色: '後勤支援組', 任務內容: '收頒獎品、收布置物、收酒缸、拍貼機退場', 對象: '工作人員' },
        { segment_id: 's16', 角色: '場地聯絡', 任務內容: '協助場地復原、確認遺留物品', 對象: '飯店' }
      ],
      assignments: [
        { 角色: '主持', 人員姓名: 'Minnie' },
        { 角色: '音控', 人員姓名: '何正貽' },
        { 角色: '報到組', 人員姓名: '江宇柔' },
        { 角色: '報到組', 人員姓名: '黃于庭' },
        { 角色: '財務組', 人員姓名: '蔡淑惠' },
        { 角色: '抽獎組', 人員姓名: '謝孟雅' },
        { 角色: '紀錄組', 人員姓名: '賴雅慧' },
        { 角色: '遊戲組', 人員姓名: '黃千容' },
        { 角色: '遊戲組', 人員姓名: '吳旻倪' },
        { 角色: '後勤支援組', 人員姓名: '洪炫佑' },
        { 角色: '後勤支援組', 人員姓名: '洪萱容' }
      ],
      crew: [
        { 姓名: 'Minnie', 組別: '主持' },
        { 姓名: '何正貽', 組別: '後勤支援組' },
        { 姓名: '江宇柔', 組別: '報到組' },
        { 姓名: '黃于庭', 組別: '報到組' },
        { 姓名: '蔡淑惠', 組別: '財務組' },
        { 姓名: '謝孟雅', 組別: '抽獎組' },
        { 姓名: '賴雅慧', 組別: '紀錄組' },
        { 姓名: '黃千容', 組別: '遊戲組' },
        { 姓名: '吳旻倪', 組別: '遊戲組' },
        { 姓名: '洪炫佑', 組別: '後勤支援組' },
        { 姓名: '洪萱容', 組別: '後勤支援組' },
        { 姓名: '柯思維', 組別: '物資組' },
        { 姓名: '柯佳岑', 組別: '' }
      ],
      prizes: [
        { prize_id: 'prize-0', 獎別: '支店長獎', 獎金用途: '抽獎', 單筆金額: 30000, 名額: 2, 頒獎人: '大倉支店長', 狀態: '規劃中' },
        { prize_id: 'prize-1', 獎別: '一等獎', 獎金用途: '抽獎', 單筆金額: 20000, 名額: 3, 頒獎人: '張副總經理', 狀態: '規劃中' },
        { prize_id: 'prize-2', 獎別: '二等獎', 獎金用途: '抽獎', 單筆金額: 10000, 名額: 10, 頒獎人: '藤井部長', 狀態: '規劃中' },
        { prize_id: 'prize-3', 獎別: '三等獎', 獎金用途: '抽獎', 單筆金額: 8000, 名額: 15, 頒獎人: '中西部長', 狀態: '規劃中' },
        { prize_id: 'prize-4', 獎別: '四等獎', 獎金用途: '抽獎', 單筆金額: 5000, 名額: 15, 頒獎人: '彭玉明協理', 狀態: '規劃中' },
        { prize_id: 'prize-game-1', 獎別: '健身環冠軍', 獎金用途: '遊戲', 單筆金額: 3000, 名額: 2, 頒獎人: '中西部長', 狀態: '規劃中' },
        { prize_id: 'prize-game-2', 獎別: '甩甩便利貼冠軍', 獎金用途: '遊戲', 單筆金額: 3000, 名額: 2, 頒獎人: '藤井部長', 狀態: '規劃中' }
      ]
    });
  }

  return {
    STAGES,
    AUDIENCES,
    VERSIONS,
    DEMO_ACTIVITY_ID,
    normalize,
    prizeLabel,
    prizeIndexOf,
    segmentPrizes,
    assigneesByRole,
    unassignedRoles,
    rolesForPerson,
    projectControl,
    projectCrew,
    projectVenue,
    projectDesigner,
    project,
    demoRundown
  };
});
