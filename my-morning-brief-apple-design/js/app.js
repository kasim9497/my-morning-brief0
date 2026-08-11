/**
 * Personal AI Morning Brief - Application Logic & Component Rendering
 */

import { dataService } from './services/dataService.js';

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
  setupInstantPressListeners();
  setupScrollShadow();
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

    const newsData = await dataService.getAiNews();
    renderAiNews(newsData);

    const adviceData = await dataService.getDailyAdvice();
    renderDailyAdvice(adviceData);

    // §16: Staggered card entrance after all content is rendered
    triggerCardStagger();

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

/**
 * Render Header & Greeting
 */
function renderHeader({ user, meta }) {
  document.getElementById('header-date').textContent = meta.date;
  document.getElementById('header-updated-time').textContent = `更新時間：${meta.lastUpdated}`;
  document.getElementById('greeting-user').textContent = `早安，${user.name}！`;
  document.getElementById('greeting-desc').textContent = meta.greeting;

  const locPill = document.getElementById('header-location-pill');
  if (locPill) {
    const locText = (user.city && user.district) 
      ? `${user.city}${user.district}` 
      : (user.city || user.location || '新北市蘆洲區');
    locPill.textContent = `📍 ${locText}`;
  }
}

/**
 * Render Weather Widget
 */
function renderWeather(w) {
  const container = document.getElementById('weather-widget-content');
  container.innerHTML = `
    <div style="font-size: 0.82rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.35rem;">
      📍 ${w.location || '新北市蘆洲區'}
    </div>
    <div class="weather-main">
      <div>
        <div class="weather-temp">${w.tempCurrent}</div>
        <div class="weather-condition">${w.condition}</div>
      </div>
      <div style="font-size: 2.5rem;">🌤️</div>
    </div>
    
    <div class="weather-details">
      <div class="weather-detail-item">
        <span class="weather-detail-label">最低 / 最高：</span>
        <span class="weather-detail-val">${w.tempMin} ~ ${w.tempMax}</span>
      </div>
      <div class="weather-detail-item">
        <span class="weather-detail-label">降雨機率：</span>
        <span class="weather-detail-val" style="color: var(--primary-color);">${w.rainChance}</span>
      </div>
      <div class="weather-detail-item">
        <span class="weather-detail-label">體感溫度：</span>
        <span class="weather-detail-val">${w.feelsLike}</span>
      </div>
      <div class="weather-detail-item">
        <span class="weather-detail-label">紫外線指數：</span>
        <span class="weather-detail-val">${w.uvIndex}</span>
      </div>
    </div>

    <div class="ai-tip-box">
      <div class="ai-tip-title">💡 今日 AI 出門提醒</div>
      <div>${w.aiTip}</div>
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
      <div style="font-size: 1.1rem; font-weight: 700;">${h.sign}</div>
      <div class="stars">${h.ratingStars}</div>
    </div>

    <div class="horoscope-meta">
      <span class="tag-lucky">幸運色：${h.luckyColor}</span>
      <span class="tag-lucky">幸運數字：${h.luckyNumber}</span>
    </div>

    <div class="horoscope-summary">
      <strong>✨ AI 今日運勢摘要：</strong><br/>
      ${h.aiSummary}
    </div>

    <div class="horoscope-categories">
      <div class="cat-item"><span class="cat-name">整體：</span><span>${h.details.overall}</span></div>
      <div class="cat-item"><span class="cat-name">工作：</span><span>${h.details.work}</span></div>
      <div class="cat-item"><span class="cat-name">感情：</span><span>${h.details.love}</span></div>
      <div class="cat-item"><span class="cat-name">財運：</span><span>${h.details.wealth}</span></div>
      <div class="cat-item"><span class="cat-name">健康：</span><span>${h.details.health}</span></div>
    </div>
  `;
}

/**
 * Render Exchange Rate Widget (includes ExchangeRate-API attribution)
 */
function renderExchangeRate(r) {
  const container = document.getElementById('rate-widget-content');
  const changeClass = r.isUp ? 'rate-up' : 'rate-down';
  
  const maxVal = Math.max(...r.last7Days);
  const minVal = Math.min(...r.last7Days);
  const range = maxVal - minVal || 0.01;
  
  const barsHtml = r.last7Days.map((val, idx) => {
    const heightPercent = Math.max(20, Math.round(((val - minVal) / range) * 80 + 20));
    const isActive = idx === r.last7Days.length - 1 ? 'active' : '';
    return `<div class="bar ${isActive}" style="height: ${heightPercent}%;" title="Day ${idx+1}: ${val}"></div>`;
  }).join('');

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
      <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">${r.pair}</span>
      <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener" style="font-size: 0.7rem; color: var(--text-muted); text-decoration: underline;">
        Rates by ExchangeRate-API
      </a>
    </div>
    
    <div class="rate-display">
      <div class="rate-primary">1 CNY ≈ ${r.current.toFixed(2)} TWD</div>
      <div class="rate-change ${changeClass}">
        ${r.change > 0 ? '▲' : '▼'} ${Math.abs(r.change).toFixed(2)} (${r.changePercent})
      </div>
    </div>

    <div class="rate-meta">
      <span>昨日收盤：${r.yesterday.toFixed(2)}</span>
      <span>${r.updateTime}</span>
    </div>

    <div class="sparkline-container">
      <div class="sparkline-title">近 7 日匯率走勢 (CNY / TWD)</div>
      <div class="sparkline-bars">
        ${barsHtml}
      </div>
    </div>
  `;

  // §1: Instant hover highlight on sparkline bars
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
          ${isCorrect ? '✅ 答對了！' : `❌ 答錯了！正確答案是 (${currentQ.answer})`}
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
      <span class="quiz-cat-tag">🏷️ ${currentQ.category}</span>
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
          🔄 重新練習
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

function renderAiNews(newsList) {
  const container = document.getElementById('news-widget-content');
  const itemsHtml = newsList.map(n => `
    <div class="news-item">
      <div class="news-source-tag">📌 ${n.source}</div>
      <div class="news-title">${n.title}</div>
      <div class="news-summary"><strong>一句話摘要：</strong>${n.summary}</div>
      <div class="news-why"><strong>💡 為什麼重要：</strong>${n.whyImportant}</div>
      <div class="news-impact"><strong>🎯 對我的意義：</strong>${n.myImpact}</div>
    </div>
  `).join('');

  container.innerHTML = `<div class="news-list">${itemsHtml}</div>`;
}

function renderDailyAdvice(advice) {
  const container = document.getElementById('advice-widget-content');
  
  const top3Html = advice.top3.map(item => `
    <li class="top3-item">
      <span style="font-size: 1.1rem;">${item.icon}</span>
      <span>${item.text}</span>
    </li>
  `).join('');

  container.innerHTML = `
    <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.6rem;">
      🎯 TODAY：今天最值得注意的 3 件事情
    </div>
    <ul class="top3-list">${top3Html}</ul>

    <div class="prime-goal-box">
      <div class="prime-goal-title">⭐ 今日最重要的一件事</div>
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
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '⏳ 載入最新數據...';
      
      await dataService.refreshAll();
      await loadAllBriefData();

      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 重新整理晨報';
    });
  }

  const settingsBtn = document.getElementById('btn-open-settings');
  const modalOverlay = document.getElementById('modal-roadmap');
  const closeModalBtn = document.getElementById('btn-close-modal');
  const modalContent = modalOverlay ? modalOverlay.querySelector('.modal-content') : null;

  if (modalOverlay && modalContent) {
    window.fluidModalInstance = new AppleFluidModal(modalOverlay, modalContent, settingsBtn, closeModalBtn);
  }
}
