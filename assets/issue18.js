// Issue #18: replace recent-expense card with activity feedback.
document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#recentExpenseRows');
  if (!tbody) return;
  const card = tbody.closest('.card');
  if (!card) return;

  const heading = card.querySelector('.section-heading');
  const title = heading && heading.querySelector('h2');
  const subtitle = heading && heading.querySelector('.muted');
  const toggle = heading && heading.querySelector('.link-button');
  const table = tbody.closest('table');
  const thead = table && table.querySelector('thead');

  if (title) title.textContent = '本專案回饋事項';
  if (subtitle) subtitle.textContent = '執行過程發現的問題、觀察與下次改善事項';
  if (thead) thead.innerHTML = '<tr><th>日期</th><th>類型</th><th>回饋事項</th><th>狀態</th></tr>';
  if (toggle) {
    toggle.removeAttribute('data-open-tab');
    toggle.textContent = '查看全部';
  }

  let expanded = false;

  function feedbackRows() {
    return Array.isArray(state.feedbacks) ? state.feedbacks.slice() : [];
  }

  function renderFeedbacks() {
    const rows = feedbackRows();
    const visible = expanded ? rows : rows.slice(0, 5);
    tbody.innerHTML = visible.length ? visible.map(row => `
      <tr>
        <td>${escapeHtml(row.date || '—')}</td>
        <td>${escapeHtml(row.type || '其他')}</td>
        <td style="white-space:normal;min-width:260px">${escapeHtml(row.feedback || '')}${row.improvement ? `<div class="muted" style="margin-top:3px">改善：${escapeHtml(row.improvement)}</div>` : ''}</td>
        <td>${escapeHtml(row.status || '待處理')}</td>
      </tr>
    `).join('') : '<tr><td colspan="4" class="empty compact">目前尚未記錄本專案回饋</td></tr>';
    if (toggle) {
      toggle.hidden = rows.length <= 5;
      toggle.textContent = expanded ? '收合' : '查看全部';
    }
  }

  if (toggle) toggle.addEventListener('click', () => { expanded = !expanded; renderFeedbacks(); });

  const previousRender = window.render;
  if (typeof previousRender === 'function') {
    window.render = function issue18Render(data) {
      previousRender(data);
      state.feedbacks = Array.isArray(data && data.feedbacks) ? data.feedbacks : [];
      renderFeedbacks();
    };
  }

  state.feedbacks = state.feedbacks || [];
  renderFeedbacks();
});
