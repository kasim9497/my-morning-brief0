/**
 * 睡眠畫面：90 分鐘週期計算機 + 就寢提醒
 * 資料/邏輯在 sleepCalculator.js／sleepReminder.js，這裡只負責畫面跟事件綁定
 */

import { calcFromNow, calcFromWakeTime, formatTime, RECOMMENDED_CYCLES } from './sleepCalculator.js';
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

let mode = null; // null = 選擇模式畫面；'now' | 'wake'
let step = 'input'; // 'input' | 'results'
let wakeTimeInput = '';
let calcResult = null;
let selectedCycles = null;

function renderModeSelector() {
  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">睡眠計算機</h3>
        <span class="card-badge">90 分鐘週期</span>
      </div>
      <div class="sleep-mode-select-title">你想要怎麼計算？</div>
      <div class="sleep-mode-cards">
        <button type="button" class="sleep-mode-card" data-action="pick-mode" data-mode="now">
          <span class="sleep-mode-icon">🌙</span>
          <h4>我現在要睡</h4>
          <p>找適合的起床時間</p>
        </button>
        <button type="button" class="sleep-mode-card" data-action="pick-mode" data-mode="wake">
          <span class="sleep-mode-icon">☀️</span>
          <h4>我要幾點起床</h4>
          <p>找適合的入睡時間</p>
        </button>
      </div>
    </div>
  `;
}

function renderInputPanel() {
  if (mode === 'now') {
    const now = new Date();
    const sleepTime = new Date(now.getTime() + 15 * 60000);
    return `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">我現在要睡</h3>
          <button type="button" class="close-btn" data-action="back-to-select" aria-label="換一種方式">&times;</button>
        </div>
        <div class="sleep-time-row">
          <span>現在時間</span>
          <time>${formatTime(now)}</time>
        </div>
        <div class="sleep-time-row">
          <span>預估入睡時間</span>
          <time>${formatTime(sleepTime)}</time>
        </div>
        <button type="button" class="btn-action btn-primary sleep-calc-btn" id="sleep-calc-btn">計算起床時間</button>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">我要幾點起床</h3>
        <button type="button" class="close-btn" data-action="back-to-select" aria-label="換一種方式">&times;</button>
      </div>
      <div class="sleep-calc-input-row">
        <input type="time" class="countdown-input" id="sleep-wake-time" value="${escapeHtml(wakeTimeInput)}">
      </div>
      <button type="button" class="btn-action btn-primary sleep-calc-btn" id="sleep-calc-btn">計算入睡時間</button>
    </div>
  `;
}

function renderResultsPanel() {
  const isWakeMode = mode === 'wake'; // 結果是「建議上床時間」，可以直接點設成就寢提醒
  const subtitle = isWakeMode ? '建議上床時間' : '建議起床時間';

  const cardsHtml = calcResult.options
    .map((opt) => {
      const isSelected = opt.cycles === selectedCycles;
      const dayLabelHtml = opt.label ? `<span class="sleep-option-day">・${opt.label}</span>` : '';
      return `
        <button type="button" class="sleep-option ${opt.cycles === RECOMMENDED_CYCLES ? 'is-recommended' : ''} ${isSelected ? 'is-selected' : ''}" data-action="pick-cycle" data-cycles="${opt.cycles}" data-time="${opt.time}">
          ${opt.cycles === RECOMMENDED_CYCLES ? '<span class="sleep-option-badge">推薦</span>' : ''}
          <time>${opt.time}${dayLabelHtml}</time>
          <span>${opt.hours} 小時</span>
          <span>${opt.cycles} 個睡眠週期</span>
        </button>
      `;
    })
    .join('');

  return `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">建議時間</h3>
        <span class="card-badge">根據 90 分鐘睡眠週期計算</span>
      </div>
      <div class="sleep-results-subtitle">${subtitle}${isWakeMode ? '，點一下直接設成就寢提醒時間' : ''}</div>
      <div class="sleep-options">${cardsHtml}</div>
      <button type="button" class="btn-action sleep-recalc-btn" id="sleep-recalc-btn">重新計算</button>
    </div>
  `;
}

function renderReminderCard() {
  const reminderConfig = getSleepReminderConfig();
  return `
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
  `;
}

function renderView() {
  const container = document.getElementById('view-sleep');
  if (!container) return;

  let calculatorHtml;
  if (mode === null) {
    calculatorHtml = renderModeSelector();
  } else if (step === 'input') {
    calculatorHtml = renderInputPanel();
  } else {
    calculatorHtml = renderResultsPanel();
  }

  container.innerHTML = `
    <main class="container">
      ${calculatorHtml}
      ${renderReminderCard()}
    </main>
  `;

  bindEvents(container);
}

function bindEvents(container) {
  container.querySelectorAll('[data-action="pick-mode"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      step = 'input';
      calcResult = null;
      selectedCycles = null;
      renderView();
    });
  });

  container.querySelectorAll('[data-action="back-to-select"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mode = null;
      step = 'input';
      calcResult = null;
      selectedCycles = null;
      renderView();
    });
  });

  const calcBtn = document.getElementById('sleep-calc-btn');
  if (calcBtn) {
    calcBtn.addEventListener('click', () => {
      if (mode === 'now') {
        calcResult = calcFromNow();
      } else {
        const input = document.getElementById('sleep-wake-time');
        if (!input.value) return;
        wakeTimeInput = input.value;
        calcResult = calcFromWakeTime(wakeTimeInput);
      }
      selectedCycles = null;
      step = 'results';
      renderView();
    });
  }

  const recalcBtn = document.getElementById('sleep-recalc-btn');
  if (recalcBtn) {
    recalcBtn.addEventListener('click', () => {
      step = 'input';
      calcResult = null;
      selectedCycles = null;
      renderView();
    });
  }

  container.querySelectorAll('[data-action="pick-cycle"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedCycles = Number(btn.dataset.cycles);
      // 「我要幾點起床」模式算出來的是建議上床時間，點選可以直接套用成就寢提醒時間；
      // 「我現在要睡」模式算出來的是建議起床時間，這裡沒有起床提醒功能，點選只做選取
      if (mode === 'wake') {
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
