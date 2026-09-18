/**
 * 設定畫面：調整哪些任務出現在星期幾
 * 資料邏輯在 taskEngine.js，這裡只負責畫面跟事件綁定
 */

import { TASK_DEFS, getConfigurableTaskIds, getRoutineConfig, setTaskWeekdays } from './taskEngine.js';

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

export function renderSettingsView() {
  const container = document.getElementById('view-settings');
  if (!container) return;

  const config = getRoutineConfig();
  const taskIds = getConfigurableTaskIds();

  const rowsHtml = taskIds
    .map((defId) => {
      const def = TASK_DEFS[defId] || { label: defId, icon: '•' };
      const activeDays = config[defId] || [];
      const dayButtonsHtml = WEEKDAY_LABELS.map((label, weekday) => {
        const isActive = activeDays.includes(weekday);
        return `<button type="button" class="weekday-toggle ${isActive ? 'is-active' : ''}" data-def="${defId}" data-weekday="${weekday}">${label}</button>`;
      }).join('');

      return `
        <div class="routine-row">
          <div class="routine-row-label">
            <span class="routine-row-icon">${def.icon}</span>
            <span>${escapeHtml(def.label)}</span>
          </div>
          <div class="weekday-toggle-group">${dayButtonsHtml}</div>
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
          <h3 class="card-title"><svg aria-hidden="true" focusable="false" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="18" r="2"/></svg>作息設定</h3>
          <span class="card-badge">點星期幾切換開關</span>
        </div>
        <div class="routine-config-list">${rowsHtml}</div>
      </div>

      <div class="card" style="margin-top: 1.25rem;">
        <div class="card-header">
          <h3 class="card-title"><svg aria-hidden="true" focusable="false" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="12,6 12,12 16,14"/><circle cx="12" cy="12" r="9"/></svg>固定作息時間參考</h3>
          <span class="card-badge">目前不開放調整</span>
        </div>
        <div class="fixed-schedule-list">${fixedHtml}</div>
      </div>
    </main>
  `;

  container.querySelectorAll('.weekday-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const defId = btn.dataset.def;
      const weekday = Number(btn.dataset.weekday);
      const current = getRoutineConfig()[defId] || [];
      const next = current.includes(weekday)
        ? current.filter((w) => w !== weekday)
        : [...current, weekday];
      setTaskWeekdays(defId, next);
      renderSettingsView();
    });
  });
}
