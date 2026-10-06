/**
 * 週曆／月曆畫面
 * 任務資料一律透過 taskEngine.js 讀寫，這裡只負責日期計算跟畫面
 */

import { getTasksForDate, getTodayStr, addDays, getWeekday } from './taskEngine.js';
import { slideIn } from './motion.js';
import { renderTaskListInto } from './TaskListView.js';

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
// 月曆的格子是從週一排到週日，表頭要用同樣的順序。
// 之前直接拿上面那組（週日開頭）當表頭，整個月的日期都對到錯的星期（差一天）
const MONTH_HEADER_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

const state = {
  mode: 'week', // 'week' | 'month'
  anchorDate: getTodayStr(), // 決定目前顯示哪一週／哪一個月
  selectedDate: getTodayStr(), // 目前展開任務詳情的那一天
};

// 月曆的「上個月／下個月」要用真的月份加減，不能用 addDays(±30)——
// 月份長度不一（28~31 天），固定加減 30 天會在短月份跳過整個月，
// 或在長月份（例如從 1 號出發）根本還停在同一個月，按了跟沒按一樣
function addMonths(dateStr, n) {
  const [y, m] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const ty = target.getFullYear();
  const tm = String(target.getMonth() + 1).padStart(2, '0');
  return `${ty}-${tm}-01`;
}

function getMonday(dateStr) {
  const wd = getWeekday(dateStr);
  const offset = wd === 0 ? -6 : 1 - wd;
  return addDays(dateStr, offset);
}

function getWeekDays(dateStr) {
  const monday = getMonday(dateStr);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function getMonthGrid(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const firstOfMonth = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const lastOfMonth = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const gridStart = getMonday(firstOfMonth);
  const lastWd = getWeekday(lastOfMonth);
  const gridEnd = addDays(lastOfMonth, lastWd === 0 ? 0 : 7 - lastWd);

  const days = [];
  let cur = gridStart;
  while (cur <= gridEnd) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return { days, currentMonth: m };
}

const ICON_PREV = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,5 8,12 15,19"/></svg>';
const ICON_NEXT = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,5 16,12 9,19"/></svg>';

/** 卡片標題：目前顯示的是哪一週（10月5日 – 11日）或哪一個月（2026年10月） */
function rangeTitle() {
  if (state.mode === 'month') {
    const [y, m] = state.anchorDate.split('-').map(Number);
    return `${y}年${m}月`;
  }
  const days = getWeekDays(state.anchorDate);
  const [, m1, d1] = days[0].split('-').map(Number);
  const [, m2, d2] = days[6].split('-').map(Number);
  return m1 === m2 ? `${m1}月${d1}日 – ${d2}日` : `${m1}月${d1}日 – ${m2}月${d2}日`;
}

/** 下面那張任務卡片上方的區塊標題 */
function detailTitle(dateStr) {
  if (dateStr === getTodayStr()) return '今天';
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}月${d}日 星期${WEEKDAY_LABELS[getWeekday(dateStr)]}`;
}

function getDayStatus(dateStr) {
  const tasks = getTasksForDate(dateStr);
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  return { total: tasks.length, done: doneCount };
}

function dotClassFor(dateStr) {
  const today = getTodayStr();
  if (dateStr > today) return 'cal-dot-future';
  const { total, done } = getDayStatus(dateStr);
  if (total === 0) return 'cal-dot-future';
  if (done === total) return 'cal-dot-done';
  if (done === 0) return 'cal-dot-none';
  return 'cal-dot-partial';
}

function renderModeSwitch() {
  return `
    <div class="routine-mode-switch">
      <button type="button" class="mode-btn ${state.mode === 'week' ? 'is-active' : ''}" data-cal-action="set-week">週</button>
      <button type="button" class="mode-btn ${state.mode === 'month' ? 'is-active' : ''}" data-cal-action="set-month">月</button>
    </div>
  `;
}

// 每一格日期下面那行小字。不要寫成「0/2」：放在日期正下方會被看成「0 月 2 日」
function progressLabel(total, done) {
  if (total === 0) return '';
  return done === total ? '完成' : `剩 ${total - done}`;
}

function renderWeekGrid() {
  const days = getWeekDays(state.anchorDate);
  const today = getTodayStr();

  const cellsHtml = days
    .map((dateStr) => {
      const { total, done } = getDayStatus(dateStr);
      const isToday = dateStr === today;
      const isSelected = dateStr === state.selectedDate;
      const cellClass = ['cal-week-cell', isToday ? 'is-today' : '', isSelected ? 'is-selected' : '']
        .filter(Boolean)
        .join(' ');
      return `
        <button class="${cellClass}" data-cal-date="${dateStr}">
          <span class="cal-week-day">${WEEKDAY_LABELS[getWeekday(dateStr)]}</span>
          <span class="cal-week-date">${Number(dateStr.split('-')[2])}</span>
          <span class="cal-week-progress ${total > 0 && done === total ? 'is-done' : ''}">${progressLabel(total, done)}</span>
        </button>
      `;
    })
    .join('');

  return `<div class="cal-week-grid">${cellsHtml}</div>`;
}

function renderMonthGrid() {
  const { days, currentMonth } = getMonthGrid(state.anchorDate);
  const today = getTodayStr();

  const cellsHtml = days
    .map((dateStr) => {
      const [, m, d] = dateStr.split('-').map(Number);
      const isToday = dateStr === today;
      const isSelected = dateStr === state.selectedDate;
      const isOutsideMonth = m !== currentMonth;
      const cellClass = [
        'cal-month-cell',
        isToday ? 'is-today' : '',
        isSelected ? 'is-selected' : '',
        isOutsideMonth ? 'is-outside' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `
        <button class="${cellClass}" data-cal-date="${dateStr}">
          <span class="cal-month-date">${d}</span>
          <span class="cal-dot ${dotClassFor(dateStr)}"></span>
        </button>
      `;
    })
    .join('');

  return `
    <div class="cal-month-weekdays">
      ${MONTH_HEADER_LABELS.map((w) => `<span>${w}</span>`).join('')}
    </div>
    <div class="cal-month-grid">${cellsHtml}</div>
  `;
}

// 按「上一週／下一週」之後，下一次重畫時格子要從哪一邊滑進來（-1 左、1 右、0 不動）
let pendingSlide = 0;

export function renderCalendarView() {
  const container = document.getElementById('view-calendar');
  if (!container) return;

  container.innerHTML = `
    <main class="container card-stack">
      ${renderModeSwitch()}

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${rangeTitle()}</h3>
          <div class="cal-nav">
            <button type="button" class="section-action card-link" data-cal-action="today">今天</button>
            <button type="button" class="icon-btn" data-cal-action="prev" aria-label="${state.mode === 'week' ? '上一週' : '上個月'}">${ICON_PREV}</button>
            <button type="button" class="icon-btn" data-cal-action="next" aria-label="${state.mode === 'week' ? '下一週' : '下個月'}">${ICON_NEXT}</button>
          </div>
        </div>
        ${state.mode === 'week' ? renderWeekGrid() : renderMonthGrid()}
      </div>

      <div class="section-head">
        <h2 class="section-title">${detailTitle(state.selectedDate)}</h2>
      </div>
      <div class="card tint-orange">
        <div id="calendar-detail-content"></div>
      </div>
    </main>
  `;

  slideIn(container.querySelector('.cal-week-grid, .cal-month-grid'), pendingSlide);
  pendingSlide = 0;

  container.querySelectorAll('[data-cal-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.calAction;
      if (action === 'set-week' || action === 'set-month') {
        state.mode = action === 'set-week' ? 'week' : 'month';
      } else if (action === 'today') {
        state.anchorDate = getTodayStr();
        state.selectedDate = getTodayStr();
      } else if (action === 'prev') {
        state.anchorDate = state.mode === 'week' ? addDays(state.anchorDate, -7) : addMonths(state.anchorDate, -1);
        pendingSlide = -1;
      } else if (action === 'next') {
        state.anchorDate = state.mode === 'week' ? addDays(state.anchorDate, 7) : addMonths(state.anchorDate, 1);
        pendingSlide = 1;
      }
      renderCalendarView();
    });
  });

  container.querySelectorAll('[data-cal-date]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dateStr = btn.dataset.calDate;
      state.selectedDate = dateStr;
      if (state.mode === 'month') {
        // 從月曆點某一天，順便切回週曆聚焦那一週，方便直接操作任務
        state.mode = 'week';
        state.anchorDate = dateStr;
      }
      renderCalendarView();
    });
  });

  const detailContainer = document.getElementById('calendar-detail-content');
  renderTaskListInto(detailContainer, state.selectedDate, state.selectedDate === getTodayStr() ? '今天' : '這天', renderCalendarView);
}
