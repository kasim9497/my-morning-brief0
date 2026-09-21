/**
 * 睡眠畫面：90 分鐘週期計算機 + 就寢提醒
 * 資料/邏輯在 sleepCalculator.js／sleepReminder.js，這裡只負責畫面跟事件綁定
 */

import { suggestBedtimes, suggestWakeTimes } from './sleepCalculator.js';
import {
  getSleepReminderConfig,
  setSleepReminderConfig,
  requestNotificationPermission,
} from './sleepReminder.js';

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let sleepCalcMode = 'wake'; // 'wake' = 輸入想起床的時間；'bed' = 輸入要上床的時間
let sleepCalcInputTime = '';
let sleepCalcResults = null; // suggestBedtimes()／suggestWakeTimes() 的結果
let selectedCycles = null; // 使用者點選的那一列的 cycles 值，用來畫「已選取」樣式

function renderResultsHtml() {
  if (!sleepCalcResults) return '';

  const isWakeMode = sleepCalcMode === 'wake'; // 結果是「建議上床時間」，可以直接點設成提醒時間
  const title = isWakeMode ? '建議上床時間' : '建議起床時間';

  const rows = sleepCalcResults
    .map((r) => {
      const isSelected = r.cycles === selectedCycles;
      return `
        <button type="button" class="sleep-result-row ${isSelected ? 'is-selected' : ''}" data-action="pick-cycle" data-cycles="${r.cycles}" data-time="${r.time}">
          <span class="sleep-result-cycles">${r.cycles} 個週期・${r.hours} 小時</span>
          <span class="sleep-result-time">${r.time}</span>
        </button>
      `;
    })
    .join('');

  return `
    <div class="sleep-results">
      <div class="sleep-results-title">${title}（已含 15 分鐘平均入睡時間，點一下選取${isWakeMode ? '／直接設成就寢提醒時間' : ''}）</div>
      <div class="sleep-result-list">${rows}</div>
    </div>
  `;
}

function renderView() {
  const container = document.getElementById('view-sleep');
  if (!container) return;

  const reminderConfig = getSleepReminderConfig();

  container.innerHTML = `
    <main class="container">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">睡眠計算機</h3>
          <span class="card-badge">90 分鐘週期</span>
        </div>
        <div class="routine-mode-switch">
          <button type="button" class="mode-btn ${sleepCalcMode === 'wake' ? 'is-active' : ''}" data-action="sleep-mode" data-mode="wake">我想幾點起床</button>
          <button type="button" class="mode-btn ${sleepCalcMode === 'bed' ? 'is-active' : ''}" data-action="sleep-mode" data-mode="bed">我現在要睡了</button>
        </div>
        <div class="sleep-calc-input-row">
          <input type="time" class="countdown-input" id="sleep-calc-time" value="${escapeHtml(sleepCalcInputTime)}">
          <button type="button" class="btn-action btn-primary" id="sleep-calc-btn">計算</button>
        </div>
        ${renderResultsHtml()}
      </div>

      <div class="card" style="margin-top: 1.25rem;">
        <div class="card-header">
          <h3 class="card-title">就寢提醒</h3>
          <span class="card-badge">瀏覽器通知</span>
        </div>
        <div class="sleep-reminder-box">
          <label class="sleep-reminder-label">
            <input type="checkbox" id="sleep-reminder-toggle" ${reminderConfig.enabled ? 'checked' : ''}>
            <span>到了就寢時間跳瀏覽器通知提醒我（僅限這個分頁開著時，PWA 純前端沒辦法背景推播）</span>
          </label>
          <input type="time" class="countdown-input" id="sleep-reminder-time" value="${escapeHtml(reminderConfig.bedTime)}">
        </div>
      </div>
    </main>
  `;

  container.querySelectorAll('[data-action="sleep-mode"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sleepCalcMode = btn.dataset.mode;
      sleepCalcResults = null;
      selectedCycles = null;
      renderView();
    });
  });

  const calcBtn = document.getElementById('sleep-calc-btn');
  if (calcBtn) {
    calcBtn.addEventListener('click', () => {
      const timeInput = document.getElementById('sleep-calc-time');
      if (!timeInput.value) return;
      sleepCalcInputTime = timeInput.value;
      selectedCycles = null;
      sleepCalcResults = sleepCalcMode === 'wake'
        ? suggestBedtimes(sleepCalcInputTime)
        : suggestWakeTimes(sleepCalcInputTime);
      renderView();
    });
  }

  container.querySelectorAll('[data-action="pick-cycle"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedCycles = Number(btn.dataset.cycles);
      // 「我想幾點起床」模式算出來的是建議上床時間，點選可以直接套用成就寢提醒時間；
      // 「我現在要睡了」模式算出來的是建議起床時間，這裡沒有起床提醒功能，點選只是標記選取
      if (sleepCalcMode === 'wake') {
        const reminderConfig = getSleepReminderConfig();
        setSleepReminderConfig(reminderConfig.enabled, btn.dataset.time);
      }
      renderView();
    });
  });

  const reminderToggle = document.getElementById('sleep-reminder-toggle');
  const reminderTimeInput = document.getElementById('sleep-reminder-time');
  if (reminderToggle && reminderTimeInput) {
    reminderToggle.addEventListener('change', async () => {
      if (reminderToggle.checked) {
        const permission = await requestNotificationPermission();
        if (permission !== 'granted') {
          reminderToggle.checked = false;
          window.alert('需要允許瀏覽器通知權限，提醒才能運作。');
          return;
        }
      }
      setSleepReminderConfig(reminderToggle.checked, reminderTimeInput.value);
    });

    reminderTimeInput.addEventListener('change', () => {
      if (reminderToggle.checked) {
        setSleepReminderConfig(true, reminderTimeInput.value);
      }
    });
  }
}

export function renderSleepView() {
  renderView();
}
