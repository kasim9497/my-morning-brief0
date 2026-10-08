/**
 * 「作息與提醒」那張卡片：一天裡固定的時間點，每一項可以改時間、開提醒；按編輯可以改名和刪除。
 * 放在睡眠頁。就寢提醒不是另外一套——它就是這張清單裡今晚適用的那一項就寢時間，
 * 睡眠計算機算出來的上床時間也是直接寫進那一項。
 * 資料在 fixedSchedule.js，提醒怎麼發在 sleepReminder.js。
 */

import { getFixedSchedule, updateFixedItem, addFixedItem, removeFixedItem, getBedItem, getWakeItem } from './fixedSchedule.js';
import {
  scheduleReminderIfEnabled,
  requestNotificationPermission,
  permissionHelp,
  canRemindInBackground,
  isPushSyncPending,
} from './sleepReminder.js';

const ICON_TRASH = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><polyline points="4,7 20,7"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></svg>';

let editing = false;

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function footnote() {
  if (isPushSyncPending()) return '提醒的時間還沒傳上去（連不上伺服器，可能是沒開 VPN）。在傳上去之前，提醒會照舊的時間響。連上後再打開晨序會自動重試。';
  return canRemindInBackground()
    ? '打開右邊的開關，時間到會跳通知，晨序關著也會。'
    : '打開右邊的開關，時間到會提醒。iPhone 要先把晨序「加入主畫面」，從主畫面打開才收得到。';
}

export function renderFixedScheduleCard() {
  // 今晚睡覺和明早起床適用的是哪兩項，標出來——睡眠計算機用的就是這兩個時間
  const tonight = getBedItem();
  const tomorrow = getWakeItem();
  const mark = (item) => (tonight && item.id === tonight.id ? '今晚' : tomorrow && item.id === tomorrow.id ? '明早' : '');

  const rowsHtml = getFixedSchedule().map((item) => (editing ? `
      <div class="list-row">
        <input type="text" class="row-input rename-input" data-action="fixed-label" data-id="${item.id}" value="${escapeHtml(item.label)}" maxlength="20" aria-label="名稱">
        <button type="button" class="countdown-delete" data-action="fixed-delete" data-id="${item.id}" aria-label="刪除${escapeHtml(item.label)}">${ICON_TRASH}</button>
      </div>
    ` : `
      <div class="list-row fixed-row">
        <span>${escapeHtml(item.label)}<small class="row-note">${[mark(item), item.note].filter(Boolean).map(escapeHtml).join(' · ')}</small></span>
        <input type="time" class="countdown-input" data-action="fixed-time" data-id="${item.id}" value="${item.time}" aria-label="${escapeHtml(item.label)}的時間">
        <input type="checkbox" class="ios-switch" data-action="fixed-remind" data-id="${item.id}" ${item.remind ? 'checked' : ''} aria-label="${escapeHtml(item.label)}提醒">
      </div>
    `)).join('');

  return `
    <div class="section-head">
      <h2 class="section-title">作息與提醒</h2>
      <button type="button" class="section-action" id="fixed-edit-btn">${editing ? '完成' : '編輯'}</button>
    </div>
    <div class="card">
      ${rowsHtml}
      <form class="list-row routine-add-form" id="fixed-add-form">
        <input type="text" class="row-input routine-add-input" id="fixed-add-label" placeholder="新增時間，例如：吃藥" maxlength="20" required aria-label="新項目的名稱">
        <input type="time" class="countdown-input" id="fixed-add-time" required aria-label="時間">
        <button type="submit" class="section-action">加入</button>
      </form>
      <p class="list-footnote" id="reminder-footnote">${footnote()}</p>
    </div>
  `;
}

/** container 裡畫好卡片之後呼叫；rerender 是「整頁重畫」的函式 */
export function bindFixedSchedule(container, rerender) {
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
      rerender();
    });
  });

  container.querySelector('#fixed-edit-btn').addEventListener('click', () => {
    editing = !editing;
    rerender();
  });

  container.querySelector('#fixed-add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addFixedItem(container.querySelector('#fixed-add-label').value, container.querySelector('#fixed-add-time').value);
    rerender();
  });
}

// 提醒的時間有沒有成功傳到後端，是之後才知道的事；知道了就更新那行說明
if (typeof window !== 'undefined') {
  window.addEventListener('chenxu:reminder-sync', () => {
    const el = document.getElementById('reminder-footnote');
    if (el) el.textContent = footnote();
  });
}
