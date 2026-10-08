/**
 * 晨序 (Chénxù) - Personal AI Life Scheduling System — Application Logic & Component Rendering
 */

import { dataService } from './services/dataService.js';
import { initTabs, switchTab, setTodayTitle } from './tabs.js';
import { slideIn } from './motion.js';
import { recordMistake, resolveMistake, getDueMistakes, getMistakeCount, REVIEW_GAPS } from './quizMistakes.js';
import { renderTaskList } from './TaskListView.js';
import { renderCalendarView } from './CalendarView.js';
import { renderCountdownView, renderCountdownSummaryInto } from './CountdownView.js';
import { renderSettingsView } from './SettingsView.js';
import { renderSleepView } from './SleepView.js';
import { scheduleReminderIfEnabled } from './sleepReminder.js';
import { initChatBox } from './ChatBoxView.js';
import { daysSinceBackup, BACKUP_REMINDER_DAYS } from './backup.js';
import { startCloudBackup, getCloudBackupState } from './cloudBackup.js';

// Global Quiz State
// mode：'daily' 是今天的題目，'review' 是從錯題本拿出來複習
let quizState = {
  mode: 'daily',
  finished: false, // 今天的題目（和接著的錯題）都跑完了
  dailyScore: 0,
  dailyQuestions: [],
  questions: [],
  currentIndex: 0,
  userAnswers: {},
  score: 0,
  completed: false
};

document.addEventListener('DOMContentLoaded', async () => {
  console.log("Initializing 晨序 (Personal AI Life Scheduling System)...");
  initTabs();
  setupSectionLinks();
  renderBackupReminder();
  setupInstantPressListeners();
  setupScrollShadow();
  renderTaskList();
  renderCalendarView();
  renderCountdownView();
  renderCountdownSummaryInto(document.getElementById('today-countdown-widget-content'));
  renderSettingsView();
  renderSleepView();
  scheduleReminderIfEnabled();
  startCloudBackup();
  // 雲端備份成功後，今日頁那張「還沒備份」的提醒就不用再出現
  window.addEventListener('chenxu:cloud-backup', renderBackupReminder);
  setupCalendarTabRefresh();
  await loadAllBriefData();
  setupEventListeners();
});

/**
 * §1: Respond on pointerdown — instant press feedback
 * Adds .is-pressing immediately on press, removes on release/leave.
 * 涵蓋全站所有可點元件，不是只有 .btn-action/.option-btn——原生 :active
 * 在部分行動瀏覽器不保證第一時間觸發，這裡用 JS 補一層保底，新增可點元件
 * 記得把 class 加進這個 selector，不然按下去的回饋沒有保證
 */
const PRESSABLE_SELECTOR = [
  '.btn-action',
  '.option-btn',
  '.task-check',
  '.weekday-toggle',
  '.mode-btn',
  '.cal-week-cell',
  '.cal-month-cell',
  '.sleep-mode-card',
  '.sleep-option',
  '.countdown-delete',
  '.tab-item',
  '.close-btn',
  '.nav-btn',
  '.icon-btn',
  '.section-action',
].join(', ');

function setupInstantPressListeners() {
  // Delegate on document so it works for dynamically rendered content too
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest(PRESSABLE_SELECTOR);
    if (btn && !btn.disabled) {
      btn.classList.add('is-pressing');
    }
  });
  const clearPress = (e) => {
    const btn = e.target.closest(PRESSABLE_SELECTOR);
    if (btn) btn.classList.remove('is-pressing');
    // Also clear any lingering ones (pointer captured elsewhere)
    document.querySelectorAll('.is-pressing').forEach(el => el.classList.remove('is-pressing'));
  };
  document.addEventListener('pointerup', clearPress);
  document.addEventListener('pointercancel', clearPress);
}

/**
 * 每次切到「週曆」tab 時重新渲染，避免在「今日」頁打勾後週曆顯示的進度沒同步
 */
function setupCalendarTabRefresh() {
  const btn = document.querySelector('.tab-item[data-view="calendar"]');
  if (btn) btn.addEventListener('click', renderCalendarView);
  // 「今日」也一樣：在設定頁新增、刪除或改了作息之後，切回來要看到新的任務清單
  const todayBtn = document.querySelector('.tab-item[data-view="today"]');
  if (todayBtn) todayBtn.addEventListener('click', () => { renderTaskList(); renderBackupReminder(); });
}

/**
 * 太久沒備份時，在今日頁最上面提醒一次。資料只存在這支手機，掉了就沒了
 */
function renderBackupReminder() {
  const card = document.getElementById('backup-reminder');
  if (!card) return;
  const days = daysSinceBackup();
  card.hidden = days !== null && days < BACKUP_REMINDER_DAYS;
  const cloudOn = getCloudBackupState().on;
  document.getElementById('backup-reminder-text').textContent = !cloudOn
    ? '你的紀錄只存在這支手機裡，還沒有備份'
    : days === null ? '雲端備份還沒有成功過' : `雲端備份已經 ${days} 天沒成功了`;
  document.getElementById('backup-now-btn').textContent = cloudOn ? '去看看' : '開啟雲端備份';
}

/**
 * 今日頁區塊標題旁的藍色文字按鈕（編輯／管理）：跳到對應的分頁
 */
function setupSectionLinks() {
  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.goto));
  });
}

/**
 * 大標題捲到導覽列底下之後，導覽列加上 .scrolled（浮出玻璃底和置中的小標題）
 */
function setupScrollShadow() {
  const masthead = document.querySelector('.masthead');
  if (!masthead) return;
  const onScroll = () => {
    masthead.classList.toggle('scrolled', window.scrollY > 56);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/**
 * Load and render all morning brief components
 */
/**
 * 資料是哪一天產生的。今天的回傳 null；不是今天的回傳要標在卡片上的字。
 * 資料檔只要抓得到就會顯示，所以每日更新失敗時畫面上其實是昨天的天氣和匯率，要講清楚。
 */
function staleLabelFor(generatedAt) {
  const made = new Date(generatedAt);
  if (Number.isNaN(made.getTime())) return null;
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(made)) / 86400000);
  if (days <= 0) return null;
  return days === 1 ? '昨天的資料' : `${made.getMonth() + 1}月${made.getDate()}日的資料`;
}

// 一張卡片的資料壞掉，不要連累後面的卡片一起空白
async function renderSafely(name, load, render) {
  try {
    render(await load());
  } catch (err) {
    console.error(`[brief] ${name} 畫不出來：`, err);
  }
}

async function loadAllBriefData() {
  try {
    const headerData = await dataService.getHeaderInfo();
    renderHeader(headerData);

    // 抓不到今天的資料檔：需要資料的區塊整個收起來，只留一列說明和重試，不拿範例內容充數
    const offline = !!headerData.meta.isStale;
    document.getElementById('stale-notice').hidden = !offline;
    document.querySelectorAll('[data-needs-data]').forEach((el) => { el.hidden = offline; });
    if (offline) return;

    const staleLabel = staleLabelFor(headerData.meta.generatedAt);

    await renderSafely('天氣', () => dataService.getWeather(), (w) => {
      renderWeather(w);
      if (staleLabel) document.getElementById('weather-card-badge').textContent = staleLabel;
    });
    // 昨天的運勢今天沒有用，直接不顯示
    document.getElementById('horoscope-card').hidden = !!staleLabel;
    if (!staleLabel) await renderSafely('運勢', () => dataService.getHoroscope(), renderHoroscope);
    await renderSafely('匯率', () => dataService.getExchangeRate(), (r) => {
      renderExchangeRate(r);
      document.getElementById('rate-card-badge').textContent = staleLabel || '1 人民幣兌新台幣';
    });
    await renderSafely('語錄', () => dataService.getDailyQuote(), renderDailyQuote);

    const quizData = await dataService.getDrivingQuiz();
    quizState.mode = 'daily';
    quizState.finished = false;
    quizState.dailyScore = 0;
    quizState.dailyQuestions = quizData;
    quizState.questions = quizData;
    quizState.currentIndex = 0;
    quizState.userAnswers = {};
    quizState.score = 0;
    quizState.completed = false;
    renderDrivingQuiz();

    // §16: Staggered card entrance after all content is rendered
    triggerCardStagger();

    // Debug Widget: populate after all data is loaded
    await renderDebugWidget(headerData);

  } catch (err) {
    console.error("Failed to render brief:", err);
  }
}


/**
 * §16: Staggered card entrance — each card animates in with an offset delay.
 * JS-driven so we can control the timing precisely.
 */
function triggerCardStagger() {
  const cards = document.querySelectorAll('.dashboard-grid .card');
  cards.forEach((card, i) => {
    // Reset in case of re-render (refresh button)
    card.classList.remove('card-enter');
    card.style.animationDelay = '';
    // Force reflow to allow re-triggering animation
    void card.offsetWidth;
    setTimeout(() => {
      card.style.animationDelay = '0ms'; // already handled by setTimeout
      card.classList.add('card-enter');
    }, i * 75); // 75ms stagger between cards
  });
}

// 小型行內 icon，取代散落各處的表情符號，統一用 currentColor 走版面配色

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Render Header & Greeting
 */
function renderHeader({ user, meta }) {
  // 問候語用手機當下的時間算，不用資料檔裡的（資料是早上產生的，下午打開還寫「早安」很怪）。
  // 大標題下面那一行（日期 · 還剩幾項）由 TaskListView.js 的 renderTaskList 負責
  const hour = new Date().getHours();
  const hello = hour < 5 ? '夜深了' : hour < 11 ? '早安' : hour < 18 ? '午安' : '晚安';
  setTodayTitle(`${hello}，${user.name}`);
}

/**
 * Render Weather Widget
 */
function renderWeather(w) {
  const container = document.getElementById('weather-widget-content');
  const has = (value) => value && value !== 'N/A';

  // 地點放在卡片標題列右邊，卡片裡不再重複一次
  const badge = document.getElementById('weather-card-badge');
  if (badge) badge.textContent = w.location || '南京市栖霞區';

  // 天氣來源沒回應：只講一次，不要擺一排 N/A
  if (w.isFallback || !has(w.tempCurrent)) {
    container.innerHTML = '<div class="countdown-empty">今天的天氣還沒抓到</div>';
    return;
  }

  // 平常只看這兩行：現在幾度、什麼天氣；今天最低到最高、會不會下雨
  const range = has(w.tempMin) && has(w.tempMax) ? `${escapeHtml(w.tempMin)} ~ ${escapeHtml(w.tempMax)}` : '';
  const rain = has(w.rainChance) ? `降雨 ${escapeHtml(w.rainChance)}` : '';
  const moreRows = [['體感溫度', w.feelsLike], ['紫外線指數', w.uvIndex]]
    .filter(([, value]) => has(value))
    .map(([label, value]) => `<div class="list-row"><span>${label}</span><span>${escapeHtml(value)}</span></div>`)
    .join('');

  container.innerHTML = `
    <div class="metric">
      <span class="metric-value">${escapeHtml(w.tempCurrent)}</span>
      <span class="metric-unit">${escapeHtml(w.condition || '')}</span>
    </div>
    <div class="weather-line">${[range, rain].filter(Boolean).join(' · ')}</div>
    ${w.aiTip ? `<div class="weather-tip">${escapeHtml(w.aiTip)}</div>` : ''}
    ${moreRows ? `<details class="add-details"><summary class="section-action">看更多</summary>${moreRows}</details>` : ''}
  `;
}

/**
 * Render Daily Quote（職人精神/執行力主題，固定輪替，不是 AI 生成）
 */
function renderDailyQuote(q) {
  const container = document.getElementById('quote-banner-content');
  if (!container) return;
  // 沒有語錄資料時整張卡片收起來，不要留一張只有標題的空卡
  container.closest('.card').hidden = !q;
  if (!q) return;
  container.innerHTML = `
    <div class="quote-text">「${escapeHtml(q.text)}」</div>
    <div class="quote-author">— ${escapeHtml(q.author)}${q.source ? ` ${escapeHtml(q.source)}` : ''}</div>
  `;
}

/**
 * Render Horoscope Widget
 */
function renderHoroscope(h) {
  const container = document.getElementById('horoscope-widget-content');
  const transitAlertHtml = h.transitAlert
    ? `
      <div class="transit-alert-box">
        <div class="transit-alert-title">天象提醒</div>
        <div>${escapeHtml(h.transitAlert)}</div>
      </div>
    `
    : '';

  // 標題列右邊標今天的日期：運勢是每天一份，不是整個星座月份通用
  const now = new Date();
  document.getElementById('horoscope-card-badge').textContent = `${now.getMonth() + 1}月${now.getDate()}日`;

  const details = h.details || {};
  const catRows = [['整體', details.overall], ['工作', details.work], ['感情', details.love], ['財運', details.wealth], ['健康', details.health]]
    .filter(([, text]) => text)
    .map(([name, text]) => `<div class="cat-item"><span class="cat-name">${name}</span><span>${escapeHtml(text)}</span></div>`)
    .join('');

  // 平常只看星等和一句話；幸運色和五個分項是「有空再看」的，收在下面點了才展開
  container.innerHTML = `
    <div class="stars" role="img" aria-label="今天的運勢 ${escapeHtml(h.ratingStars)}">${escapeHtml(h.ratingStars)}</div>

    ${transitAlertHtml}

    <div class="horoscope-summary">${escapeHtml(h.aiSummary)}</div>

    <details class="add-details horoscope-more">
      <summary class="section-action">看分項</summary>
      <div class="horoscope-meta">幸運色 ${escapeHtml(h.luckyColor)} · 幸運數字 ${escapeHtml(h.luckyNumber)}</div>
      <div class="horoscope-categories">${catRows}</div>
    </details>
  `;
}

/**
 * Render Exchange Rate Widget (includes ExchangeRate-API attribution)
 */
function renderExchangeRate(r) {
  const container = document.getElementById('rate-widget-content');
  if (!r || r.current === null || r.current === undefined) {
    container.innerHTML = '<div class="countdown-empty">即時匯率資料暫時無法取得</div>';
    return;
  }

  const hasChange = r.change !== null && r.change !== undefined;
  const changeHtml = !hasChange ? '' : r.change === 0
    ? '<span class="rate-change">持平</span>'
    : `<span class="rate-change ${r.change > 0 ? 'rate-up' : 'rate-down'}">${r.change >= 0 ? '▲' : '▼'} ${Math.abs(r.change).toFixed(3)} (${escapeHtml(r.changePercent)})</span>`;
  const yesterdayStr = (r.yesterday !== null && r.yesterday !== undefined) ? `昨日 ${Number(r.yesterday).toFixed(3)}` : '還沒有昨日資料';

  // 右邊的小長條圖：近 7 日走勢，最新一天上色
  let barsHtml = '';
  if (Array.isArray(r.last7Days) && r.last7Days.length > 0) {
    const maxVal = Math.max(...r.last7Days);
    const minVal = Math.min(...r.last7Days);
    const range = maxVal - minVal;
    barsHtml = r.last7Days.map((val, idx) => {
      // 七天完全一樣時畫成等高的一排，不要全部縮在最底下
      const heightPercent = range === 0 ? 60 : Math.round(((val - minVal) / range) * 80 + 20);
      const isActive = idx === r.last7Days.length - 1 ? 'active' : '';
      return `<div class="bar ${isActive}" style="height: ${heightPercent}%;"></div>`;
    }).join('');
  }

  const detailed = Array.isArray(r.last7DaysDetailed) ? r.last7DaysDetailed : [];
  // 「今天／昨天」照手機當下的日期標，不是照資料的順序（資料還沒更新時，最新一筆其實是昨天的）
  const dayKey = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const todayKey = dayKey(0);
  const yesterdayKey = dayKey(-1);
  const historyListHtml = detailed
    .slice()
    .reverse()
    .map((entry, idxFromEnd) => {
      const tag = entry.date === todayKey ? '今天' : entry.date === yesterdayKey ? '昨天' : formatShortDate(entry.date);
      return `
        <div class="rate-history-row ${idxFromEnd === 0 ? 'is-today' : ''}">
          <span>${tag}</span>
          <span>${Number(entry.rate).toFixed(3)}</span>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="metric-row">
      <div class="metric">
        <span class="metric-value">${Number(r.current).toFixed(3)}</span>
        <span class="metric-unit">TWD</span>
      </div>
      ${barsHtml ? `<div class="sparkline-bars" aria-hidden="true">${barsHtml}</div>` : ''}
    </div>

    <div class="rate-meta">
      <span>${changeHtml}${yesterdayStr}</span>
      ${historyListHtml ? '<button type="button" class="section-action card-link" data-action="toggle-rate-history" aria-expanded="false">每日明細</button>' : ''}
    </div>

    ${historyListHtml ? `<div class="rate-history-list" hidden>${historyListHtml}</div>` : ''}

    <a class="list-footnote" href="https://www.exchangerate-api.com" target="_blank" rel="noopener">${r.updateTime ? `${escapeHtml(r.updateTime)} 更新 · ` : ''}Rates by ExchangeRate-API</a>
  `;

  const historyToggle = container.querySelector('[data-action="toggle-rate-history"]');
  const historyList = container.querySelector('.rate-history-list');
  if (historyToggle && historyList) {
    const toggle = () => {
      const isHidden = historyList.hasAttribute('hidden');
      if (isHidden) {
        historyList.removeAttribute('hidden');
      } else {
        historyList.setAttribute('hidden', '');
      }
      historyToggle.setAttribute('aria-expanded', String(isHidden));
    };
    historyToggle.addEventListener('click', toggle);
  }
}

function formatShortDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/**
 * Render Scooter Driving License Quiz Widget
 */
function renderDrivingQuiz() {
  const container = document.getElementById('quiz-widget-content');
  const total = quizState.questions.length;
  const currIdx = quizState.currentIndex;
  const currentQ = quizState.questions[currIdx];

  const isReview = quizState.mode === 'review';
  const mistakeCount = getMistakeCount();
  const dueCount = getDueMistakes().length;
  const dailyTotal = quizState.dailyQuestions.length;
  document.getElementById('quiz-card-badge').textContent = `每日 ${dailyTotal} 題`;

  // 跑完了：顯示今天的成績，不會自己從第一題重來
  if (quizState.finished) {
    container.innerHTML = `
      <div class="metric">
        <span class="metric-value">${quizState.dailyScore}</span>
        <span class="metric-unit">/ ${dailyTotal} 題答對</span>
      </div>
      <p class="list-footnote">今天的題目做完了。${mistakeCount > 0 ? `錯題本還有 ${mistakeCount} 題${dueCount < mistakeCount ? `，其中 ${mistakeCount - dueCount} 題過幾天會再出` : ''}。` : '錯題本是空的。'}</p>
      ${dueCount > 0 ? '<button type="button" class="btn-action btn-block" id="btn-quiz-review">再做一次錯題</button>' : ''}
    `;
    const again = document.getElementById('btn-quiz-review');
    if (again) again.addEventListener('click', () => startQuiz('review'));
    return;
  }

  if (!currentQ) {
    container.innerHTML = '<div class="countdown-empty">今天的題目暫時載入不了</div>';
    return;
  }

  const dotsHtml = quizState.questions.map((q, idx) => {
    let dotClass = 'quiz-dot';
    if (idx === currIdx) dotClass += ' active';
    if (quizState.userAnswers[q.id]) {
      const isCorrect = quizState.userAnswers[q.id] === q.answer;
      dotClass += isCorrect ? ' done-correct' : ' done-wrong';
    }
    return `<div class="${dotClass}"></div>`;
  }).join('');

  const answeredOption = quizState.userAnswers[currentQ.id];

  const optionsHtml = currentQ.options.map(opt => {
    let btnClass = 'option-btn';
    if (answeredOption) {
      if (opt.key === currentQ.answer) {
        btnClass += ' correct';
      } else if (opt.key === answeredOption) {
        btnClass += ' wrong';
      }
    }
    const disabled = answeredOption ? 'disabled' : '';

    return `
      <button class="${btnClass}" ${disabled} data-key="${opt.key}">
        <span class="opt-key">${opt.key}</span>
        <span>${opt.text}</span>
      </button>
    `;
  }).join('');

  const isFirst = currIdx === 0;
  const isLast = currIdx === total - 1;
  // 最後一題按下去是「接著做錯題」還是「結束」
  const advanceLabel = !isLast || (!isReview && dueCount > 0) ? '下一題' : '完成';
  const advanceId = isLast ? 'btn-quiz-finish' : 'btn-quiz-next';

  // 答完之後：對錯一行字、該知道的一兩句、然後就是整列寬的「下一題」，不用往下捲去找
  let resultHtml = '';
  if (answeredOption) {
    const isCorrect = answeredOption === currentQ.answer;
    const notes = [
      isReview && isCorrect ? ((currentQ.streak || 0) >= REVIEW_GAPS.length ? '連續答對三次，這題從錯題本移除了。' : `這題 ${REVIEW_GAPS[currentQ.streak || 0]} 天後會再出一次。`) : '',
      !isCorrect ? '已經存進錯題本。' : '',
      currentQ.explanation ? `解析：${currentQ.explanation}` : '',
    ].filter(Boolean);
    resultHtml = `
      <div class="quiz-result" role="status">
        <div class="quiz-result-title ${isCorrect ? 'is-correct' : 'is-wrong'}">${isCorrect ? '答對了' : `${answeredOption === UNSURE ? '' : '答錯了，'}正確答案是 (${currentQ.answer})`}</div>
        ${notes.map((note) => `<div>${note}</div>`).join('')}
        <div class="quiz-source">來源：<a href="${currentQ.source_url || 'https://www.thb.gov.tw/'}" target="_blank" rel="noopener">${currentQ.source || '交通部公路局機車筆試題庫'}</a>${currentQ.updated_at ? `（${currentQ.updated_at} 版）` : ''}</div>
      </div>
      <button type="button" class="btn-action btn-primary btn-block" id="${advanceId}">${advanceLabel}</button>
    `;
  }

  container.innerHTML = `
    <div class="quiz-progress" role="img" aria-label="第 ${currIdx + 1} 題，共 ${total} 題">${dotsHtml}</div>

    <div class="quiz-body">
      <div class="quiz-question-box">
        ${currentQ.category ? `<span class="quiz-cat-tag">${currentQ.category}</span>` : ''}
        <div class="quiz-q-title">${currentQ.question}</div>
        ${currentQ.image ? `<img class="quiz-image" src="${currentQ.image}" alt="這一題的圖">` : ''}
      </div>

      <div class="quiz-options">${optionsHtml}</div>
      ${answeredOption ? resultHtml : '<button type="button" class="section-action quiz-unsure-btn" id="btn-quiz-unsure">不確定，看答案</button>'}
    </div>

    <div class="quiz-controls">
      ${isFirst ? '<span></span>' : '<button type="button" class="section-action" id="btn-quiz-prev">上一題</button>'}
      ${answeredOption ? '' : `<button type="button" class="section-action" id="${advanceId}">${isLast ? advanceLabel : '先跳過'}</button>`}
    </div>

    ${!isReview && dueCount > 0 && isFirst && !answeredOption ? `<div class="quiz-footer"><span>今天有 ${dueCount} 題錯題要複習，做完後會接著出</span></div>` : ''}
  `;

  // 「不確定」：直接公布答案，當作答錯存進錯題本
  const unsureBtn = document.getElementById('btn-quiz-unsure');
  if (unsureBtn) unsureBtn.addEventListener('click', () => handleQuizAnswer(currentQ.id, UNSURE, null));

  container.querySelectorAll('.option-btn').forEach(btn => {
    // §1: Instant press via pointerdown (setupInstantPressListeners handles .is-pressing)
    btn.addEventListener('click', (e) => {
      const selectedKey = e.currentTarget.getAttribute('data-key');
      handleQuizAnswer(currentQ.id, selectedKey, e.currentTarget);
    });
  });

  const prevBtn = document.getElementById('btn-quiz-prev');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (quizState.currentIndex > 0) {
        quizState.currentIndex--;
        renderDrivingQuiz();
        slideIn(container.querySelector('.quiz-body'), -1);
      }
    });
  }

  const nextBtn = document.getElementById('btn-quiz-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (quizState.currentIndex < quizState.questions.length - 1) {
        quizState.currentIndex++;
        renderDrivingQuiz();
        slideIn(container.querySelector('.quiz-body'), 1);
      }
    });
  }

  // 最後一題的按鈕：今天的題目做完就接著做錯題本裡的題目，錯題也做完（或本來就沒有）才算結束
  const finishBtn = document.getElementById('btn-quiz-finish');
  if (finishBtn) {
    finishBtn.addEventListener('click', () => {
      if (!isReview) {
        quizState.dailyScore = quizState.score;
        if (getDueMistakes().length > 0) {
          startQuiz('review');
          slideIn(container.querySelector('.quiz-body'), 1);
          return;
        }
      }
      quizState.finished = true;
      renderDrivingQuiz();
    });
  }
}

/** 從第一題開始：'daily' 是今天的題目，'review' 是錯題本裡的題目 */
function startQuiz(mode) {
  quizState.mode = mode;
  quizState.finished = false;
  quizState.questions = mode === 'review'
    ? getDueMistakes().map((m, idx) => ({ ...m, id: `m_${idx + 1}` }))
    : quizState.dailyQuestions;
  quizState.currentIndex = 0;
  quizState.userAnswers = {};
  quizState.score = 0;
  renderDrivingQuiz();
}

// 按了「不確定，看答案」時記在 userAnswers 裡的值（不會等於任何選項）
const UNSURE = 'unsure';

function handleQuizAnswer(qId, selectedKey, clickedBtn) {
  if (quizState.userAnswers[qId]) return;

  quizState.userAnswers[qId] = selectedKey;
  const q = quizState.questions.find(item => item.id === qId);
  const isCorrect = q && q.answer === selectedKey;
  if (isCorrect) quizState.score++;

  // 錯題本：答錯就存起來；複習時答對就移除
  if (q && !isCorrect) recordMistake(q);
  if (q && isCorrect && quizState.mode === 'review') resolveMistake(q);

  // §13: Play confirmation animation BEFORE re-rendering for instant feedback
  if (clickedBtn) {
    const flashClass = isCorrect ? 'flash-correct' : 'flash-wrong';
    const stateClass = isCorrect ? 'correct' : 'wrong';
    clickedBtn.classList.add(stateClass, flashClass);
    // Also highlight correct answer if user got it wrong
    if (!isCorrect && q) {
      const correctBtn = clickedBtn.closest('.quiz-options')?.querySelector(`[data-key="${q.answer}"]`);
      if (correctBtn) correctBtn.classList.add('correct');
    }
    // Short delay so animation plays before re-render wipes the DOM
    setTimeout(() => {
      renderDrivingQuiz();
      // §9: Pulse the newly changed dot
      const dots = document.querySelectorAll('.quiz-dot');
      const dot = dots[quizState.currentIndex];
      if (dot) {
        dot.classList.add('dot-pulse');
        dot.addEventListener('animationend', () => dot.classList.remove('dot-pulse'), { once: true });
      }
    }, 320);
  } else {
    renderDrivingQuiz();
  }
}

/**
 * §Apple Fluid Physics & 1:1 Gesture Controller for Bottom Sheet Modal
 * WWDC Specs:
 * - 1:1 Direct tracking with grab offset
 * - Rubber-banding at upper boundary: rubberband(overshoot)
 * - Momentum projection: projectVelocity(velocity, 0.998)
 * - Velocity handoff to critically damped spring (damping ratio = 1.0)
 * - Interruptible spring animation on pointerdown
 * - Spatial consistency: transform-origin linked to trigger button
 */
function rubberband(overshoot, dimension = 300, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

function projectVelocity(velocityPxPerSec, decelerationRate = 0.998) {
  return (velocityPxPerSec / 1000) * decelerationRate / (1 - decelerationRate);
}

class AppleFluidModal {
  constructor(overlayEl, contentEl, triggerEl, closeEl) {
    this.overlay = overlayEl;
    this.content = contentEl;
    this.trigger = triggerEl;
    this.closeBtn = closeEl;
    this.handle = contentEl.querySelector('.sheet-handle');
    this.header = contentEl.querySelector('.modal-header');

    this.currentY = 0;
    this.isDragging = false;
    this.activeSpringRaf = null;
    this.history = [];

    this.init();
  }

  init() {
    if (this.trigger) {
      this.trigger.addEventListener('click', (e) => this.open(e));
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    const dragTargets = [this.handle, this.header].filter(Boolean);
    dragTargets.forEach(el => {
      el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    });

    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e));
  }

  open(e) {
    if (this.activeSpringRaf) cancelAnimationFrame(this.activeSpringRaf);

    // Rule 7: Spatial Consistency — set transform origin to trigger button
    if (this.trigger) {
      const rect = this.trigger.getBoundingClientRect();
      const originX = rect.left + rect.width / 2;
      const originY = rect.top + rect.height / 2;
      this.content.style.transformOrigin = `${originX}px ${originY}px`;
    }

    this.overlay.classList.add('active');
    this.content.classList.remove('is-dragging');
    this.currentY = 0;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.content.style.transform = 'translateY(0)';
      return;
    }

    const startY = window.innerHeight;
    this.animateSpringTo(startY, 0, 0);
  }

  close(velocity = 0) {
    if (this.activeSpringRaf) cancelAnimationFrame(this.activeSpringRaf);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.overlay.classList.remove('active');
      this.content.style.transform = '';
      return;
    }

    const targetY = window.innerHeight;
    this.animateSpringTo(this.currentY, targetY, velocity, () => {
      this.overlay.classList.remove('active');
      this.content.style.transform = '';
      this.currentY = 0;
    });
  }

  onPointerDown(e) {
    if (!this.overlay.classList.contains('active')) return;
    
    // Rule 3: Interruptibility — stop mid-flight spring animation instantly
    if (this.activeSpringRaf) {
      cancelAnimationFrame(this.activeSpringRaf);
      this.activeSpringRaf = null;
    }

    this.isDragging = true;
    this.startY = e.clientY;
    this.startTransformY = this.currentY;
    this.history = [{ y: e.clientY, t: performance.now() }];
    
    this.content.classList.add('is-dragging');
    if (e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }
  }

  onPointerMove(e) {
    if (!this.isDragging) return;

    const now = performance.now();
    const rawDeltaY = e.clientY - this.startY;
    let newY = this.startTransformY + rawDeltaY;

    // Rule 9: Rubber-banding when dragging UP past resting position (newY < 0)
    if (newY < 0) {
      const overshoot = -newY;
      newY = -rubberband(overshoot, 300, 0.55);
    }

    this.currentY = newY;
    this.content.style.transform = `translateY(${newY}px)`;

    this.history.push({ y: e.clientY, t: now });
    if (this.history.length > 5) this.history.shift();
  }

  onPointerUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.content.classList.remove('is-dragging');

    // Rule 5: Velocity Handoff
    let velocity = 0;
    if (this.history.length >= 2) {
      const oldest = this.history[0];
      const newest = this.history[this.history.length - 1];
      const dt = (newest.t - oldest.t) / 1000;
      if (dt > 0.005) {
        velocity = (newest.y - oldest.y) / dt;
      }
    }

    // Rule 6: Momentum Projection
    const projectedEndpoint = this.currentY + projectVelocity(velocity, 0.998);

    if (projectedEndpoint > 180 || (velocity > 450 && this.currentY > 30)) {
      this.close(velocity);
    } else {
      this.animateSpringTo(this.currentY, 0, velocity);
    }
  }

  // Rule 4: Critically Damped Physics Spring (Damping ratio = 1.0)
  animateSpringTo(fromY, toY, initialVelocity = 0, onComplete = null) {
    let y = fromY;
    let v = initialVelocity;
    const k = 220; // Stiffness
    const c = 2 * Math.sqrt(k); // Critical Damping ratio = 1.0
    let lastTime = performance.now();

    const step = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.016);
      lastTime = now;

      const force = -k * (y - toY);
      const damping = -c * v;
      const accel = force + damping;

      v += accel * dt;
      y += v * dt;
      this.currentY = y;

      this.content.style.transform = `translateY(${y}px)`;

      if (Math.abs(y - toY) < 0.5 && Math.abs(v) < 8) {
        this.currentY = toY;
        this.content.style.transform = toY === 0 ? 'translateY(0)' : `translateY(${toY}px)`;
        this.activeSpringRaf = null;
        if (onComplete) onComplete();
        return;
      }

      this.activeSpringRaf = requestAnimationFrame(step);
    };

    this.activeSpringRaf = requestAnimationFrame(step);
  }
}

function setupEventListeners() {
  const refreshBtn = document.getElementById('btn-refresh-brief');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.classList.add('is-loading');

      await dataService.refreshAll();
      await loadAllBriefData();

      refreshBtn.disabled = false;
      refreshBtn.classList.remove('is-loading');
    });
  }

  // 「今天的資料還沒更新」那一列的重試，就是按一次右上角的重新整理
  const retryBtn = document.getElementById('stale-retry-btn');
  if (retryBtn && refreshBtn) retryBtn.addEventListener('click', () => refreshBtn.click());

  const chatFab = document.getElementById('btn-open-chat');
  const chatOverlay = document.getElementById('modal-chat');
  const chatCloseBtn = document.getElementById('btn-close-chat');
  const chatContent = chatOverlay ? chatOverlay.querySelector('.modal-content') : null;

  if (chatOverlay && chatContent) {
    new AppleFluidModal(chatOverlay, chatContent, chatFab, chatCloseBtn);
  }
  initChatBox();

  window.addEventListener('chenxu:data-changed', () => {
    renderTaskList();
    renderCalendarView();
    renderCountdownView();
    renderCountdownSummaryInto(document.getElementById('today-countdown-widget-content'));
    renderSettingsView();
    renderSleepView();
  });

  // Debug Widget toggle
  const debugToggle = document.getElementById('debug-toggle');
  const debugPanel = document.getElementById('debug-panel');
  if (debugToggle && debugPanel) {
    debugToggle.addEventListener('click', () => {
      const isHidden = debugPanel.hasAttribute('hidden');
      if (isHidden) {
        debugPanel.removeAttribute('hidden');
        // Re-trigger animation when re-opening
        debugPanel.style.animation = 'none';
        void debugPanel.offsetWidth;
        debugPanel.style.animation = '';
      } else {
        debugPanel.setAttribute('hidden', '');
      }
    });
  }
}

/**
 * Debug Widget — 填入資料來源資訊
 * 顯示：日期、是否離線、是否 mock、today.json URL、Actions Run#、Commit、生成時間
 */
async function renderDebugWidget(headerData) {
  const buildInfo = await dataService.getBuildInfo();
  const loadedUrl = dataService.getLoadedUrl();
  const isLive = !!loadedUrl;
  const isStale = headerData?.meta?.isStale ?? !isLive;

  const set = (id, text, cls) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'debug-val' + (cls ? ' ' + cls : '');
  };

  // 日期
  set('dbg-date', headerData?.meta?.date?.replace(' (⚠️ 顯示離線備份資料)', '') || '—');

  // 離線 / Stale
  set('dbg-stale', isStale ? 'true ⚠️' : 'false', isStale ? 'warn' : 'ok');

  // mockData
  set('dbg-mock', isLive ? 'false' : 'true', isLive ? 'ok' : 'warn');

  // today.json 狀態
  if (isLive) {
    set('dbg-json-status', '載入成功 ✅', 'ok');
  } else {
    set('dbg-json-status', '載入失敗，使用 mockData ❌', 'err');
  }

  // today.json URL
  const urlEl = document.getElementById('dbg-json-url');
  if (urlEl) {
    urlEl.textContent = loadedUrl || '（未載入）';
    urlEl.className = 'debug-val debug-url' + (loadedUrl ? ' ok' : ' err');
  }

  // GitHub Actions Run#
  const runNum = buildInfo?.workflowRunNumber;
  set('dbg-run', runNum ? `#${runNum}` : '（本地 / 無資料）', runNum ? 'ok' : 'warn');

  // Commit Hash
  const commit = buildInfo?.commitHash;
  set('dbg-commit', commit || '（本地 / 無資料）', commit ? 'ok' : 'warn');

  // 生成時間
  const generatedAt = buildInfo?.generatedAt;
  if (generatedAt) {
    try {
      const d = new Date(generatedAt);
      const formatted = d.toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
      set('dbg-generated', formatted, 'ok');
    } catch {
      set('dbg-generated', generatedAt, 'ok');
    }
  } else {
    set('dbg-generated', '（本地 / 無資料）', 'warn');
  }
}

