/**
 * 設定畫面：調整哪些任務出現在星期幾，或改成每 N 天一次
 * 資料邏輯在 taskEngine.js，這裡只負責畫面跟事件綁定
 */

import {
  getTaskDef,
  addCustomTask,
  removeRoutineTask,
  hasRemovedDefaultTasks,
  restoreDefaultTasks,
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

import { exportBackup, importBackup, daysSinceBackup } from './backup.js';
import { renderTaskIcon } from './taskIcons.js';
import { enableSwipeRows } from './swipeRow.js';
import { getFixedSchedule, setFixedTime } from './fixedSchedule.js';

const ICON_TRASH = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><polyline points="4,7 20,7"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></svg>';

const APP_VERSION = '1.0.0';

const ABOUT_ROWS = [
  { label: '版本', value: APP_VERSION },
  { label: '資料儲存', value: '只存在這台裝置，不會上傳' },
  { label: '天氣', value: '和風天氣' },
  { label: '匯率', value: 'ExchangeRate-API' },
  { label: '題庫', value: '交通部公路局機車筆試題庫' },
];

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

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
      const def = getTaskDef(defId);
      const taskConfig = config[defId] || { mode: 'weekday', days: [] };
      const isInterval = taskConfig.mode === 'interval';

      return `
        <div class="swipe-row">
          <button type="button" class="swipe-delete" data-action="delete-routine" data-def="${defId}">刪除</button>
          <div class="swipe-content routine-row">
            <div class="routine-row-label">
              ${renderTaskIcon(def.icon, def.tint)}
              <span>${escapeHtml(def.label)}</span>
            </div>
            <div class="routine-mode-switch">
              <button type="button" class="mode-btn ${!isInterval ? 'is-active' : ''}" data-action="set-mode" data-def="${defId}" data-mode="weekday">星期幾</button>
              <button type="button" class="mode-btn ${isInterval ? 'is-active' : ''}" data-action="set-mode" data-def="${defId}" data-mode="interval">每 N 天</button>
            </div>
            ${isInterval ? renderIntervalMode(defId, taskConfig) : renderWeekdayMode(defId, taskConfig)}
          </div>
        </div>
      `;
    })
    .join('');

  const fixedHtml = getFixedSchedule().map(
    (item) => `
      <label class="list-row">
        <span>${escapeHtml(item.label)}<small class="row-note">${escapeHtml(item.note)}</small></span>
        <input type="time" class="countdown-input" data-action="fixed-time" data-id="${item.id}" value="${item.time}">
      </label>
    `
  ).join('');

  const aboutHtml = ABOUT_ROWS.map(
    (item) => `
      <div class="fixed-schedule-row">
        <span class="fixed-schedule-label">${escapeHtml(item.label)}</span>
        <span class="fixed-schedule-value">${escapeHtml(item.value)}</span>
      </div>
    `
  ).join('');

  const mediaItems = getMediaItems();
  const mediaListHtml = mediaItems.map(renderMediaItem).join('') || '<div class="countdown-empty">還沒有追蹤任何劇或書</div>';

  const backupDays = daysSinceBackup();
  const backupLabel = backupDays === null ? '還沒備份過' : backupDays === 0 ? '今天備份過' : `上次備份是 ${backupDays} 天前`;

  container.innerHTML = `
    <main class="container card-stack">
      <div class="section-head">
        <h2 class="section-title">作息</h2>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">每週安排</h3>
        </div>
        <div class="routine-config-list">${rowsHtml}</div>
        <form class="list-row routine-add-form" id="routine-add-form">
          <input type="text" class="row-input routine-add-input" id="routine-add-input" placeholder="新增項目，例如：背單字" maxlength="30" required>
          <button type="submit" class="section-action">加入</button>
        </form>
        ${hasRemovedDefaultTasks() ? '<button type="button" class="section-action list-footnote" id="routine-restore-btn">還原刪掉的預設項目</button>' : ''}
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">作息時間</h3>
        </div>
        ${fixedHtml}
      </div>

      <div class="section-head">
        <h2 class="section-title">追劇／讀書</h2>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">進行中</h3>
          <span class="card-badge">${mediaItems.length} 項</span>
        </div>
        <div class="media-list">${mediaListHtml}</div>
        <details class="add-details">
          <summary class="section-action">新增一部</summary>
          <form id="media-add-form">
            <label class="list-row">
              <span>名稱</span>
              <input type="text" class="row-input" id="media-title-input" placeholder="劇名或書名" maxlength="40" required>
            </label>
            <label class="list-row">
              <span>類型</span>
              <select class="countdown-input" id="media-type-input">
                <option value="drama">劇</option>
                <option value="book">書</option>
                <option value="movie">電影</option>
              </select>
            </label>
            <label class="list-row">
              <span>集數／頁數</span>
              <input type="number" class="row-input" id="media-units-input" placeholder="例如 16" min="1" required>
            </label>
            <label class="list-row">
              <span>目標日</span>
              <input type="date" class="countdown-input" id="media-target-input" required>
            </label>
            <button type="submit" class="btn-action btn-primary btn-block">加入</button>
          </form>
        </details>
      </div>

      <div class="section-head">
        <h2 class="section-title">資料</h2>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">備份</h3>
          <span class="card-badge">${backupLabel}</span>
        </div>
        <div class="media-add-form">
          <button type="button" class="btn-action btn-primary" id="backup-export-btn">匯出備份檔</button>
          <button type="button" class="btn-action" id="backup-import-btn">從備份檔還原</button>
          <input type="file" id="backup-import-input" accept="application/json,.json" hidden>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">關於晨序</h3>
        </div>
        <div class="fixed-schedule-list">${aboutHtml}</div>
      </div>
    </main>
  `;

  enableSwipeRows(container);

  container.querySelectorAll('[data-action="fixed-time"]').forEach((input) => {
    input.addEventListener('change', () => setFixedTime(input.dataset.id, input.value));
  });

  container.querySelectorAll('[data-action="delete-routine"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeRoutineTask(btn.dataset.def);
      renderSettingsView();
    });
  });

  const routineAddForm = document.getElementById('routine-add-form');
  if (routineAddForm) {
    routineAddForm.addEventListener('submit', (e) => {
      e.preventDefault();
      addCustomTask(document.getElementById('routine-add-input').value);
      renderSettingsView();
    });
  }

  const restoreBtn = document.getElementById('routine-restore-btn');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      restoreDefaultTasks();
      renderSettingsView();
    });
  }

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

  const importInput = document.getElementById('backup-import-input');
  document.getElementById('backup-export-btn').addEventListener('click', () => {
    exportBackup();
    renderSettingsView();
  });
  document.getElementById('backup-import-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const error = importInput.files[0] ? await importBackup(importInput.files[0]) : null;
    importInput.value = '';
    if (error) window.alert(error);
  });
}
