/**
 * 晨序 (Chénxù) - Personal AI Life Scheduling System — Application Logic & Component Rendering
 */

import { dataService } from './services/dataService.js';
import { initTabs, switchTab } from './tabs.js';
import { applyTheme } from './theme.js';
import { renderTaskList } from './TaskListView.js';
import { renderCalendarView } from './CalendarView.js';
import { renderCountdownView, renderCountdownSummaryInto } from './CountdownView.js';
import { renderSettingsView } from './SettingsView.js';
import { renderSleepView } from './SleepView.js';
import { scheduleReminderIfEnabled } from './sleepReminder.js';
import { initChatBox } from './ChatBoxView.js';

// Global Quiz State
let quizState = {
  questions: [],
  currentIndex: 0,
  userAnswers: {},
  score: 0,
  completed: false
};

document.addEventListener('DOMContentLoaded', async () => {
  console.log("Initializing 晨序 (Personal AI Life Scheduling System)...");
  applyTheme();
  initTabs();
  setupSectionLinks();
  setupInstantPressListeners();
  setupScrollShadow();
  renderTaskList();
  renderCalendarView();
  renderCountdownView();
  renderCountdownSummaryInto(document.getElementById('today-countdown-widget-content'));
  renderSettingsView();
  renderSleepView();
  scheduleReminderIfEnabled();
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
async function loadAllBriefData() {
  try {
    const headerData = await dataService.getHeaderInfo();
    renderHeader(headerData);

    const weatherData = await dataService.getWeather();
    renderWeather(weatherData);

    const horoscopeData = await dataService.getHoroscope();
    renderHoroscope(horoscopeData);

    const rateData = await dataService.getExchangeRate();
    renderExchangeRate(rateData);

    const quoteData = await dataService.getDailyQuote();
    renderDailyQuote(quoteData);

    const quizData = await dataService.getDrivingQuiz();
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
const ICON_CLOUD_LG = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:2.4rem;height:2.4rem;color:var(--tint);"><circle cx="9" cy="13" r="4"/><circle cx="14" cy="11" r="5"/><rect x="6" y="15" width="14" height="4" rx="2"/></svg>';

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
  const dateEl = document.getElementById('header-date');
  if (dateEl) {
    if (meta.isStale) {
      dateEl.innerHTML = `<span style="color: var(--apple-red); font-weight: 700;">${escapeHtml(meta.date)}</span>`;
    } else {
      dateEl.textContent = meta.date;
    }
  }
  
  const timeEl = document.getElementById('header-updated-time');
  if (timeEl) {
    timeEl.textContent = `資料時間：${meta.lastUpdated}`;
  }

  const descEl = document.getElementById('greeting-desc');
  if (descEl) descEl.textContent = meta.greeting;
}

/**
 * Render Weather Widget
 */
function renderWeather(w) {
  const container = document.getElementById('weather-widget-content');
  const safeCond = escapeHtml(w.condition || '多雲');
  const safeTemp = escapeHtml(w.tempCurrent || 'N/A');
  const safeMin = escapeHtml(w.tempMin || 'N/A');
  const safeMax = escapeHtml(w.tempMax || 'N/A');
  const safeRain = escapeHtml(w.rainChance || 'N/A');
  const safeFeels = escapeHtml(w.feelsLike || 'N/A');
  const safeUv = escapeHtml(w.uvIndex || 'N/A');
  const safeTip = escapeHtml(w.aiTip || '提醒您注意天氣變化。');

  // 地點放在卡片標題列右邊，卡片裡不再重複一次
  const badge = document.getElementById('weather-card-badge');
  if (badge) badge.textContent = w.location || '南京市栖霞區';

  container.innerHTML = `
    ${w.isFallback ? '<div style="font-size: var(--text-footnote); color: var(--apple-red); margin-bottom: 0.35rem;">資料暫時無法更新</div>' : ''}
    <div class="weather-main">
      <div>
        <div class="weather-temp">${safeTemp}</div>
        <div class="weather-condition">${safeCond}</div>
      </div>
      ${ICON_CLOUD_LG}
    </div>
    
    <div class="weather-details">
      <div class="weather-detail-item">
        <span class="weather-detail-label">最低 / 最高</span>
        <span class="weather-detail-val">${safeMin} ~ ${safeMax}</span>
      </div>
      <div class="weather-detail-item">
        <span class="weather-detail-label">降雨機率</span>
        <span class="weather-detail-val" style="color: var(--apple-blue);">${safeRain}</span>
      </div>
      <div class="weather-detail-item">
        <span class="weather-detail-label">體感溫度</span>
        <span class="weather-detail-val">${safeFeels}</span>
      </div>
      <div class="weather-detail-item">
        <span class="weather-detail-label">紫外線指數</span>
        <span class="weather-detail-val">${safeUv}</span>
      </div>
    </div>

    <div class="ai-tip-box">
      <div class="ai-tip-title">出門提醒</div>
      <div>${safeTip}</div>
    </div>
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

  container.innerHTML = `
    <div class="horoscope-header">
      <div class="stars">${escapeHtml(h.ratingStars)}</div>
      <div class="horoscope-meta">幸運色 ${escapeHtml(h.luckyColor)} · 幸運數字 ${escapeHtml(h.luckyNumber)}</div>
    </div>

    ${transitAlertHtml}

    <div class="horoscope-summary">${escapeHtml(h.aiSummary)}</div>

    <div class="horoscope-categories">
      <div class="cat-item"><span class="cat-name">整體</span><span>${escapeHtml(h.details.overall)}</span></div>
      <div class="cat-item"><span class="cat-name">工作</span><span>${escapeHtml(h.details.work)}</span></div>
      <div class="cat-item"><span class="cat-name">感情</span><span>${escapeHtml(h.details.love)}</span></div>
      <div class="cat-item"><span class="cat-name">財運</span><span>${escapeHtml(h.details.wealth)}</span></div>
      <div class="cat-item"><span class="cat-name">健康</span><span>${escapeHtml(h.details.health)}</span></div>
    </div>
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
  const changeHtml = hasChange
    ? `<span class="rate-change ${r.change >= 0 ? 'rate-up' : 'rate-down'}">${r.change >= 0 ? '▲' : '▼'} ${Math.abs(r.change).toFixed(2)} (${escapeHtml(r.changePercent)})</span>`
    : '';
  const yesterdayStr = (r.yesterday !== null && r.yesterday !== undefined) ? `昨日 ${Number(r.yesterday).toFixed(2)}` : '還沒有昨日資料';

  // 右邊的小長條圖：近 7 日走勢，最新一天上色
  let barsHtml = '';
  if (Array.isArray(r.last7Days) && r.last7Days.length > 0) {
    const maxVal = Math.max(...r.last7Days);
    const minVal = Math.min(...r.last7Days);
    const range = maxVal - minVal || 0.01;
    barsHtml = r.last7Days.map((val, idx) => {
      const heightPercent = Math.max(20, Math.round(((val - minVal) / range) * 80 + 20));
      const isActive = idx === r.last7Days.length - 1 ? 'active' : '';
      return `<div class="bar ${isActive}" style="height: ${heightPercent}%;"></div>`;
    }).join('');
  }

  const detailed = Array.isArray(r.last7DaysDetailed) ? r.last7DaysDetailed : [];
  const historyListHtml = detailed
    .slice()
    .reverse()
    .map((entry, idxFromEnd) => {
      const tag = idxFromEnd === 0 ? '今天' : idxFromEnd === 1 ? '昨天' : formatShortDate(entry.date);
      return `
        <div class="rate-history-row ${idxFromEnd === 0 ? 'is-today' : ''}">
          <span>${tag}</span>
          <span>${Number(entry.rate).toFixed(2)}</span>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="metric-row">
      <div class="metric">
        <span class="metric-value">${Number(r.current).toFixed(2)}</span>
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

  if (!currentQ) return;

  const scoreText = `今日得分：${quizState.score} / ${total}`;

  const dotsHtml = quizState.questions.map((q, idx) => {
    let dotClass = 'quiz-dot';
    if (idx === currIdx) dotClass += ' active';
    if (quizState.userAnswers[q.id]) {
      const isCorrect = quizState.userAnswers[q.id] === q.answer;
      dotClass += isCorrect ? ' done-correct' : ' done-wrong';
    }
    return `<div class="${dotClass}" title="Q${idx + 1}"></div>`;
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

  let explanationHtml = '';
  if (answeredOption) {
    const isCorrect = answeredOption === currentQ.answer;
    explanationHtml = `
      <div class="quiz-explanation">
        <div class="quiz-explanation-title" style="color: ${isCorrect ? 'var(--apple-green)' : 'var(--apple-red)'};">
          ${isCorrect ? '✓ 答對了！' : `✗ 答錯了！正確答案是 (${currentQ.answer})`}
        </div>
        <div><strong>官方解析：</strong>${currentQ.explanation}</div>
        <div style="font-size: var(--text-caption); color: var(--text-muted); margin-top: 0.35rem;">
          來源：<a href="${currentQ.source_url || 'https://www.thb.gov.tw/'}" target="_blank" rel="noopener" style="color: var(--text-muted);">${currentQ.source || '交通部公路局機車筆試題庫'}</a> (更新日期: ${currentQ.updated_at || '2026-06-02'})
        </div>
      </div>
    `;
  }

  const isFirst = currIdx === 0;
  const isLast = currIdx === total - 1;

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
      <span style="font-size: var(--text-subhead); font-weight: 600; color: var(--text-muted);">
        題目 ${currIdx + 1} / ${total}
      </span>
      <span class="quiz-score-badge">${scoreText}</span>
    </div>

    <div class="quiz-progress">${dotsHtml}</div>

    <div class="quiz-question-box">
      <span class="quiz-cat-tag">${currentQ.category}</span>
      <div class="quiz-q-title">Q${currIdx + 1}. ${currentQ.question}</div>
    </div>

    <div class="quiz-options">${optionsHtml}</div>

    ${explanationHtml}

    <div class="quiz-controls">
      <button class="btn-action" id="btn-quiz-prev" ${isFirst ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
        ← 上一題
      </button>
      ${isLast ? `
        <button class="btn-action btn-primary" id="btn-quiz-reset">
          重新練習
        </button>
      ` : `
        <button class="btn-action btn-primary" id="btn-quiz-next">
          下一題 →
        </button>
      `}
    </div>
  `;

  container.querySelectorAll('.option-btn').forEach(btn => {
    // §1: Instant press via pointerdown (setupInstantPressListeners handles .is-pressing)
    btn.addEventListener('click', (e) => {
      const selectedKey = e.currentTarget.getAttribute('data-key');
      handleQuizAnswer(currentQ.id, selectedKey, e.currentTarget);
    });
  });

  // §1: sparkline bars — instant hover highlight via pointerenter
  container.querySelectorAll('.bar').forEach(bar => {
    bar.addEventListener('pointerenter', () => bar.classList.add('bar-hover'));
    bar.addEventListener('pointerleave', () => bar.classList.remove('bar-hover'));
  });

  const prevBtn = document.getElementById('btn-quiz-prev');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (quizState.currentIndex > 0) {
        quizState.currentIndex--;
        renderDrivingQuiz();
      }
    });
  }

  const nextBtn = document.getElementById('btn-quiz-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (quizState.currentIndex < quizState.questions.length - 1) {
        quizState.currentIndex++;
        renderDrivingQuiz();
      }
    });
  }

  const resetBtn = document.getElementById('btn-quiz-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      quizState.currentIndex = 0;
      quizState.userAnswers = {};
      quizState.score = 0;
      renderDrivingQuiz();
    });
  }
}

function handleQuizAnswer(qId, selectedKey, clickedBtn) {
  if (quizState.userAnswers[qId]) return;

  quizState.userAnswers[qId] = selectedKey;
  const q = quizState.questions.find(item => item.id === qId);
  const isCorrect = q && q.answer === selectedKey;
  if (isCorrect) quizState.score++;

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

  const settingsBtn = document.getElementById('btn-open-settings');
  const modalOverlay = document.getElementById('modal-roadmap');
  const closeModalBtn = document.getElementById('btn-close-modal');
  const modalContent = modalOverlay ? modalOverlay.querySelector('.modal-content') : null;

  if (modalOverlay && modalContent) {
    window.fluidModalInstance = new AppleFluidModal(modalOverlay, modalContent, settingsBtn, closeModalBtn);
  }

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

