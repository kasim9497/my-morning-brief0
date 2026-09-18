/**
 * 週曆／月曆畫面
 * 任務資料一律透過 taskEngine.js 讀寫，這裡只負責日期計算跟畫面
 */

import { getTasksForDate, getTodayStr, addDays, getWeekday } from './taskEngine.js';
import { renderTaskListInto } from './TaskListView.js';

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

const state = {
  mode: 'week', // 'week' | 'month'
  anchorDate: getTodayStr(), // 決定目前顯示哪一週／哪一個月
  selectedDate: getTodayStr(), // 目前展開任務詳情的那一天
};

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

function dayLabel(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}

function detailLabel(dateStr) {
  const wd = WEEKDAY_LABELS[getWeekday(dateStr)];
  const prefix = dateStr === getTodayStr() ? '今天・' : '';
  return `${prefix}${dayLabel(dateStr)}（${wd}）`;
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

function renderControls() {
  return `
    <div class="cal-controls">
      <div class="cal-nav">
        <button class="btn-action" data-cal-action="prev">← ${state.mode === 'week' ? '上週' : '上個月'}</button>
        <button class="btn-action" data-cal-action="today">回到今天</button>
        <button class="btn-action" data-cal-action="next">${state.mode === 'week' ? '下週' : '下個月'} →</button>
      </div>
      <button class="btn-action btn-primary" data-cal-action="toggle-mode">
        ${state.mode === 'week' ? '📆 切換月曆' : '🗓️ 切換週曆'}
      </button>
    </div>
  `;
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
          <span class="cal-week-date">${dayLabel(dateStr)}</span>
          <span class="cal-week-progress">${total > 0 ? `${done}/${total}` : ''}</span>
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
      ${WEEKDAY_LABELS.map((w) => `<span>${w}</span>`).join('')}
    </div>
    <div class="cal-month-grid">${cellsHtml}</div>
  `;
}

export function renderCalendarView() {
  const container = document.getElementById('view-calendar');
  if (!container) return;

  container.innerHTML = `
    <main class="container">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title"><svg aria-hidden="true" focusable="false" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>週曆</h3>
          <span class="card-badge">${state.mode === 'week' ? '週檢視' : '月檢視'}</span>
        </div>
        ${renderControls()}
        ${state.mode === 'week' ? renderWeekGrid() : renderMonthGrid()}
      </div>

      <div class="card" style="margin-top: 1.25rem;">
        <div class="card-header">
          <h3 class="card-title"><svg aria-hidden="true" focusable="false" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8,12 11,15 16,9"/></svg>當天任務</h3>
        </div>
        <div id="calendar-detail-content"></div>
      </div>
    </main>
  `;

  container.querySelectorAll('[data-cal-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.calAction;
      if (action === 'toggle-mode') {
        state.mode = state.mode === 'week' ? 'month' : 'week';
      } else if (action === 'today') {
        state.anchorDate = getTodayStr();
        state.selectedDate = getTodayStr();
      } else if (action === 'prev') {
        state.anchorDate = addDays(state.anchorDate, state.mode === 'week' ? -7 : -30);
      } else if (action === 'next') {
        state.anchorDate = addDays(state.anchorDate, state.mode === 'week' ? 7 : 30);
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
  renderTaskListInto(detailContainer, state.selectedDate, detailLabel(state.selectedDate), renderCalendarView);
}
