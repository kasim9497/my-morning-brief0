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
  await loadAllBriefData();
  setupEventListeners();
});

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

  } catch (err) {
    console.error("Failed to render brief:", err);
  }
}

/**
 * Render Header & Greeting
 */
function renderHeader({ user, meta }) {
  document.getElementById('header-date').textContent = meta.date;
  document.getElementById('header-updated-time').textContent = `更新時間：${meta.lastUpdated}`;
  document.getElementById('greeting-user').textContent = `早安，${user.name}！`;
  document.getElementById('greeting-desc').textContent = meta.greeting;
}

/**
 * Render Weather Widget
 */
function renderWeather(w) {
  const container = document.getElementById('weather-widget-content');
  container.innerHTML = `
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
    btn.addEventListener('click', (e) => {
      const selectedKey = e.currentTarget.getAttribute('data-key');
      handleQuizAnswer(currentQ.id, selectedKey);
    });
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

function handleQuizAnswer(qId, selectedKey) {
  if (quizState.userAnswers[qId]) return;

  quizState.userAnswers[qId] = selectedKey;
  const q = quizState.questions.find(item => item.id === qId);
  if (q && q.answer === selectedKey) {
    quizState.score++;
  }

  renderDrivingQuiz();
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

  if (settingsBtn && modalOverlay && closeModalBtn) {
    settingsBtn.addEventListener('click', () => {
      modalOverlay.classList.add('active');
    });

    closeModalBtn.addEventListener('click', () => {
      modalOverlay.classList.remove('active');
    });

    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        modalOverlay.classList.remove('active');
      }
    });
  }
}
