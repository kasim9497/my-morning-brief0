/**
 * 題庫哪幾天有做完：{ 'YYYY-MM-DD': { score, total } }。
 * 今日頁用它算「連續幾天」和今天的成績。做完當天的十題時由 app.js 記一筆。
 * 資料存 localStorage（key 用 morningBrief. 開頭，會被備份涵蓋）
 */

const STORAGE_KEY = 'morningBrief.quizDays.v1';
// 留四個月：算連續天數夠用，備份也不會越長越大
const KEEP = 120;

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function getQuizDays() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch (e) {
    return {};
  }
}

/** 今天的十題做完了。同一天做第二次（重新整理後又做）就更新成績。回傳有沒有存成功 */
export function recordQuizDay(score, total, date = new Date()) {
  const days = getQuizDays();
  days[dayKey(date)] = { score, total };
  const kept = Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).slice(-KEEP));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
    return true;
  } catch (e) {
    console.warn('[quizHistory] localStorage 寫入失敗：', e);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('chenxu:save-failed'));
    return false;
  }
}
