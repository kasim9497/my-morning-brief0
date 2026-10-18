/**
 * 睡眠紀錄：在睡眠計算機選了起床時間、按「確認現在睡」時記一筆（幾點上床、選了幾點起床）。
 * 本週摘要會把最近 7 晚的紀錄一起交給 Claude 分析。
 * 早上按「我起床了」會再記實際起床的時間（wokeAt）；沒按的那幾天只有選的鬧鐘時間（wakeAt）。
 * 資料存 localStorage（key 用 morningBrief. 開頭，會被備份涵蓋）
 */

const STORAGE_KEY = 'morningBrief.sleepLog.v1';
// 留兩個月就夠看趨勢，不要讓備份越長越大
const KEEP = 60;
// 同一晚按了兩次確認（改主意、重新算過）只留最後一次
const SAME_NIGHT_MS = 6 * 3600 * 1000;

const pad = (n) => String(n).padStart(2, '0');

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (e) {
    return [];
  }
}

function save(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-KEEP)));
}

/** 由舊到新 */
export function getSleepLog() {
  return load().sort((a, b) => Date.parse(a.bedAt) - Date.parse(b.bedAt));
}

/** 記一筆。bedAt、wakeAt 是 Date */
export function logSleep(bedAt, wakeAt, cycles) {
  const list = getSleepLog().filter((entry) => Math.abs(Date.parse(entry.bedAt) - bedAt.getTime()) >= SAME_NIGHT_MS);
  const entry = {
    id: `sleep_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    bedAt: bedAt.toISOString(),
    wakeAt: wakeAt.toISOString(),
    cycles,
  };
  save([...list, entry].sort((a, b) => Date.parse(a.bedAt) - Date.parse(b.bedAt)));
  return entry;
}

/** 早上按「我起床了」 */
export function logWake(id, at = new Date()) {
  const list = getSleepLog();
  const entry = list.find((item) => item.id === id);
  if (!entry) return false;
  entry.wokeAt = at.toISOString();
  save(list);
  return true;
}

/**
 * 現在該不該問「起床了嗎」：最新一筆還沒按過，而且上床已經 2 到 16 小時。
 * 太早（剛躺下）不問，太晚（已經過了一整天）也不問，那一筆就只留鬧鐘時間
 */
export function pendingWake(now = new Date()) {
  const last = getSleepLog().at(-1);
  if (!last || last.wokeAt) return null;
  const elapsed = now.getTime() - Date.parse(last.bedAt);
  return elapsed >= 2 * 3600000 && elapsed <= 16 * 3600000 ? last : null;
}

export function removeSleepEntry(id) {
  save(getSleepLog().filter((entry) => entry.id !== id));
}

/** 這一筆算哪一晚（YYYY-MM-DD）：凌晨 5 點前上床的算前一天晚上，跟就寢提醒同一套規則 */
export function nightOf(entry) {
  const bed = new Date(entry.bedAt);
  if (bed.getHours() < 5) bed.setDate(bed.getDate() - 1);
  return `${bed.getFullYear()}-${pad(bed.getMonth() + 1)}-${pad(bed.getDate())}`;
}

export function clockOf(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 從上床到起床幾小時（含入睡的那 15 分鐘）。有按「我起床了」用實際的，沒有就用選的鬧鐘時間 */
export function hoursOf(entry) {
  return +((Date.parse(entry.wokeAt || entry.wakeAt) - Date.parse(entry.bedAt)) / 3600000).toFixed(1);
}
