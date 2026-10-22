/**
 * 倒數計時資料層
 * 資料存 localStorage，預設帶一筆「交換學期結束」倒數，使用者可以增刪自訂倒數
 */

const STORAGE_KEY = 'morningBrief.countdowns.v1';
const DEFAULT_END_DATE = '2027-01-31';

// 讀不出來（或讀得出來但結構不對）的那份原樣另外存一份，不要被接下來的存檔蓋掉（也會跟著雲端備份走）
function keepUnreadable(raw) {
  try {
    if (raw) localStorage.setItem(`${STORAGE_KEY}.unreadable`, raw);
  } catch (e) {
    // 連留都留不住（空間滿了）就沒辦法了
  }
}

function loadCountdowns() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedDefault();
    const parsed = JSON.parse(raw);
    // 空的清單是使用者自己刪光的，照樣尊重；只有從來沒存過才放預設那一筆
    return Array.isArray(parsed) ? parsed : seedDefault();
  } catch (e) {
    console.warn('[countdown] localStorage 讀取失敗，使用預設值：', e);
    keepUnreadable(raw);
    return seedDefault();
  }
}

function seedDefault() {
  const seeded = [
    { id: 'default-exchange-end', label: '交換學期結束', targetDate: DEFAULT_END_DATE },
  ];
  saveCountdowns(seeded);
  return seeded;
}

/** 存檔，回傳有沒有存成功；失敗時退回最後一次存成功的清單（同 taskEngine.js 的 saveStore） */
function saveCountdowns(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.warn('[countdown] localStorage 寫入失敗：', e);
    countdowns = loadCountdowns();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('chenxu:save-failed'));
    return false;
  }
}

let countdowns = loadCountdowns();

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(fromStr, toStr) {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

/** 依剩餘天數排序（越快到的排越前面），回傳含 daysLeft 的清單 */
export function getCountdowns() {
  const today = todayStr();
  return [...countdowns]
    .map((c) => ({ ...c, daysLeft: daysBetween(today, c.targetDate) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export function addCountdown(label, targetDate) {
  const trimmedLabel = (label || '').trim();
  if (!trimmedLabel || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate || '')) return false;
  countdowns.push({ id: `cd-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label: trimmedLabel, targetDate });
  return saveCountdowns(countdowns);
}

export function removeCountdown(id) {
  if (!countdowns.some((c) => c.id === id)) return false;
  countdowns = countdowns.filter((c) => c.id !== id);
  return saveCountdowns(countdowns);
}
