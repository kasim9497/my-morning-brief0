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
const ICON_PLUS = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:16px;height:16px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

function daysLeftLabel(daysLeft) {
  if (daysLeft === 0) return { text: '就是今天', cls: 'is-today' };
  if (daysLeft < 0) return { text: `已過 ${Math.abs(daysLeft)} 天`, cls: 'is-past' };
  return { text: `還有 ${daysLeft} 天`, cls: 'is-upcoming' };
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

  const itemsHtml = items
    .map((c) => {
      const { text, cls } = daysLeftLabel(c.daysLeft);
      return `
        <div class="countdown-item ${cls}">
          <div class="countdown-days">${Math.abs(c.daysLeft)}</div>
          <div class="countdown-info">
            <div class="countdown-label">${escapeHtml(c.label)}</div>
            <div class="countdown-meta">${text} · 目標日 ${formatTargetDate(c.targetDate)}</div>
          </div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = itemsHtml || '<div class="countdown-empty">還沒有任何倒數，去「倒數」頁新增一個吧</div>';
}

export function renderCountdownView() {
  const container = document.getElementById('view-countdown');
  if (!container) return;

  const items = getCountdowns();

  const itemsHtml = items
    .map((c) => {
      const { text, cls } = daysLeftLabel(c.daysLeft);
      return `
        <div class="countdown-item ${cls}">
          <div class="countdown-days">${Math.abs(c.daysLeft)}</div>
          <div class="countdown-info">
            <div class="countdown-label">${escapeHtml(c.label)}</div>
            <div class="countdown-meta">${text} · 目標日 ${formatTargetDate(c.targetDate)}</div>
          </div>
          <button class="countdown-delete" data-id="${c.id}" aria-label="刪除這個倒數">${ICON_TRASH}</button>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <main class="container">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">倒數</h3>
          <span class="card-badge">${items.length} 個倒數</span>
        </div>
        <div class="countdown-list">
          ${itemsHtml || '<div class="countdown-empty">還沒有任何倒數，在下面新增一個吧</div>'}
        </div>
      </div>

      <div class="card" style="margin-top: 1.25rem;">
        <div class="card-header">
          <h3 class="card-title">新增倒數</h3>
        </div>
        <form class="countdown-form" id="countdown-add-form">
          <input type="text" class="countdown-input" id="countdown-label-input" placeholder="例如：期末考、回台灣" maxlength="40" required>
          <input type="date" class="countdown-input" id="countdown-date-input" required>
          <button type="submit" class="btn-action btn-primary">${ICON_PLUS}新增</button>
        </form>
      </div>
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
