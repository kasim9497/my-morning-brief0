/**
 * 設定畫面：調整哪些任務出現在星期幾，或改成每 N 天一次
 * 資料邏輯在 taskEngine.js，這裡只負責畫面跟事件綁定
 */

import {
  getTaskDef,
  addCustomTask,
  removeRoutineTask,
  renameRoutineTask,
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
import { getFixedSchedule, updateFixedItem, addFixedItem, removeFixedItem } from './fixedSchedule.js';
import { scheduleReminderIfEnabled, requestNotificationPermission, permissionHelp, canRemindInBackground, isPushSyncPending } from './sleepReminder.js';
import { buildWeeklyReport } from './weeklyReport.js';

const ICON_TRASH = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><polyline points="4,7 20,7"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></svg>';

const APP_VERSION = '1.0.0';

const ABOUT_ROWS = [
  { label: '版本', value: APP_VERSION },
  { label: '資料儲存', value: '只存在這台裝置，不會上傳' },
  { label: '天氣', value: '和風天氣' },
  { label: '匯率', value: 'ExchangeRate-API' },
  { label: '題庫', value: '交通部公路局機車筆試題庫' },
];

// 「每週安排」是不是在編輯狀態（每一列都露出刪除鈕）。刪除後整頁會重畫，所以要記在這裡
let editingRoutines = false;
let editingFixed = false;

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

function reminderFootnote() {
  if (isPushSyncPending()) return '提醒的時間還沒傳上去（連不上伺服器，可能是沒開 VPN）。在傳上去之前，提醒會照舊的時間響。連上後再打開晨序會自動重試。';
  return canRemindInBackground()
    ? '打開右邊的開關，時間到會跳通知，晨序關著也會。'
    : '打開右邊的開關，時間到會提醒。iPhone 要先把晨序「加入主畫面」，從主畫面打開才收得到。';
}

// 提醒的時間有沒有成功傳到後端，是之後才知道的事；知道了就更新那行說明
if (typeof window !== 'undefined') {
  window.addEventListener('chenxu:reminder-sync', () => {
    const el = document.getElementById('reminder-footnote');
    if (el) el.textContent = reminderFootnote();
  });
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
              ${editingRoutines
                ? `<input type="text" class="row-input rename-input" data-action="rename-routine" data-def="${defId}" value="${escapeHtml(def.label)}" maxlength="30" aria-label="項目名稱">`
                : `<span>${escapeHtml(def.label)}</span>`}
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

  // 作息時間：平常是「名稱／時間／提醒開關」，按了編輯變成「可以改的名稱／刪除」
  const fixedHtml = getFixedSchedule().map(
    (item) => (editingFixed ? `
      <div class="list-row">
        <input type="text" class="row-input rename-input" data-action="fixed-label" data-id="${item.id}" value="${escapeHtml(item.label)}" maxlength="20" aria-label="名稱">
        <button type="button" class="countdown-delete" data-action="fixed-delete" data-id="${item.id}" aria-label="刪除${escapeHtml(item.label)}">${ICON_TRASH}</button>
      </div>
    ` : `
      <div class="list-row fixed-row">
        <span>${escapeHtml(item.label)}<small class="row-note">${escapeHtml(item.note || '')}</small></span>
        <input type="time" class="countdown-input" data-action="fixed-time" data-id="${item.id}" value="${item.time}" aria-label="${escapeHtml(item.label)}的時間">
        <input type="checkbox" class="ios-switch" data-action="fixed-remind" data-id="${item.id}" ${item.remind ? 'checked' : ''} aria-label="${escapeHtml(item.label)}提醒">
      </div>
    `)
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
          <button type="button" class="section-action card-link" id="routine-edit-btn">${editingRoutines ? '完成' : '編輯'}</button>
        </div>
        <div class="routine-config-list ${editingRoutines ? 'is-editing' : ''}">${rowsHtml}</div>
        <form class="list-row routine-add-form" id="routine-add-form">
          <input type="text" class="row-input routine-add-input" id="routine-add-input" placeholder="新增項目，例如：背單字" maxlength="30" required>
          <button type="submit" class="section-action">加入</button>
        </form>
        ${hasRemovedDefaultTasks() ? '<button type="button" class="section-action list-footnote" id="routine-restore-btn">還原刪掉的預設項目</button>' : ''}
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">作息時間</h3>
          <button type="button" class="section-action card-link" id="fixed-edit-btn">${editingFixed ? '完成' : '編輯'}</button>
        </div>
        ${fixedHtml}
        <form class="list-row routine-add-form" id="fixed-add-form">
          <input type="text" class="row-input routine-add-input" id="fixed-add-label" placeholder="新增時間，例如：吃藥" maxlength="20" required>
          <input type="time" class="countdown-input" id="fixed-add-time" required aria-label="時間">
          <button type="submit" class="section-action">加入</button>
        </form>
        <p class="list-footnote" id="reminder-footnote">${reminderFootnote()}</p>
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
        <h2 class="section-title">本週摘要</h2>
      </div>
      <div class="card">
        <textarea class="countdown-input weekly-note" id="weekly-health-note" rows="3" placeholder="想一起分析的健康數據（選填）。例如：平均步數 8,200、平均睡眠 6.5 小時"></textarea>
        <button type="button" class="btn-action btn-primary btn-block" id="weekly-share-btn">整理這一週，交給 Claude</button>
        <p class="list-footnote" id="weekly-status">會把最近 7 天的任務、追劇讀書進度和錯題整理成一段文字。iPhone「健康」App 的數字要自己看了填在上面。</p>
      </div>

      <div class="section-head">
        <h2 class="section-title">資料</h2>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">備份</h3>
          <span class="card-badge">${backupLabel}</span>
        </div>
        <p class="list-footnote backup-explain">你的紀錄只存在這支手機裡。定期存一份檔案，手機壞了或換手機才救得回來。</p>
        <button type="button" class="btn-action btn-primary btn-block" id="backup-export-btn">現在備份（存成一個檔案）</button>
        <p class="list-footnote backup-explain">換了手機，或資料不見了，才需要下面這個。它會用檔案裡的內容蓋掉現在的資料。</p>
        <button type="button" class="btn-action btn-block" id="backup-import-btn">用之前存的檔案還原</button>
        <input type="file" id="backup-import-input" accept="application/json,.json" hidden>
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
    input.addEventListener('change', () => {
      updateFixedItem(input.dataset.id, { time: input.value });
      scheduleReminderIfEnabled();
    });
  });

  container.querySelectorAll('[data-action="fixed-remind"]').forEach((toggle) => {
    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        const permission = await requestNotificationPermission();
        if (permission !== 'granted') {
          toggle.checked = false;
          window.alert(permissionHelp(permission));
          return;
        }
      }
      updateFixedItem(toggle.dataset.id, { remind: toggle.checked });
      scheduleReminderIfEnabled();
    });
  });

  container.querySelectorAll('[data-action="fixed-label"]').forEach((input) => {
    input.addEventListener('change', () => {
      updateFixedItem(input.dataset.id, { label: input.value });
      scheduleReminderIfEnabled();
    });
  });

  container.querySelectorAll('[data-action="fixed-delete"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeFixedItem(btn.dataset.id);
      scheduleReminderIfEnabled();
      renderSettingsView();
    });
  });

  document.getElementById('fixed-edit-btn').addEventListener('click', () => {
    editingFixed = !editingFixed;
    renderSettingsView();
  });

  document.getElementById('fixed-add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addFixedItem(document.getElementById('fixed-add-label').value, document.getElementById('fixed-add-time').value);
    renderSettingsView();
  });

  container.querySelectorAll('[data-action="rename-routine"]').forEach((input) => {
    input.addEventListener('change', () => renameRoutineTask(input.dataset.def, input.value));
  });

  container.querySelectorAll('[data-action="delete-routine"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeRoutineTask(btn.dataset.def);
      renderSettingsView();
    });
  });

  document.getElementById('routine-edit-btn').addEventListener('click', () => {
    editingRoutines = !editingRoutines;
    renderSettingsView();
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

  document.getElementById('weekly-share-btn').addEventListener('click', async () => {
    const text = buildWeeklyReport(document.getElementById('weekly-health-note').value);
    const status = document.getElementById('weekly-status');
    // 手機上跳出系統的分享選單，可以直接選 Claude；不支援分享的瀏覽器就複製到剪貼簿
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // 使用者自己關掉分享選單
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = '已經複製。打開 Claude，貼上就可以了。';
    } catch (e) {
      status.textContent = '這個瀏覽器不讓網頁複製文字，換一個瀏覽器再試。';
    }
  });

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
