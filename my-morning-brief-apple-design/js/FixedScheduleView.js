/**
 * 「作息與提醒」那張卡片：一天裡固定的時間點，每一項可以改時間、開提醒；按編輯可以改名和刪除。
 * 放在睡眠頁。就寢提醒不是另外一套——它就是這張清單裡今晚適用的那一項就寢時間，
 * 睡眠計算機算出來的上床時間也是直接寫進那一項。
 * 資料在 fixedSchedule.js，提醒怎麼發在 sleepReminder.js。
 */

import { getFixedSchedule, updateFixedItem, addFixedItem, removeFixedItem, getBedItem, getWakeItem, leadOf } from './fixedSchedule.js';
import {
  scheduleReminderIfEnabled,
  requestNotificationPermission,
  permissionHelp,
  getReminderStatus,
  sendTestPush,
} from './sleepReminder.js';

const ICON_TRASH = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><polyline points="4,7 20,7"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></svg>';

const LEAD_OPTIONS = [0, 10, 15, 20, 30, 45, 60];

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

const whenText = (iso) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 提醒的實際狀態，照真正的情況寫（權限、背景通知、時間表有沒有傳上去），不是看開關
function footnote() {
  const s = getReminderStatus();
  if (!s.background) return '要從主畫面的晨序圖示打開，才收得到通知。';
  if (s.permission === 'denied') return '通知被關掉了：到 iPhone 設定 → 通知 → 晨序，把「允許通知」打開。';
  if (s.pending) return '提醒的時間還沒傳上去（連不上伺服器，可能是沒開 VPN）。傳上去之前會照舊的時間響，連上後打開晨序會自動重試。';
  if (!s.anyOn) return '還沒有打開任何提醒。';
  if (s.native) return '通知正常（App 版，用 iPhone 內建的通知）';
  return s.syncedAt ? `通知正常 · 時間表 ${whenText(s.syncedAt)} 傳上去的` : '';
}

// 按鈕一直都在（以前條件不合就整顆消失，使用者找不到、也不知道為什麼）；送不了的時候講原因
function testBlocker() {
  const s = getReminderStatus();
  if (!s.background) return '要從主畫面的晨序圖示打開，才收得到通知。';
  if (s.permission === 'denied') return '通知被關掉了：到 iPhone 設定 → 通知 → 晨序，把「允許通知」打開。';
  if (s.permission !== 'granted') return '還沒允許通知：先打開任一個提醒的開關，系統會問你要不要允許。';
  if (!s.anyOn) return '先打開任一個提醒的開關，再按一次。';
  return '';
}

export function renderFixedScheduleCard() {
  // 今晚睡覺和明早起床適用的是哪兩項，標出來——睡眠計算機用的就是這兩個時間
  const tonight = getBedItem();
  const tomorrow = getWakeItem();
  const mark = (item) => (tonight && item.id === tonight.id ? '今晚' : tomorrow && item.id === tomorrow.id ? '明早' : '');

  const leadNote = (item) => (!item.kind && leadOf(item) ? `提前 ${leadOf(item)} 分` : '');
  // 待辦的那兩項（item.kind）不能改名、刪除，也沒有「提前」，編輯時不列出來
  const rowsHtml = getFixedSchedule().filter((item) => !editing || !item.kind).map((item) => (editing ? `
      <div class="list-row">
        <input type="text" class="row-input rename-input" data-action="fixed-label" data-id="${item.id}" value="${escapeHtml(item.label)}" maxlength="20" aria-label="名稱">
        <select class="countdown-input" data-action="fixed-lead" data-id="${item.id}" aria-label="${escapeHtml(item.label)}提前多久提醒">
          ${[...new Set([...LEAD_OPTIONS, leadOf(item)])].sort((a, b) => a - b).map((n) => `<option value="${n}" ${n === leadOf(item) ? 'selected' : ''}>${n ? `提前 ${n} 分` : '準時'}</option>`).join('')}
        </select>
        <button type="button" class="countdown-delete" data-action="fixed-delete" data-id="${item.id}" aria-label="刪除${escapeHtml(item.label)}">${ICON_TRASH}</button>
      </div>
    ` : `
      <div class="list-row fixed-row">
        <span>${escapeHtml(item.label)}<small class="row-note">${[mark(item), item.note, leadNote(item)].filter(Boolean).map(escapeHtml).join(' · ')}</small></span>
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
      <p class="list-footnote" id="reminder-footnote" ${footnote() ? '' : 'hidden'}>${footnote()}</p>
      ${getReminderStatus().native ? '' : '<button type="button" class="section-action" id="reminder-test-btn">送一則測試通知</button>'}
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

  container.querySelectorAll('[data-action="fixed-lead"]').forEach((select) => {
    select.addEventListener('change', () => {
      updateFixedItem(select.dataset.id, { lead: Number(select.value) });
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

  container.querySelector('#reminder-test-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const note = container.querySelector('#reminder-footnote');
    const blocker = testBlocker();
    if (blocker) {
      note.textContent = blocker;
      note.hidden = false;
      return;
    }
    btn.disabled = true;
    try {
      await sendTestPush();
      note.textContent = '測試通知送出了，幾秒內應該會跳出來。沒跳的話，截圖這一頁給 Claude。';
    } catch (err) {
      note.textContent = `測試沒送出：${err.message}`;
    }
    note.hidden = false;
    btn.disabled = false;
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
    if (!el) return;
    el.textContent = footnote();
    el.hidden = !el.textContent;
  });
}
