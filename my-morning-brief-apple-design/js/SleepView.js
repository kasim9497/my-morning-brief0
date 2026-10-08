/**
 * 睡眠畫面：90 分鐘週期計算機 + 就寢提醒
 * 資料/邏輯在 sleepCalculator.js／sleepReminder.js，這裡只負責畫面跟事件綁定
 */

import { calcFromNow, calcFromWakeTime, formatTime, RECOMMENDED_CYCLES } from './sleepCalculator.js';
import {
  getSleepReminderConfig,
  setSleepReminderConfig,
  requestNotificationPermission,
  permissionHelp,
  canRemindInBackground,
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
let bedTimeInput = ''; // 「我現在要睡」可以改成別的上床時間；空的就是現在
let calcResult = null;
let selectedCycles = null;

const ICON_MOON = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>';
const ICON_SUN = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="7" y2="7"/><line x1="17" y1="17" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="7" y2="17"/><line x1="17" y1="7" x2="19.1" y2="4.9"/></svg>';

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  return formatTime(new Date(2000, 0, 1, h, m + minutes));
}

function renderModeSelector() {
  return `
    <div class="sleep-mode-cards">
      <button type="button" class="sleep-mode-card tint-indigo" data-action="pick-mode" data-mode="now">
        <span class="sleep-mode-icon">${ICON_MOON}</span>
        <h4>我現在要睡</h4>
        <p>或指定幾點睡，算出起床時間</p>
      </button>
      <button type="button" class="sleep-mode-card tint-orange" data-action="pick-mode" data-mode="wake">
        <span class="sleep-mode-icon">${ICON_SUN}</span>
        <h4>我要幾點起床</h4>
        <p>算出適合的上床時間</p>
      </button>
    </div>
  `;
}

function renderInputPanel() {
  if (mode === 'now') {
    const bedTime = bedTimeInput || formatTime(new Date());
    return `
      <div class="card tint-indigo">
        <div class="card-header">
          <h3 class="card-title">我現在要睡</h3>
          <button type="button" class="close-btn" data-action="back-to-select" aria-label="換一種方式">&times;</button>
        </div>
        <label class="list-row">
          <span>上床時間<small class="row-note">預設是現在，可以改</small></span>
          <input type="time" class="countdown-input" id="sleep-bed-time" value="${escapeHtml(bedTime)}">
        </label>
        <div class="list-row">
          <span>預估入睡時間</span>
          <time id="sleep-asleep-time">${addMinutes(bedTime, 15)}</time>
        </div>
        <button type="button" class="btn-action btn-primary sleep-calc-btn" id="sleep-calc-btn">計算起床時間</button>
      </div>
    `;
  }

  return `
    <div class="card tint-orange">
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
    <div class="card ${isWakeMode ? 'tint-orange' : 'tint-indigo'}">
      <div class="card-header">
        <h3 class="card-title">${subtitle}</h3>
        <span class="card-badge">每 90 分鐘一個週期</span>
      </div>
      ${isWakeMode ? `<div class="sleep-results-subtitle">點一個時間，會設成「${escapeHtml(getSleepReminderConfig().label)}」的時間</div>` : ''}
      <div class="sleep-options">${cardsHtml}</div>
      <button type="button" class="btn-action sleep-recalc-btn" id="sleep-recalc-btn">重新計算</button>
    </div>
  `;
}

function renderReminderCard() {
  const reminderConfig = getSleepReminderConfig();
  if (!reminderConfig.exists) {
    return `
    <div class="section-head">
      <h2 class="section-title">就寢提醒</h2>
    </div>
    <div class="card">
      <p class="list-footnote">「設定」的作息時間裡沒有就寢的項目。新增一項名稱裡有「就寢」的時間，這裡就能設提醒。</p>
    </div>
  `;
  }
  return `
    <div class="section-head">
      <h2 class="section-title">就寢提醒</h2>
    </div>
    <div class="card">
      <label class="list-row">
        <span>開啟提醒</span>
        <input type="checkbox" class="ios-switch" id="sleep-reminder-toggle" ${reminderConfig.enabled ? 'checked' : ''}>
      </label>
      <label class="list-row">
        <span>${escapeHtml(reminderConfig.label)}</span>
        <input type="time" class="countdown-input" id="sleep-reminder-time" value="${escapeHtml(reminderConfig.bedTime)}">
      </label>
      <p class="list-footnote">和「設定」裡作息時間的「${escapeHtml(reminderConfig.label)}」是同一個，改這裡那邊也會跟著變。${canRemindInBackground() ? '' : 'iPhone 要先把晨序「加入主畫面」才收得到提醒。'}</p>
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
    <main class="container card-stack">
      <div class="section-head">
        <h2 class="section-title">睡眠計算機</h2>
      </div>
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
      bedTimeInput = '';
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
        const now = new Date();
        const value = document.getElementById('sleep-bed-time').value;
        let bed = now;
        // 改過時間：取下一次到那個時間的時刻（已經過了就算明天）
        if (value && value !== formatTime(now)) {
          const [h, m] = value.split(':').map(Number);
          bed = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
          if (bed < now) bed.setDate(bed.getDate() + 1);
          bedTimeInput = value;
        } else {
          bedTimeInput = '';
        }
        calcResult = calcFromNow(bed, now);
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

  const bedInput = document.getElementById('sleep-bed-time');
  if (bedInput) {
    bedInput.addEventListener('input', () => {
      if (bedInput.value) document.getElementById('sleep-asleep-time').textContent = addMinutes(bedInput.value, 15);
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
          window.alert(permissionHelp(permission));
          return;
        }
      }
      setSleepReminderConfig(reminderToggle.checked, reminderTimeInput.value);
    });

    reminderTimeInput.addEventListener('change', () => {
      setSleepReminderConfig(reminderToggle.checked, reminderTimeInput.value);
    });
  }
}

export function renderSleepView() {
  renderView();
}
