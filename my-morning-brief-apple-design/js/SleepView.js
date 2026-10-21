/**
 * 睡眠畫面：睡眠計算機（90 分鐘週期）+ 最近的睡眠 + 作息與提醒。
 * 「我現在要睡」直接用現在的時間算，預先選好上次選的週期數，按確認就記進睡眠紀錄（sleepLog.js）。
 * 「我要幾點起床」預設帶明早的起床時間，算出來的上床時間點一下就寫進今晚的就寢時間。
 * 早上那一塊（我起床了 → 中間有沒有醒來、怎麼醒的、精神）今日頁也有一份，是同一個 renderMorningCheck。
 * 資料/邏輯在 sleepCalculator.js／fixedSchedule.js／sleepReminder.js／sleepLog.js
 */

import { calcFromNow, calcFromWakeTime, formatTime, RECOMMENDED_CYCLES } from './sleepCalculator.js';
import { getSleepReminderConfig, setSleepReminderConfig } from './sleepReminder.js';
import { getWakeItem } from './fixedSchedule.js';
import { renderFixedScheduleCard, bindFixedSchedule } from './FixedScheduleView.js';
import {
  getSleepLog, logSleep, logWake, answerMorning, backToSleep, addWake, removeWake, morningState, editTimes,
  removeSleepEntry, nightOf, clockOf, hoursOf, minutesOf, awakeMinutesOf, wakeCountOf, isNap, WAKE_TYPES, ENERGY,
} from './sleepLog.js';

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 上次選了幾個週期，下次預先選好，按確認就好。是這支手機的使用習慣，不是紀錄，所以用 chenxu. 開頭
const LAST_CYCLES_KEY = 'chenxu.sleep.lastCycles';
const lastCycles = () => Number(localStorage.getItem(LAST_CYCLES_KEY)) || RECOMMENDED_CYCLES;

let mode = null; // null = 選擇模式畫面；'now' | 'wake'
let step = 'input'; // 'input' | 'results' | 'logged'（按了確認現在睡）
let loggedEntry = null;
let wakeTimeInput = '';
let bedTimeInput = ''; // 「我現在要睡」可以改成別的上床時間；空的就是現在
let calcResult = null;
let selectedCycles = null;
let editingLog = false;

const ICON_CHECK = '<svg class="sleep-option-check" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5,12.5 10,17 19,7.5"/></svg>';
const ICON_TRASH = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><polyline points="4,7 20,7"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></svg>';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const ICON_MOON = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>';
const ICON_SUN = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="7" y2="7"/><line x1="17" y1="17" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="7" y2="17"/><line x1="17" y1="7" x2="19.1" y2="4.9"/></svg>';

function renderModeSelector() {
  return `
    <div class="sleep-mode-cards">
      <button type="button" class="sleep-mode-card tint-indigo" data-action="pick-mode" data-mode="now">
        <span class="sleep-mode-icon">${ICON_MOON}</span>
        <h4>我現在要睡</h4>
        <p>算出起床時間</p>
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
          <h3 class="card-title">改上床時間</h3>
          <button type="button" class="close-btn" data-action="back-to-select" aria-label="換一種方式">&times;</button>
        </div>
        <label class="list-row">
          <span>上床時間</span>
          <input type="time" class="countdown-input" id="sleep-bed-time" value="${escapeHtml(bedTime)}">
        </label>
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
      <button type="button" class="btn-action btn-primary sleep-calc-btn" id="sleep-calc-btn">計算上床時間</button>
    </div>
  `;
}

function renderResultsPanel() {
  const isWakeMode = mode === 'wake'; // 結果是「建議上床時間」，可以直接點設成就寢提醒
  const bed = getSleepReminderConfig();

  const cardsHtml = calcResult.options
    .map((opt) => {
      const isSelected = opt.cycles === selectedCycles;
      const isRecommended = opt.cycles === RECOMMENDED_CYCLES;
      const dayLabelHtml = opt.label ? `<span class="sleep-option-day">・${opt.label}</span>` : '';
      return `
        <button type="button" class="sleep-option ${isRecommended ? 'is-recommended' : ''} ${isSelected ? 'is-selected' : ''}" data-action="pick-option" data-cycles="${opt.cycles}" data-time="${opt.time}" aria-pressed="${isSelected}">
          ${isRecommended ? '<span class="sleep-option-badge">推薦</span>' : ''}
          ${isSelected ? ICON_CHECK : ''}
          <time>${opt.time}${dayLabelHtml}</time>
          <span>${opt.cycles} 個週期 · ${opt.hours} 小時</span>
        </button>
      `;
    })
    .join('');

  const title = isWakeMode ? '建議上床時間' : `${bedTimeInput || '現在'}睡，建議起床時間`;
  return `
    <div class="card ${isWakeMode ? 'tint-orange' : 'tint-indigo'}">
      <div class="card-header">
        <h3 class="card-title">${title}</h3>
        ${isWakeMode
          ? '<span class="card-badge">每 90 分鐘一個週期</span>'
          : '<button type="button" class="section-action card-link" id="sleep-change-bed">改上床時間</button>'}
      </div>
      ${isWakeMode && bed.exists ? `<div class="sleep-results-subtitle">點一個，會設成今晚「${escapeHtml(bed.label)}」的時間</div>` : ''}
      <div class="sleep-options">${cardsHtml}</div>
      ${!isWakeMode ? `<button type="button" class="btn-action btn-primary sleep-calc-btn" id="sleep-confirm-btn" ${selectedCycles ? '' : 'disabled'}>${selectedCycles ? (bedTimeInput ? `確認 ${bedTimeInput} 睡` : '確認現在睡') : '先選一個起床時間'}</button>` : ''}
      <button type="button" class="btn-action sleep-recalc-btn" data-action="back-to-select">${isWakeMode ? '重新計算' : '取消'}</button>
    </div>
  `;
}

function renderLoggedPanel() {
  return `
    <div class="card tint-indigo">
      <div class="card-header">
        <h3 class="card-title">記下來了</h3>
      </div>
      <p class="sleep-logged-text">${clockOf(loggedEntry.bedAt)} 上床，預計 ${clockOf(loggedEntry.wakeAt)} 起床。晚安。</p>
      <button type="button" class="btn-action sleep-recalc-btn" id="sleep-done-btn">完成</button>
    </div>
  `;
}

const choiceGroup = (name, options, current) => `
  <div class="routine-mode-switch morning-choices">
    ${Object.entries(options).map(([value, label]) => `<button type="button" class="mode-btn ${String(current) === value ? 'is-active' : ''}" data-morning="${name}" data-value="${value}">${label}</button>`).join('')}
  </div>`;

/**
 * 早上那一塊：還沒起床 →「我起床了」；起床後 → 怎麼醒的、精神、中間有沒有醒來，按「完成」收起來。
 * 今日頁和睡眠頁共用。沒有要問的回傳空字串
 */
export function renderMorningCheck(log = getSleepLog()) {
  const state = morningState(new Date(), log);
  if (!state) return '';
  const { entry } = state;
  if (state.stage === 'wake') {
    return `
      <div class="list-row morning-row">
        <span>昨晚 ${clockOf(entry.bedAt)} 睡<small class="row-note">預計 ${clockOf(entry.wakeAt)} 起${wakeCountOf(entry) ? ` · 中間醒了 ${wakeCountOf(entry)} 次` : ''}</small></span>
        <button type="button" class="btn-action btn-primary" data-morning="woke">我起床了</button>
      </div>`;
  }
  const wakesHtml = (entry.wakes || []).map((w, i) => `
      <div class="list-row morning-wake">
        <span>${clockOf(w.at)} 醒來 → ${clockOf(w.back)} 又睡</span>
        <button type="button" class="countdown-delete" data-morning="remove-wake" data-value="${i}" aria-label="刪掉這次醒來">${ICON_TRASH}</button>
      </div>`).join('');
  return `
    <div class="morning-questions">
      <p class="morning-title">${clockOf(entry.wokeAt)} 起床，${hoursOf(entry)} 小時</p>
      <span class="morning-label">怎麼醒的</span>
      ${choiceGroup('wakeType', WAKE_TYPES, entry.wakeType)}
      <span class="morning-label">現在精神</span>
      ${choiceGroup('energy', ENERGY, entry.energy)}
      <span class="morning-label">中間有醒來又睡回去嗎（例如早上起來上廁所）</span>
      ${wakesHtml}
      <div class="morning-wake-add">
        <label><span>醒來</span><input type="time" class="countdown-input morning-wake-at"></label>
        <label><span>又睡著</span><input type="time" class="countdown-input morning-wake-back"></label>
        <button type="button" class="section-action" data-morning="add-wake">加入</button>
      </div>
      <button type="button" class="btn-action btn-primary btn-block" data-morning="done">完成</button>
      <button type="button" class="section-action" data-morning="back-to-sleep">按錯了，我現在又要睡回去</button>
    </div>`;
}

function dayLabelOf(entry) {
  const day = nightOf(entry);
  const [, m, d] = day.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(`${day}T12:00:00`).getDay()];
  return `${m}/${d}（${weekday}）${isNap(entry) ? '小睡' : '晚上'}`;
}

function noteOf(entry) {
  if (isNap(entry)) return [`${minutesOf(entry)} 分鐘`, entry.dozed ? '不小心睡著' : ''];
  const wakes = wakeCountOf(entry);
  return [
    `${hoursOf(entry)} 小時`,
    entry.wokeAt ? '' : '沒按起床',
    wakes ? `中間醒 ${wakes} 次${awakeMinutesOf(entry) ? `（${awakeMinutesOf(entry)} 分鐘）` : ''}` : '',
    WAKE_TYPES[entry.wakeType] || '',
    ENERGY[entry.energy] || '',
  ];
}

// 最近 7 天，新的在上面。本週摘要會把同樣這幾筆交給 Claude
function renderSleepLogCard() {
  const log = getSleepLog();
  const since = Date.now() - 7 * 86400000;
  const entries = log.filter((entry) => Date.parse(entry.bedAt) >= since).reverse();
  const rowsHtml = entries.map((entry) => {
    const end = clockOf(entry.wokeAt || entry.wakeAt);
    if (editingLog) {
      return `
        <div class="list-row sleep-edit-row">
          <span>${dayLabelOf(entry)}</span>
          <input type="time" class="countdown-input" data-action="sleep-edit" data-field="bed" data-id="${entry.id}" value="${clockOf(entry.bedAt)}" aria-label="${dayLabelOf(entry)}的上床時間">
          <input type="time" class="countdown-input" data-action="sleep-edit" data-field="wake" data-id="${entry.id}" value="${end}" aria-label="${dayLabelOf(entry)}的起床時間">
          <button type="button" class="countdown-delete" data-action="sleep-log-delete" data-id="${entry.id}" aria-label="刪除${dayLabelOf(entry)}這一筆">${ICON_TRASH}</button>
        </div>`;
    }
    return `
      <div class="list-row">
        <span>${dayLabelOf(entry)}<small class="row-note">${noteOf(entry).filter(Boolean).join(' · ')}</small></span>
        <span class="sleep-log-times">${clockOf(entry.bedAt)} → ${end}</span>
      </div>`;
  }).join('');

  const morningHtml = renderMorningCheck(log);
  return `
    <div class="section-head">
      <h2 class="section-title">最近的睡眠</h2>
      ${entries.length ? `<button type="button" class="section-action" id="sleep-log-edit-btn">${editingLog ? '完成' : '編輯'}</button>` : ''}
    </div>
    <div class="card">
      ${morningHtml}
      ${rowsHtml || (morningHtml ? '' : '<p class="list-footnote">還沒有紀錄</p>')}
    </div>
  `;
}

function renderView() {
  const container = document.getElementById('view-sleep');
  if (!container) return;

  // 「記下來了」那張只留到隔天：App 放在背景一整天再打開時，直接回到選擇畫面
  if (step === 'logged' && Date.now() - Date.parse(loggedEntry.bedAt) > 6 * 3600000) resetCalculator();

  let calculatorHtml;
  if (mode === null) {
    calculatorHtml = renderModeSelector();
  } else if (step === 'logged') {
    calculatorHtml = renderLoggedPanel();
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
      ${renderSleepLogCard()}
      ${renderFixedScheduleCard()}
    </main>
  `;

  bindEvents(container);
}

// 睡眠紀錄變了：今日頁那一塊也要跟著更新（app.js 聽這個事件）
function sleepChanged() {
  renderView();
  window.dispatchEvent(new CustomEvent('chenxu:sleep-changed'));
}

function resetCalculator() {
  mode = null;
  step = 'input';
  calcResult = null;
  selectedCycles = null;
  loggedEntry = null;
  bedTimeInput = '';
}

// 「我現在要睡」：不用再按一次計算，直接用現在的時間出結果，上次選的週期數先選好
function showNowResults(bed = new Date(), now = new Date()) {
  mode = 'now';
  calcResult = calcFromNow(bed, now);
  selectedCycles = lastCycles();
  step = 'results';
}

function bindEvents(container) {
  container.querySelectorAll('[data-action="pick-mode"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      bedTimeInput = '';
      if (btn.dataset.mode === 'now') {
        showNowResults();
      } else {
        mode = 'wake';
        // 預設就是作息表上明早的起床時間，不用每次重打
        if (!wakeTimeInput) wakeTimeInput = getWakeItem()?.time || '';
        step = 'input';
        calcResult = null;
        selectedCycles = null;
      }
      renderView();
    });
  });

  container.querySelectorAll('[data-action="back-to-select"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      resetCalculator();
      renderView();
    });
  });

  document.getElementById('sleep-change-bed')?.addEventListener('click', () => {
    step = 'input';
    renderView();
  });

  document.getElementById('sleep-calc-btn')?.addEventListener('click', () => {
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
      showNowResults(bed, now);
    } else {
      const input = document.getElementById('sleep-wake-time');
      if (!input.value) return;
      wakeTimeInput = input.value;
      calcResult = calcFromWakeTime(wakeTimeInput);
      selectedCycles = null;
      step = 'results';
    }
    renderView();
  });

  container.querySelectorAll('[data-action="pick-option"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedCycles = Number(btn.dataset.cycles);
      // 「我要幾點起床」算出來的是建議上床時間，點選直接套用成今晚的就寢時間
      if (mode === 'wake') {
        const reminderConfig = getSleepReminderConfig();
        setSleepReminderConfig(reminderConfig.enabled, btn.dataset.time);
      }
      renderView();
    });
  });

  document.getElementById('sleep-confirm-btn')?.addEventListener('click', () => {
    // 沒改上床時間的話，用按下去這一刻重算：算完拖了一陣子才按、或 App 在背景放到隔天再按，
    // 都不會記成當初的時間（隔天按的話還會蓋掉前一晚那筆）
    const result = bedTimeInput ? calcResult : calcFromNow(new Date());
    const option = result.options.find((opt) => opt.cycles === selectedCycles);
    if (!option) return;
    localStorage.setItem(LAST_CYCLES_KEY, String(option.cycles));
    loggedEntry = logSleep(result.now, option.at, option.cycles);
    step = 'logged';
    sleepChanged();
  });

  document.getElementById('sleep-done-btn')?.addEventListener('click', () => {
    resetCalculator();
    renderView();
  });

  document.getElementById('sleep-log-edit-btn')?.addEventListener('click', () => {
    editingLog = !editingLog;
    renderView();
  });

  container.querySelectorAll('[data-action="sleep-edit"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.dataset.field === 'bed') editTimes(input.dataset.id, input.value, null);
      else editTimes(input.dataset.id, null, input.value);
      sleepChanged();
    });
  });

  container.querySelectorAll('[data-action="sleep-log-delete"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeSleepEntry(btn.dataset.id);
      sleepChanged();
    });
  });

  bindFixedSchedule(container, renderView);
}

// 早上那一塊的按鈕在今日頁和睡眠頁都有，用同一個點擊處理
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-morning]');
    if (!btn) return;
    const state = morningState();
    if (!state) return;
    const { id } = state.entry;
    const action = btn.dataset.morning;
    if (action === 'woke') {
      logWake(id);
    } else if (action === 'back-to-sleep') {
      backToSleep(id);
    } else if (action === 'add-wake') {
      // 同一塊在今日頁和睡眠頁各有一份，從按鈕所在的那一份讀輸入框
      const box = btn.closest('.morning-questions');
      if (!addWake(id, box.querySelector('.morning-wake-at').value, box.querySelector('.morning-wake-back').value)) return;
    } else if (action === 'done') {
      answerMorning(id, { done: true });
    } else if (action === 'remove-wake') {
      removeWake(id, Number(btn.dataset.value));
    } else {
      answerMorning(id, { [action]: btn.dataset.value });
    }
    sleepChanged();
  });
}

export function renderSleepView() {
  renderView();
}
