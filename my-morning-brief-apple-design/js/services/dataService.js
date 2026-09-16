/**
 * Data Service Layer (Strategy A: Direct Deploy — No Repository Write-back)
 *
 * 部署策略說明：
 *   GitHub Actions 執行 generate_brief.py → 產生 today.json
 *   → upload-pages-artifact → deploy-pages → GitHub Pages
 *
 *   Repository 裡的 data/today.json 是「靜態佔位符」，
 *   它的日期永遠不等於 Pages 上的日期，這是正常行為。
 *   瀏覽器實際載入的是 GitHub Pages 上由 Actions 每天新產生的版本。
 *
 * Priority 1: Fetches `data/today.json` generated daily at 08:00 AM by GitHub Actions.
 * Priority 2: Fallback to local `mockData.js` if `data/today.json` is unavailable.
 */

import { mockData } from '../mockData.js';

let liveDataCache = null;
let _loadedFromUrl = null;

/**
 * Fetch `data/today.json` from GitHub Pages (Strategy A).
 * Debug logs let you verify in DevTools exactly which file was loaded.
 */
async function fetchLiveTodayJson() {
  if (liveDataCache) return liveDataCache;
  try {
    const url = './data/today.json?t=' + Date.now();
    const response = await fetch(url);

    // ── DEBUG: 確認實際載入的 today.json URL ──────────────────────────────────
    console.log('[dataService] today.json fetch URL:', response.url);
    console.log('[dataService] today.json HTTP status:', response.status, response.statusText);
    // ─────────────────────────────────────────────────────────────────────────

    if (response.ok) {
      const data = await response.json();
      liveDataCache = data;
      _loadedFromUrl = response.url;

      // ── DEBUG: 顯示完整 today.json 內容 ──────────────────────────────────────
      console.log('[dataService] today.json loaded successfully:', data);
      const bi = data.buildInfo || {};
      console.log(
        `[dataService] Build Metadata — Run #${bi.workflowRunNumber || 'N/A'} | ` +
        `Commit ${bi.commitHash || 'N/A'} | GeneratedAt ${bi.generatedAt || data.briefMeta?.generatedAt || 'N/A'}`
      );
      // ─────────────────────────────────────────────────────────────────────────

      return liveDataCache;
    }
  } catch (e) {
    console.warn('[dataService] `data/today.json` not available or running offline, using mockData fallback:', e);
  }
  return null;
}

export const dataService = {
  /** 目前載入的 today.json URL（供 Debug Widget 使用）*/
  getLoadedUrl() {
    return _loadedFromUrl;
  },

  async getHeaderInfo() {
    const live = await fetchLiveTodayJson();
    if (live) {
      return {
        user: live.user,
        meta: {
          ...live.briefMeta,
          lastUpdated: live.briefMeta.time,
          isStale: false
        }
      };
    }
    return {
      user: mockData.user,
      meta: {
        ...mockData.briefMeta,
        date: `${mockData.briefMeta.date} (⚠️ 顯示離線備份資料)`,
        lastUpdated: mockData.briefMeta.time,
        isStale: true
      }
    };
  },

  async getWeather() {
    const live = await fetchLiveTodayJson();
    return live ? live.weather : mockData.weather;
  },

  async getHoroscope() {
    const live = await fetchLiveTodayJson();
    return live ? live.horoscope : mockData.horoscope;
  },

  async getExchangeRate() {
    const live = await fetchLiveTodayJson();
    return live ? live.exchangeRate : mockData.exchangeRate;
  },

  async getDrivingQuiz() {
    const live = await fetchLiveTodayJson();
    return live ? live.drivingQuiz : mockData.drivingQuiz;
  },

  async getAiNews() {
    const live = await fetchLiveTodayJson();
    return live ? live.aiNews : mockData.aiNews;
  },

  async getDailyAdvice() {
    const live = await fetchLiveTodayJson();
    return live ? live.dailyAdvice : mockData.dailyAdvice;
  },

  /** 取得 buildInfo（供 Debug Widget 使用）*/
  async getBuildInfo() {
    const live = await fetchLiveTodayJson();
    return live ? (live.buildInfo || {}) : {};
  },

  async refreshAll() {
    liveDataCache = null;
    _loadedFromUrl = null;
    const live = await fetchLiveTodayJson();
    return {
      weather: live ? live.weather : mockData.weather,
      horoscope: live ? live.horoscope : mockData.horoscope,
      exchangeRate: live ? live.exchangeRate : mockData.exchangeRate,
      drivingQuiz: live ? live.drivingQuiz : mockData.drivingQuiz,
      aiNews: live ? live.aiNews : mockData.aiNews,
      dailyAdvice: live ? live.dailyAdvice : mockData.dailyAdvice
    };
  }
};
