/**
 * 倒數計時資料層
 * 資料存 localStorage，預設帶一筆「交換學期結束」倒數，使用者可以增刪自訂倒數
 */

const STORAGE_KEY = 'morningBrief.countdowns.v1';
const DEFAULT_END_DATE = '2027-01-31';

function loadCountdowns() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedDefault();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : seedDefault();
  } catch (e) {
    console.warn('[countdown] localStorage 讀取失敗，使用預設值：', e);
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

function saveCountdowns(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[countdown] localStorage 寫入失敗：', e);
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
  if (!trimmedLabel || !targetDate) return;
  countdowns.push({ id: `cd-${Date.now()}`, label: trimmedLabel, targetDate });
  saveCountdowns(countdowns);
}

export function removeCountdown(id) {
  countdowns = countdowns.filter((c) => c.id !== id);
  saveCountdowns(countdowns);
}
