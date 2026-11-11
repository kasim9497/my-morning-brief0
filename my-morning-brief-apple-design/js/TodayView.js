/**
 * 今日頁最上面那張日曆（日期、宜／忌、三欄：睡眠／題庫／作息）、最近七晚的睡眠、今日作息那一格。
 * 內容怎麼算在 dailyBrief.js，這裡只負責把手機上的紀錄餵進去、畫出來、綁事件。
 * 天氣、運勢、匯率、題庫、語錄那幾張卡還是 app.js 畫的。
 */

import { composeBrief, sleepSummary, sleepInsight, lunarText, streakOf, dayKey, logicalToday } from './dailyBrief.js';
import { getSleepLog } from './sleepLog.js';
import { getQuizDays } from './quizHistory.js';
import { getDueMistakes } from './quizMistakes.js';
import { getTasksForDate, getTodayStr, summarizeTasks, toggleDone } from './taskEngine.js';
import { getCountdowns } from './countdown.js';
import { getFixedSchedule, getBedItem } from './fixedSchedule.js';
import { getMediaItems } from './mediaTracker.js';
import { switchTab, syncThemeColor } from './tabs.js';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
// 每天都有、不用特別提醒的兩項；其他的才會出現在「宜」裡
const EVERYDAY_TASKS = ['supplement', 'watch'];
// 今天這一頁看過了沒（看過就不再播撕日曆）。這支手機的狀態，不是紀錄
const SEEN_KEY = 'chenxu.leafSeen';

let weather = null;
let greeting = '';

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** 平日綠、週末紅，跟台灣的日曆一樣 */
const inkOf = (date) => (date.getDay() === 0 || date.getDay() === 6 ? 'red' : 'green');

/**
 * 有紀錄的事自動算完成，不用再自己打勾。目前只有一項對得上：今天有記追劇／讀書進度，
 * 「追劇：至少看完一集」就打勾。回傳有沒有改到
 */
function applyAutoDone(todayStr) {
  const loggedToday = getMediaItems().some((item) => item.lastLoggedDate === todayStr);
  if (!loggedToday) return false;
  const watch = getTasksForDate(todayStr).find((task) => task.defId === 'watch' && task.status === 'pending');
  return watch ? toggleDone(todayStr, watch.instanceId) : false;
}

/** 今日頁需要的所有數字，一次算好 */
function gather(now = new Date()) {
  const today = logicalToday(now);
  const todayStr = getTodayStr();
  applyAutoDone(todayStr);

  const sleep = sleepSummary(getSleepLog(), now);
  const quizDays = getQuizDays();
  const quizToday = quizDays[dayKey(now)] || null;
  const quiz = {
    doneToday: !!quizToday,
    today: quizToday,
    due: getDueMistakes().length,
    streak: streakOf(Object.keys(quizDays), new Date(now.getFullYear(), now.getMonth(), now.getDate())),
  };

  const tasks = getTasksForDate(todayStr);
  // 兩件有紀錄的事當成自動完成的項目，跟要自己打勾的任務算在一起
  const auto = [
    { label: '記錄睡眠', done: !!sleep.last },
    { label: '題庫十題', done: quiz.doneToday },
  ];
  const taskSummary = summarizeTasks(tasks);
  const routine = {
    auto,
    done: taskSummary.done + auto.filter((a) => a.done).length,
    total: taskSummary.total + auto.length,
  };

  const schedule = getFixedSchedule();
  const curfew = schedule.find((item) => item.id === 'phoneCurfew');
  const bed = getBedItem(now);
  const brief = composeBrief({
    sleep,
    targetBed: bed ? bed.time : null,
    curfew: curfew ? curfew.time : null,
    weather,
    quiz,
    pendingTasks: tasks.filter((t) => t.status === 'pending' && !EVERYDAY_TASKS.includes(t.defId)).map((t) => t.label),
    countdowns: getCountdowns(),
  });
  return { now, today, sleep, quiz, routine, brief };
}

function leafDateHtml(date) {
  return `
    <div class="leaf-date">
      <span class="leaf-day">${date.getDate()}</span>
      <div class="leaf-side">
        <span class="leaf-month">${date.getMonth() + 1}<small>月</small></span>
        <span class="leaf-year">${date.getFullYear()}</span>
      </div>
    </div>`;
}

function tallyCell(target, label, value, unit, sub) {
  return `
    <button type="button" class="tally-cell" data-tally="${target}">
      <span class="tally-label">${label}</span>
      <span class="tally-num">${value}${unit ? `<small>${unit}</small>` : ''}</span>
      <span class="tally-sub">${sub}</span>
    </button>`;
}

function renderLeaf(data) {
  const el = document.getElementById('today-leaf');
  if (!el) return;
  const { now, sleep, quiz, routine, brief } = data;
  document.body.dataset.ink = inkOf(now);
  syncThemeColor();

  const row = (mark, kind, items) => (items.length
    ? `<div class="advice-row"><dt class="advice-mark advice-${kind}">${mark}</dt><dd>${items.map(escapeHtml).join('<span class="advice-dot" aria-hidden="true"></span>')}</dd></div>`
    : '');

  const left = routine.total - routine.done;
  el.innerHTML = `
    <header class="leaf-band">
      <span>${escapeHtml(lunarText(now)) || `${now.getFullYear()} 年`}</span>
      <span>星期${WEEKDAYS[now.getDay()]}</span>
    </header>
    <div class="leaf-face">
      ${greeting ? `<p class="leaf-greeting">${escapeHtml(greeting)}</p>` : ''}
      ${leafDateHtml(now)}
    </div>
    <div class="leaf-tear" aria-hidden="true"></div>
    <div class="leaf-brief">
      <p class="leaf-lead">${escapeHtml(brief.lead)}</p>
      <dl class="leaf-advice">
        ${row('宜', 'yi', brief.yi)}
        ${row('忌', 'ji', brief.ji)}
      </dl>
    </div>
    <div class="tally">
      ${tallyCell('sleep', '睡眠',
        sleep.lastHours === null ? '—' : sleep.lastHours, sleep.lastHours === null ? '' : '小時',
        sleep.streak ? `連續記錄 ${sleep.streak} 晚` : '昨晚沒有紀錄')}
      ${tallyCell('quiz', '題庫',
        quiz.today ? quiz.today.score : '—', quiz.today ? `／${quiz.today.total}` : '',
        quiz.streak ? `連續 ${quiz.streak} 天` : '今天還沒做')}
      ${tallyCell('routine', '作息',
        routine.done, `／${routine.total}`,
        left ? `還剩 ${left} 項` : '今天都做完了')}
    </div>
  `;

  el.querySelectorAll('[data-tally]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tally;
      if (target === 'sleep') return switchTab('sleep');
      const card = document.getElementById(target === 'quiz' ? 'quiz-card' : 'routine-card');
      if (!card) return undefined;
      if (target === 'routine') card.querySelector('details').open = true;
      card.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return undefined;
    });
  });
}

/** 每天第一次打開：昨天那一頁蓋在上面，撕掉，露出今天。開了「減少動態效果」就不播 */
export function playTearOff(now = new Date()) {
  const el = document.getElementById('today-leaf');
  if (!el || !el.querySelector('.leaf-face')) return;
  const key = dayKey(now);
  let seen = null;
  try {
    seen = localStorage.getItem(SEEN_KEY);
    localStorage.setItem(SEEN_KEY, key);
  } catch (e) {
    return;
  }
  if (seen === key || seen === null) return; // 今天看過了；第一次用也不播（沒有「昨天那一頁」）
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const old = document.createElement('div');
  old.className = 'leaf-old';
  old.dataset.ink = inkOf(yesterday);
  old.setAttribute('aria-hidden', 'true');
  old.innerHTML = leafDateHtml(yesterday);
  el.querySelector('.leaf-face').append(old);
  old.addEventListener('animationend', () => old.remove(), { once: true });
  // 保險：動畫事件沒來（頁面在背景）也要把這一頁拿掉，不然會一直蓋住今天的日期
  setTimeout(() => old.remove(), 2500);
}

function renderSleepCard(data) {
  const el = document.getElementById('today-sleep-content');
  if (!el) return;
  const { sleep } = data;
  if (!sleep.recorded) {
    el.innerHTML = `
      <p class="sheet-note">還沒有睡眠紀錄。睡前到「睡眠」按「確認現在睡」，這裡就會開始累積。</p>
      <button type="button" class="section-action" data-goto-tab="sleep">去睡眠頁</button>`;
  } else {
    const TOP = 10; // 長條圖的頂端是 10 小時
    const TARGET = 7.5;
    const bars = sleep.series.map((night, i) => {
      const height = night.hours === null ? 0 : Math.min(100, (night.hours / TOP) * 100);
      const label = `${night.date.getMonth() + 1}月${night.date.getDate()}日晚上：${night.hours === null ? '沒有紀錄' : `${night.hours} 小時`}`;
      return `
        <div class="night ${night.hours === null ? 'is-missing' : ''} ${i === 6 ? 'is-last' : ''}" role="img" aria-label="${label}">
          <span class="night-bar" style="height:${height}%">${night.hours === null ? '' : `<b>${night.hours}</b>`}</span>
        </div>`;
    }).join('');
    const days = sleep.series.map((night, i) => `<span class="${i === 6 ? 'is-last' : ''}">${WEEKDAYS[night.date.getDay()]}</span>`).join('');
    el.innerHTML = `
      <div class="nights">
        <div class="nights-plot" style="--target:${(TARGET / TOP) * 100}%">
          <span class="nights-target" aria-hidden="true"><i>${TARGET} 小時</i></span>
          ${bars}
        </div>
        <div class="nights-days" aria-hidden="true">${days}</div>
      </div>
      <p class="sheet-note">${escapeHtml(sleepInsight(sleep))}</p>`;
  }
  el.querySelector('[data-goto-tab]')?.addEventListener('click', () => switchTab('sleep'));
}

function renderRoutineCard(data) {
  const summary = document.getElementById('routine-summary');
  const autoList = document.getElementById('routine-auto');
  if (!summary || !autoList) return;
  const { routine } = data;
  const left = routine.total - routine.done;
  summary.innerHTML = `<span>今日作息</span><span class="disclosure-hint">${left ? `還剩 ${left} 項` : '都做完了'}<svg class="disclosure-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,5 16,12 9,19"/></svg></span>`;
  autoList.innerHTML = routine.auto.map((item) => `
    <div class="auto-row ${item.done ? 'is-done' : ''}">
      <span class="auto-mark" aria-hidden="true"></span>
      <span class="auto-label">${item.label}</span>
      <span class="auto-tag">${item.done ? '已自動完成' : '做了會自動打勾'}</span>
    </div>`).join('');
}

/** 抓到今天的天氣之後給進來，「宜」才寫得出帶傘、帶外套 */
export function setTodayWeather(value) {
  weather = value && !value.isFallback ? value : null;
}

/** 問候語（午安，Kasim）放在日曆上 */
export function setTodayGreeting(text) {
  greeting = text;
}

export function renderTodayView() {
  const data = gather();
  renderLeaf(data);
  renderSleepCard(data);
  renderRoutineCard(data);
}
