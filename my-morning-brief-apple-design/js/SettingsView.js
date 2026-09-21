/**
 * 設定畫面：調整哪些任務出現在星期幾，或改成每 N 天一次
 * 資料邏輯在 taskEngine.js，這裡只負責畫面跟事件綁定
 */

import {
  TASK_DEFS,
  getConfigurableTaskIds,
  getRoutineConfig,
  setTaskWeekdaySchedule,
  setTaskIntervalSchedule,
  getTodayStr,
} from './taskEngine.js';

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

const FIXED_SCHEDULE = [
  { label: '平日就寢／起床（週一～三）', value: '01:20 → 08:50（5 個 90 分鐘睡眠週期）' },
  { label: '週末作息（週四～日）', value: '01:00 → 10:00（6 個 90 分鐘睡眠週期）' },
  { label: '手機宵禁', value: '每天 23:00' },
  { label: '洗澡提醒', value: '每天 23:30' },
  { label: '保健食品', value: '每天早上（固定任務，不開放關閉）' },
  { label: '居家用品檢查 + 旅遊規劃', value: '每月第一個週日（固定，不開放調整）' },
];

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderWeekdayMode(defId, config) {
  const activeDays = config.days || [];
  const dayButtonsHtml = WEEKDAY_LABELS.map((label, weekday) => {
    const isActive = activeDays.includes(weekday);
    return `<button type="button" class="weekday-toggle ${isActive ? 'is-active' : ''}" data-action="toggle-day" data-def="${defId}" data-weekday="${weekday}">${label}</button>`;
  }).join('');
  return `<div class="weekday-toggle-group">${dayButtonsHtml}</div>`;
}

function renderIntervalMode(defId, config) {
  const n = config.everyNDays || 2;
  const anchor = config.anchorDate || getTodayStr();
  return `
    <div class="interval-config">
      <span>每</span>
      <input type="number" class="interval-input" min="1" max="30" value="${n}" data-action="interval-n" data-def="${defId}">
      <span>天一次</span>
      <span class="interval-anchor">（從 ${escapeHtml(anchor)} 開始算）</span>
    </div>
  `;
}

export function renderSettingsView() {
  const container = document.getElementById('view-settings');
  if (!container) return;

  const config = getRoutineConfig();
  const taskIds = getConfigurableTaskIds();

  const rowsHtml = taskIds
    .map((defId) => {
      const def = TASK_DEFS[defId] || { label: defId, icon: '•' };
      const taskConfig = config[defId] || { mode: 'weekday', days: [] };
      const isInterval = taskConfig.mode === 'interval';

      return `
        <div class="routine-row">
          <div class="routine-row-label">
            <span class="routine-row-icon">${def.icon}</span>
            <span>${escapeHtml(def.label)}</span>
          </div>
          <div class="routine-mode-switch">
            <button type="button" class="mode-btn ${!isInterval ? 'is-active' : ''}" data-action="set-mode" data-def="${defId}" data-mode="weekday">星期幾</button>
            <button type="button" class="mode-btn ${isInterval ? 'is-active' : ''}" data-action="set-mode" data-def="${defId}" data-mode="interval">每 N 天</button>
          </div>
          ${isInterval ? renderIntervalMode(defId, taskConfig) : renderWeekdayMode(defId, taskConfig)}
        </div>
      `;
    })
    .join('');

  const fixedHtml = FIXED_SCHEDULE.map(
    (item) => `
      <div class="fixed-schedule-row">
        <span class="fixed-schedule-label">${escapeHtml(item.label)}</span>
        <span class="fixed-schedule-value">${escapeHtml(item.value)}</span>
      </div>
    `
  ).join('');

  container.innerHTML = `
    <main class="container">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">作息設定</h3>
          <span class="card-badge">星期幾 / 每 N 天，每項任務自己選</span>
        </div>
        <div class="routine-config-list">${rowsHtml}</div>
      </div>

      <div class="card" style="margin-top: 1.25rem;">
        <div class="card-header">
          <h3 class="card-title">固定作息時間參考</h3>
          <span class="card-badge">目前不開放調整</span>
        </div>
        <div class="fixed-schedule-list">${fixedHtml}</div>
      </div>
    </main>
  `;

  container.querySelectorAll('[data-action="toggle-day"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const defId = btn.dataset.def;
      const weekday = Number(btn.dataset.weekday);
      const current = getRoutineConfig()[defId]?.days || [];
      const next = current.includes(weekday)
        ? current.filter((w) => w !== weekday)
        : [...current, weekday];
      setTaskWeekdaySchedule(defId, next);
      renderSettingsView();
    });
  });

  container.querySelectorAll('[data-action="interval-n"]').forEach((input) => {
    input.addEventListener('change', () => {
      setTaskIntervalSchedule(input.dataset.def, input.value);
      renderSettingsView();
    });
  });

  container.querySelectorAll('[data-action="set-mode"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const defId = btn.dataset.def;
      const mode = btn.dataset.mode;
      if (mode === 'interval') {
        setTaskIntervalSchedule(defId, 2);
      } else {
        setTaskWeekdaySchedule(defId, []);
      }
      renderSettingsView();
    });
  });
}
