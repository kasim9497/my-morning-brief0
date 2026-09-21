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

import {
  getTypeInfo,
  getMediaItems,
  addMediaItem,
  removeMediaItem,
  logProgress,
  postponeTarget,
} from './mediaTracker.js';

const ICON_TRASH = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><polyline points="4,7 20,7"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></svg>';
const ICON_PLUS = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:16px;height:16px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

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

function renderMediaItem(item) {
  const { label, unit } = getTypeInfo(item.type);
  const p = item.progress;
  const pct = item.totalUnits > 0 ? Math.min(100, Math.round((item.completedUnits / item.totalUnits) * 100)) : 0;

  let actionHtml = '';
  if (p.isDone) {
    actionHtml = `<div class="media-quota is-done">已完成，恭喜！</div>`;
  } else {
    actionHtml = `
      <div class="media-quota ${p.isFallingBehind ? 'is-behind' : ''}">
        今天建議${label === '書' ? '讀' : '看'} ${p.todayQuota} ${unit}${p.isOverdue ? '（已逾期）' : ''}
      </div>
      ${p.isFallingBehind ? `
        <div class="media-warning">
          進度有點落後，要不要延後目標日？
          <button type="button" class="btn-action" data-action="postpone-media" data-id="${item.id}">延後 3 天</button>
        </div>
      ` : ''}
      <form class="media-log-form" data-action="log-media" data-id="${item.id}">
        <input type="number" class="countdown-input media-log-input" min="1" max="${p.remainingUnits}" placeholder="今天${label === '書' ? '讀' : '看'}了幾${unit}">
        <button type="submit" class="btn-action btn-primary">記錄</button>
      </form>
    `;
  }

  return `
    <div class="media-item">
      <div class="media-item-top">
        <div class="media-item-title-row">
          <span class="media-type-badge">${label}</span>
          <span class="media-title">${escapeHtml(item.title)}</span>
        </div>
        <button type="button" class="countdown-delete" data-action="delete-media" data-id="${item.id}" aria-label="刪除這筆追蹤">${ICON_TRASH}</button>
      </div>
      <div class="media-progress-track"><div class="media-progress-fill" style="width:${pct}%;"></div></div>
      <div class="media-meta">
        <span>${item.completedUnits} / ${item.totalUnits} ${unit}</span>
        <span>目標 ${escapeHtml(item.targetDate)}</span>
      </div>
      ${actionHtml}
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

  const mediaItems = getMediaItems();
  const mediaListHtml = mediaItems.map(renderMediaItem).join('') || '<div class="countdown-empty">還沒有追蹤任何劇或書，在下面新增一個吧</div>';

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

      <div class="card" style="margin-top: 1.25rem;">
        <div class="card-header">
          <h3 class="card-title">追劇／讀書進度</h3>
          <span class="card-badge">${mediaItems.length} 項</span>
        </div>
        <div class="media-list">${mediaListHtml}</div>
      </div>

      <div class="card" style="margin-top: 1.25rem;">
        <div class="card-header">
          <h3 class="card-title">新增追劇／讀書</h3>
        </div>
        <form class="media-add-form" id="media-add-form">
          <input type="text" class="countdown-input" id="media-title-input" placeholder="劇名／書名" maxlength="40" required>
          <select class="countdown-input media-type-select" id="media-type-input">
            <option value="drama">劇</option>
            <option value="book">書</option>
            <option value="movie">電影</option>
          </select>
          <input type="number" class="countdown-input" id="media-units-input" placeholder="總集數／頁數" min="1" required>
          <input type="date" class="countdown-input" id="media-target-input" required>
          <button type="submit" class="btn-action btn-primary">${ICON_PLUS}新增</button>
        </form>
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

  container.querySelectorAll('[data-action="delete-media"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeMediaItem(btn.dataset.id);
      renderSettingsView();
    });
  });

  container.querySelectorAll('[data-action="postpone-media"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      postponeTarget(btn.dataset.id, 3);
      renderSettingsView();
    });
  });

  container.querySelectorAll('[data-action="log-media"]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('.media-log-input');
      logProgress(form.dataset.id, input.value);
      renderSettingsView();
    });
  });

  const mediaAddForm = document.getElementById('media-add-form');
  if (mediaAddForm) {
    mediaAddForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const titleInput = document.getElementById('media-title-input');
      const typeInput = document.getElementById('media-type-input');
      const unitsInput = document.getElementById('media-units-input');
      const targetInput = document.getElementById('media-target-input');
      addMediaItem(titleInput.value, typeInput.value, unitsInput.value, targetInput.value);
      renderSettingsView();
    });
  }
}
