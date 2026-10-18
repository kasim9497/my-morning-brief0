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
  undoTaskAction,
  summarizeTasks,
  getPostponeOptions,
} from './taskEngine.js';
import { renderTaskIcon } from './taskIcons.js';
import { saveTaskSnapshot } from './sleepReminder.js';
import { switchTab } from './tabs.js';

// 用過一次「⋯」選單就不再顯示那行說明。不是使用者紀錄，所以用 chenxu. 開頭
const MENU_HINT_KEY = 'chenxu.hint.taskMenuUsed';

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 「⋯」選單裡「今天不做」那一項的值（走 skipTask，不是延後），跟延後選項放在同一個 select
const SKIP_VALUE = '__skip';
const UNDO_VALUE = '__undo';

const ICON_CHECK = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="5,12.5 10,17.5 19,7"/></svg>';

const shortDate = (dateStr) => `${Number(dateStr.slice(5, 7))}月${Number(dateStr.slice(8, 10))}日`;

// 「追劇：至少看完一集」→ 名稱「追劇」＋小字「至少看完一集」。手機上一行只放得下七八個字，
// 整句擠在一起會斷在詞的中間。夾在數字中間的半形冒號是時間（「23:00 關手機」），不拆
function labelHtml(label) {
  const match = /^([^：:]{1,8}?)(?:：|(?<!\d):(?!\d))\s*(.+)$/.exec(label || '');
  if (!match) return escapeHtml(label);
  return `${escapeHtml(match[1])}<small class="task-detail">${escapeHtml(match[2])}</small>`;
}

/** 跳過或延後的那一列要寫清楚去了哪裡，不然看不出這件事還在不在 */
function statusText(t) {
  if (t.status === 'postponed') return t.movedTo ? `已延到 ${shortDate(t.movedTo)}` : '已延後';
  if (t.status === 'skipped') return t.skippedWeek ? '這週不做' : '今天不做';
  return '';
}

/**
 * 把某一天的任務清單畫進 container，並綁好打勾/跳過/延後的事件。
 * summaryLabel：清單上方那行文字要怎麼稱呼這一天（例如「今天」「9/20」）
 */
export function renderTaskListInto(container, dateStr, summaryLabel = '今天', onChange = null) {
  if (!container) return;

  const tasks = getTasksForDate(dateStr);
  const summary = summarizeTasks(tasks);
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
        ? `<span class="task-status-tag">${statusText(t)}</span>`
        : '';
      const name = escapeHtml(t.label);
      // 處理過的列只留「復原」；不能復原的（延過去那筆已經做完了）就沒有選單。
      // 做完的也沒有選單：要改成延後或不做，先把勾取消
      const menuHtml = isInactive
        ? `<option value="${UNDO_VALUE}">復原</option>`
        : `<option value="${SKIP_VALUE}">今天不做</option>${optionsHtml}`;

      return `
        <div class="${rowClass}" data-instance="${t.instanceId}">
          <button class="task-check" data-action="toggle" data-instance="${t.instanceId}" ${isInactive ? 'disabled' : ''} aria-pressed="${isDone}" aria-label="${name}：${isDone ? '已完成' : '還沒做'}">
            ${isDone ? ICON_CHECK : ''}
          </button>
          <div class="task-label">
            ${renderTaskIcon(t.icon, t.tint)}
            <span class="task-text">${labelHtml(t.label)}</span>
            ${carriedTag}
            ${statusTag}
          </div>
          <select class="task-postpone-select" data-instance="${t.instanceId}" aria-label="${name}：${isInactive ? '復原' : '延後或不做'}" ${isDone || (isInactive && !t.canUndo) ? 'disabled' : ''}>
            <option value="">⋯</option>
            ${menuHtml}
          </select>
        </div>
      `;
    })
    .join('');

  // summaryLabel 給 null：不畫摘要那一行（今日頁把它放到標題區了）
  const summaryHtml = summaryLabel === null
    ? ''
    : `<div class="task-summary">${escapeHtml(summaryLabel)}完成 ${summary.done} / ${summary.total} 項${summary.setAside ? `，另有 ${summary.setAside} 項延後或不做` : ''}</div>`;
  const showHint = !localStorage.getItem(MENU_HINT_KEY) && tasks.some((t) => t.status === 'pending');
  const hintHtml = showHint ? '<p class="list-footnote">每一項右邊的 ⋯ 可以延後幾天，或今天不做。用過一次這行就會消失。</p>' : '';
  container.innerHTML = tasks.length
    ? `${summaryHtml}<div class="task-list">${rowsHtml}</div>${hintHtml}`
    : `<div class="countdown-empty">這一天沒有排任何作息</div>
       <button type="button" class="section-action task-empty-action" data-action="go-routines">去設定每週安排</button>`;

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

  // 沒有任務時：每週安排在設定頁最上面
  container.querySelector('[data-action="go-routines"]')?.addEventListener('click', () => switchTab('settings'));

  container.querySelectorAll('.task-postpone-select').forEach((select) => {
    select.addEventListener('change', () => {
      const option = select.value;
      if (!option) return;
      localStorage.setItem(MENU_HINT_KEY, '1');
      if (option === UNDO_VALUE) {
        undoTaskAction(dateStr, select.dataset.instance);
      } else if (option === SKIP_VALUE) {
        skipTask(dateStr, select.dataset.instance);
      } else {
        postponeTask(dateStr, select.dataset.instance, option);
      }
      rerender();
    });
  });
}

/**
 * 「今日」頁專用的進入點。完成數不放在卡片裡，放在大標題下面那一行日期後面：
 * 「10月8日 星期四 · 還剩 3 項」。這是打開 App 第一眼要看到的東西。
 */
export function renderTaskList() {
  const container = document.getElementById('tasklist-widget-content');
  renderTaskListInto(container, getTodayStr(), null, renderTaskList);
  // 待辦的通知要用的清單，跟著畫面一起更新
  saveTaskSnapshot().catch(() => {});

  const subtitle = document.getElementById('header-date');
  if (!subtitle) return;
  const now = new Date();
  const dateText = `${now.getMonth() + 1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]}`;
  const { total, remaining } = summarizeTasks(getTasksForDate(getTodayStr()));
  const allDone = total > 0 && remaining === 0;
  subtitle.textContent = total === 0 ? dateText : `${dateText} · ${allDone ? '今天都做完了' : `還剩 ${remaining} 項`}`;
  subtitle.classList.toggle('is-all-done', allDone);
}
