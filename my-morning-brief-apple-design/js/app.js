/**
 * Personal AI Morning Brief - Application Logic & Component Rendering
 */

import { dataService } from './services/dataService.js';
import { initTabs } from './tabs.js';
import { renderTaskList } from './TaskListView.js';
import { renderCalendarView } from './CalendarView.js';
import { renderCountdownView } from './CountdownView.js';
import { renderSettingsView } from './SettingsView.js';

// Global Quiz State
let quizState = {
  questions: [],
  currentIndex: 0,
  userAnswers: {},
  score: 0,
  completed: false
};

document.addEventListener('DOMContentLoaded', async () => {
  console.log("Initializing Personal AI Morning Brief MVP...");
  initTabs();
  setupInstantPressListeners();
  setupScrollShadow();
  renderTaskList();
  renderCalendarView();
  renderCountdownView();
  renderSettingsView();
  setupCalendarTabRefresh();
  await loadAllBriefData();
  setupEventListeners();
});

/**
 * §1: Respond on pointerdown — instant press feedback
 * Adds .is-pressing immediately on press, removes on release/leave
 */
function setupInstantPressListeners() {
  // Delegate on document so it works for dynamically rendered quiz buttons too
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn-action, .option-btn');
    if (btn && !btn.disabled) {
      btn.classList.add('is-pressing');
    }
  });
  const clearPress = (e) => {
    const btn = e.target.closest('.btn-action, .option-btn');
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
 * §12: masthead gains .scrolled class after page scrolls > 10px
 */
function setupScrollShadow() {
  const masthead = document.querySelector('.masthead');
  if (!masthead) return;
  const onScroll = () => {
    masthead.classList.toggle('scrolled', window.scrollY > 10);
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

    const quizData = await dataService.getDrivingQuiz();
    quizState.questions = quizData;
    quizState.currentIndex = 0;
    quizState.userAnswers = {};
    quizState.score = 0;
    quizState.completed = false;
    renderDrivingQuiz();

    const adviceData = await dataService.getDailyAdvice();
    renderDailyAdvice(adviceData);

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
const ICON_PIN = '<svg aria-hidden="true" focusable="false" class="icon icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>';
const ICON_CLOUD_LG = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:2.4rem;height:2.4rem;color:var(--apple-blue);"><circle cx="9" cy="13" r="4"/><circle cx="14" cy="11" r="5"/><rect x="6" y="15" width="14" height="4" rx="2"/></svg>';

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
      dateEl.innerHTML = `<span style="color: var(--accent-red); font-weight: 700;">${escapeHtml(meta.date)}</span>`;
    } else {
      dateEl.textContent = meta.date;
    }
  }
  
  const timeEl = document.getElementById('header-updated-time');
  if (timeEl) {
    timeEl.textContent = `資料時間：${meta.lastUpdated}`;
  }

  const userEl = document.getElementById('greeting-user');
  if (userEl) userEl.textContent = `早安，${escapeHtml(user.name)}！`;

  const descEl = document.getElementById('greeting-desc');
  if (descEl) descEl.textContent = meta.greeting;

  const locPill = document.getElementById('header-location-pill');
  if (locPill) {
    const locText = (user.city && user.district) 
      ? `${user.city}${user.district}` 
      : (user.city || user.location || '新北市蘆洲區');
    locPill.innerHTML = `${ICON_PIN}${escapeHtml(locText)}`;
  }
}

/**
 * Render Weather Widget
 */
function renderWeather(w) {
  const container = document.getElementById('weather-widget-content');
  const safeLoc = escapeHtml(w.location || '新北市蘆洲區');
  const safeCond = escapeHtml(w.condition || '多雲');
  const safeTemp = escapeHtml(w.tempCurrent || 'N/A');
  const safeMin = escapeHtml(w.tempMin || 'N/A');
  const safeMax = escapeHtml(w.tempMax || 'N/A');
  const safeRain = escapeHtml(w.rainChance || 'N/A');
  const safeFeels = escapeHtml(w.feelsLike || 'N/A');
  const safeUv = escapeHtml(w.uvIndex || 'N/A');
  const safeTip = escapeHtml(w.aiTip || '提醒您注意天氣變化。');

  container.innerHTML = `
    <div style="font-size: 0.82rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.3rem;">
      ${ICON_PIN}${safeLoc} ${w.isFallback ? '<span style="color: var(--accent-red);">(資料暫無法更新)</span>' : ''}
    </div>
    <div class="weather-main">
      <div>
        <div class="weather-temp">${safeTemp}</div>
        <div class="weather-condition">${safeCond}</div>
      </div>
      ${ICON_CLOUD_LG}
    </div>
    
    <div class="weather-details">
      <div class="weather-detail-item">
        <span class="weather-detail-label">最低 / 最高：</span>
        <span class="weather-detail-val">${safeMin} ~ ${safeMax}</span>
      </div>
      <div class="weather-detail-item">
        <span class="weather-detail-label">降雨機率：</span>
        <span class="weather-detail-val" style="color: var(--primary-color);">${safeRain}</span>
      </div>
      <div class="weather-detail-item">
        <span class="weather-detail-label">體感溫度：</span>
        <span class="weather-detail-val">${safeFeels}</span>
      </div>
      <div class="weather-detail-item">
        <span class="weather-detail-label">紫外線指數：</span>
        <span class="weather-detail-val">${safeUv}</span>
      </div>
    </div>

    <div class="ai-tip-box">
      <div class="ai-tip-title">今日 AI 出門提醒</div>
      <div>${safeTip}</div>
    </div>
  `;
}

/**
 * Render Horoscope Widget
 */
function renderHoroscope(h) {
  const container = document.getElementById('horoscope-widget-content');
  container.innerHTML = `
    <div class="horoscope-header">
      <div style="font-size: 1.1rem; font-weight: 700;">${escapeHtml(h.sign)}</div>
      <div class="stars">${escapeHtml(h.ratingStars)}</div>
    </div>

    <div class="horoscope-meta">
      <span class="tag-lucky">幸運色：${escapeHtml(h.luckyColor)}</span>
      <span class="tag-lucky">幸運數字：${escapeHtml(h.luckyNumber)}</span>
    </div>

    <div class="horoscope-summary">
      <strong>AI 今日運勢摘要：</strong><br/>
      ${escapeHtml(h.aiSummary)}
    </div>

    <div class="horoscope-categories">
      <div class="cat-item"><span class="cat-name">整體：</span><span>${escapeHtml(h.details.overall)}</span></div>
      <div class="cat-item"><span class="cat-name">工作：</span><span>${escapeHtml(h.details.work)}</span></div>
      <div class="cat-item"><span class="cat-name">感情：</span><span>${escapeHtml(h.details.love)}</span></div>
      <div class="cat-item"><span class="cat-name">財運：</span><span>${escapeHtml(h.details.wealth)}</span></div>
      <div class="cat-item"><span class="cat-name">健康：</span><span>${escapeHtml(h.details.health)}</span></div>
    </div>
  `;
}

/**
 * Render Exchange Rate Widget (includes ExchangeRate-API attribution)
 */
function renderExchangeRate(r) {
  const container = document.getElementById('rate-widget-content');
  if (!r || r.current === null || r.current === undefined) {
    container.innerHTML = `
      <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">CNY → TWD</div>
      <div class="rate-display"><div class="rate-primary">即時匯率資料暫無法取得</div></div>
    `;
    return;
  }

  const changeClass = (r.change !== null && r.change >= 0) ? 'rate-up' : 'rate-down';
  const yesterdayStr = (r.yesterday !== null && r.yesterday !== undefined) ? `昨日收盤：${Number(r.yesterday).toFixed(2)}` : '昨日收盤：歷史資料暫無';
  const changeStr = (r.change !== null && r.change !== undefined) 
    ? `${r.change >= 0 ? '▲' : '▼'} ${Math.abs(r.change).toFixed(2)} (${escapeHtml(r.changePercent)})` 
    : '即時異動：暫無歷史對照';

  let sparklineHtml = '';
  if (Array.isArray(r.last7Days) && r.last7Days.length > 0) {
    const maxVal = Math.max(...r.last7Days);
    const minVal = Math.min(...r.last7Days);
    const range = maxVal - minVal || 0.01;
    const barsHtml = r.last7Days.map((val, idx) => {
      const heightPercent = Math.max(20, Math.round(((val - minVal) / range) * 80 + 20));
      const isActive = idx === r.last7Days.length - 1 ? 'active' : '';
      return `<div class="bar ${isActive}" style="height: ${heightPercent}%;" title="Day ${idx+1}: ${val}"></div>`;
    }).join('');

    sparklineHtml = `
      <div class="sparkline-container">
        <div class="sparkline-title">近 7 日匯率走勢 (CNY / TWD)</div>
        <div class="sparkline-bars">${barsHtml}</div>
      </div>
    `;
  } else {
    sparklineHtml = `
      <div class="sparkline-container">
        <div class="sparkline-title" style="color: var(--text-muted); font-size: 0.78rem;">📊 歷史 7 日匯率走勢：暫無數據 (僅提供即時匯率)</div>
      </div>
    `;
  }

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
      <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">${escapeHtml(r.pair || 'CNY → TWD')}</span>
      <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener" style="font-size: 0.7rem; color: var(--text-muted); text-decoration: underline;">
        Rates by ExchangeRate-API
      </a>
    </div>
    
    <div class="rate-display">
      <div class="rate-primary">1 CNY ≈ ${Number(r.current).toFixed(2)} TWD</div>
      <div class="rate-change ${changeClass}">${changeStr}</div>
    </div>

    <div class="rate-meta">
      <span>${yesterdayStr}</span>
      <span>${escapeHtml(r.updateTime || '')}</span>
    </div>

    ${sparklineHtml}
  `;

  container.querySelectorAll('.bar').forEach(bar => {
    bar.addEventListener('pointerenter', () => bar.classList.add('bar-hover'));
    bar.addEventListener('pointerleave', () => bar.classList.remove('bar-hover'));
  });
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
        <div class="quiz-explanation-title" style="color: ${isCorrect ? 'var(--accent-green)' : 'var(--accent-red)'};">
          ${isCorrect ? '✓ 答對了！' : `✗ 答錯了！正確答案是 (${currentQ.answer})`}
        </div>
        <div><strong>官方解析：</strong>${currentQ.explanation}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">
          來源：<a href="${currentQ.source_url || 'https://www.thb.gov.tw/'}" target="_blank" rel="noopener" style="color: var(--text-muted);">${currentQ.source || '交通部公路局機車筆試題庫'}</a> (更新日期: ${currentQ.updated_at || '2026-06-02'})
        </div>
      </div>
    `;
  }

  const isFirst = currIdx === 0;
  const isLast = currIdx === total - 1;

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
      <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted);">
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

function renderDailyAdvice(advice) {
  const container = document.getElementById('advice-widget-content');
  
  const top3Html = advice.top3.map(item => `
    <li class="top3-item">
      <span>${item.text}</span>
    </li>
  `).join('');

  container.innerHTML = `
    <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.6rem;">
      TODAY：今天最值得注意的 3 件事情
    </div>
    <ul class="top3-list">${top3Html}</ul>

    <div class="prime-goal-box">
      <div class="prime-goal-title">今日最重要的一件事</div>
      <div class="prime-goal-content">${advice.primeGoal}</div>
    </div>
  `;
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
    const refreshBtnDefaultHtml = refreshBtn.innerHTML;
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '載入最新數據…';

      await dataService.refreshAll();
      await loadAllBriefData();

      refreshBtn.disabled = false;
      refreshBtn.innerHTML = refreshBtnDefaultHtml;
    });
  }

  const settingsBtn = document.getElementById('btn-open-settings');
  const modalOverlay = document.getElementById('modal-roadmap');
  const closeModalBtn = document.getElementById('btn-close-modal');
  const modalContent = modalOverlay ? modalOverlay.querySelector('.modal-content') : null;

  if (modalOverlay && modalContent) {
    window.fluidModalInstance = new AppleFluidModal(modalOverlay, modalContent, settingsBtn, closeModalBtn);
  }

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

