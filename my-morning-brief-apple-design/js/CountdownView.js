/**
 * 倒數畫面渲染
 * 資料/邏輯都在 countdown.js，這裡只負責畫面跟事件綁定
 */

import { getCountdowns, addCountdown, removeCountdown } from './countdown.js';

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const ICON_TRASH = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><polyline points="4,7 20,7"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></svg>';

function statusClass(daysLeft) {
  if (daysLeft === 0) return 'is-today';
  return daysLeft < 0 ? 'is-past' : 'is-upcoming';
}

/** 一列倒數：左邊名稱和目標日，右邊大數字；trailingHtml 是列尾額外的東西（倒數頁的刪除鈕） */
function countdownRowHtml(c, trailingHtml = '') {
  const metric = c.daysLeft === 0
    ? '<span class="metric-value">今天</span>'
    : `<span class="metric-value">${Math.abs(c.daysLeft)}</span><span class="metric-unit">天</span>`;
  return `
    <div class="countdown-item ${statusClass(c.daysLeft)}">
      <div class="countdown-info">
        <div class="countdown-label">${escapeHtml(c.label)}</div>
        <div class="countdown-meta">${c.daysLeft < 0 ? '已過 · ' : ''}${formatTargetDate(c.targetDate)}</div>
      </div>
      <div class="countdown-days metric">${metric}</div>
      ${trailingHtml}
    </div>
  `;
}

function formatTargetDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${y} / ${String(m).padStart(2, '0')} / ${String(d).padStart(2, '0')}`;
}

/**
 * 給「今日」頁用的精簡版——只顯示，不能新增/刪除（那些操作留在「倒數」頁）
 */
export function renderCountdownSummaryInto(container) {
  if (!container) return;
  const items = getCountdowns();

  const itemsHtml = items.map((c) => countdownRowHtml(c)).join('');

  container.innerHTML = itemsHtml || '<div class="countdown-empty">還沒有任何倒數，去「倒數」頁新增一個吧</div>';
}

export function renderCountdownView() {
  const container = document.getElementById('view-countdown');
  if (!container) return;

  const items = getCountdowns();

  const itemsHtml = items
    .map((c) => countdownRowHtml(c, `<button class="countdown-delete" data-id="${c.id}" aria-label="刪除這個倒數">${ICON_TRASH}</button>`))
    .join('');

  container.innerHTML = `
    <main class="container card-stack">
      <div class="card tint-red">
        <div class="countdown-list">
          ${itemsHtml || '<div class="countdown-empty">還沒有任何倒數，在下面新增一個</div>'}
        </div>
      </div>

      <div class="section-head">
        <h2 class="section-title">新增倒數</h2>
      </div>
      <form class="card" id="countdown-add-form">
        <label class="list-row">
          <span>名稱</span>
          <input type="text" class="row-input" id="countdown-label-input" placeholder="例如：期末考" maxlength="40" required>
        </label>
        <label class="list-row">
          <span>日期</span>
          <input type="date" class="countdown-input" id="countdown-date-input" required>
        </label>
        <button type="submit" class="btn-action btn-primary btn-block">新增</button>
      </form>
    </main>
  `;

  container.querySelectorAll('.countdown-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeCountdown(btn.dataset.id);
      renderCountdownView();
    });
  });

  const form = document.getElementById('countdown-add-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const labelInput = document.getElementById('countdown-label-input');
      const dateInput = document.getElementById('countdown-date-input');
      addCountdown(labelInput.value, dateInput.value);
      renderCountdownView();
    });
  }
}
