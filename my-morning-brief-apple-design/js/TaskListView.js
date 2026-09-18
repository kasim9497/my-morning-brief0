/**
 * 任務清單渲染（可用於任何一天，不限今天）
 * 資料/狀態邏輯都在 taskEngine.js，這裡只負責畫面跟事件綁定
 */

import {
  getTasksForDate,
  getTodayStr,
  toggleDone,
  skipTask,
  postponeTask,
  getPostponeOptions,
} from './taskEngine.js';

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const STATUS_LABEL = {
  pending: '',
  done: '已完成',
  postponed: '已延後',
  skipped: '已跳過',
};

/**
 * 把某一天的任務清單畫進 container，並綁好打勾/跳過/延後的事件。
 * summaryLabel：清單上方那行文字要怎麼稱呼這一天（例如「今天」「9/20」）
 */
export function renderTaskListInto(container, dateStr, summaryLabel = '今天', onChange = null) {
  if (!container) return;

  const tasks = getTasksForDate(dateStr);
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const optionsHtml = getPostponeOptions()
    .map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`)
    .join('');

  const rowsHtml = tasks
    .map((t) => {
      const isDone = t.status === 'done';
      const isInactive = t.status === 'postponed' || t.status === 'skipped';
      const rowClass = ['task-row', isDone ? 'is-done' : '', isInactive ? 'is-inactive' : '']
        .filter(Boolean)
        .join(' ');

      const carriedTag = t.carriedFrom
        ? `<span class="task-carried">延自 ${escapeHtml(t.carriedFrom)}</span>`
        : '';
      const statusTag = isInactive
        ? `<span class="task-status-tag">${STATUS_LABEL[t.status]}</span>`
        : '';

      return `
        <div class="${rowClass}" data-instance="${t.instanceId}">
          <button class="task-check" data-action="toggle" data-instance="${t.instanceId}" ${isInactive ? 'disabled' : ''} aria-label="切換完成狀態">
            ${isDone ? '✓' : ''}
          </button>
          <div class="task-label">
            <span class="task-icon">${t.icon}</span>
            <span class="task-text">${escapeHtml(t.label)}</span>
            ${carriedTag}
            ${statusTag}
          </div>
          <div class="task-actions">
            <button class="task-skip-btn" data-action="skip" data-instance="${t.instanceId}" ${isInactive ? 'disabled' : ''}>跳過</button>
            <select class="task-postpone-select" data-instance="${t.instanceId}" ${isInactive ? 'disabled' : ''}>
              <option value="">延後…</option>
              ${optionsHtml}
            </select>
          </div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="task-summary">${escapeHtml(summaryLabel)}完成 ${doneCount} / ${tasks.length} 項</div>
    <div class="task-list">${rowsHtml}</div>
  `;

  const rerender = () => {
    if (onChange) {
      onChange();
    } else {
      renderTaskListInto(container, dateStr, summaryLabel, onChange);
    }
  };

  container.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleDone(dateStr, btn.dataset.instance);
      rerender();
    });
  });

  container.querySelectorAll('[data-action="skip"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      skipTask(dateStr, btn.dataset.instance);
      rerender();
    });
  });

  container.querySelectorAll('.task-postpone-select').forEach((select) => {
    select.addEventListener('change', () => {
      const option = select.value;
      if (!option) return;
      postponeTask(dateStr, select.dataset.instance, option);
      rerender();
    });
  });
}

/** 「今日」頁那張卡片專用的進入點 */
export function renderTaskList() {
  const container = document.getElementById('tasklist-widget-content');
  renderTaskListInto(container, getTodayStr(), '今天');
}
