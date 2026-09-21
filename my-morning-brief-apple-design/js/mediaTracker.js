/**
 * 追劇／讀書進度資料層
 * 資料存 localStorage，每日份量演算法照企劃書（個人排程AI助理_企劃書.md）5.1 節：
 * 每天的建議份量 = 剩餘量 ÷ 剩餘天數（無條件進位），落後的量會自動併入「剩餘量」，
 * 所以不用另外存 carry_over 欄位，重新算一次就自動含進去了。
 */

const STORAGE_KEY = 'morningBrief.mediaTracker.v1';

const TYPE_LABELS = {
  drama: { label: '劇', unit: '集' },
  book: { label: '書', unit: '頁' },
  movie: { label: '電影', unit: '部' },
};

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[mediaTracker] localStorage 讀取失敗，使用空清單：', e);
    return [];
  }
}

function saveItems(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[mediaTracker] localStorage 寫入失敗：', e);
  }
}

let items = loadItems();

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, '0');
  const nd = String(date.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

function daysBetween(fromStr, toStr) {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

export function getTypeInfo(type) {
  return TYPE_LABELS[type] || TYPE_LABELS.drama;
}

/**
 * 幫一筆項目算出：今天建議份量、是否落後、狀態
 * 剩餘天數包含今天（目標日 - 今天 + 1），落後的量不用另外存，
 * 直接用「剩餘量 ÷ 剩餘天數」重算一次平均值就自動含進去了（企劃書 5.1 節邏輯）
 */
export function computeProgress(item) {
  const today = todayStr();
  const remainingUnits = Math.max(0, item.totalUnits - item.completedUnits);
  const isDone = remainingUnits === 0;
  const isOverdue = !isDone && daysBetween(today, item.targetDate) < 0;

  const totalDays = Math.max(1, daysBetween(item.startDate, item.targetDate) + 1);
  const originalAverage = Math.ceil(item.totalUnits / totalDays);

  const remainingDays = Math.max(1, daysBetween(today, item.targetDate) + 1);
  const todayQuota = isDone ? 0 : Math.ceil(remainingUnits / remainingDays);

  // 落後太多：目前需要的份量超過原本平均的 1.5 倍，提示使用者考慮延後目標日
  // （企劃書 5.2 節：不要默默要求硬看更多，要讓使用者自己決定）
  const isFallingBehind = !isDone && todayQuota > originalAverage * 1.5;

  let status = '進行中';
  if (isDone) status = '已完成';
  else if (isOverdue) status = '已逾期';

  return {
    remainingUnits,
    todayQuota,
    originalAverage,
    isDone,
    isOverdue,
    isFallingBehind,
    status,
  };
}

export function getMediaItems() {
  return [...items]
    .map((item) => ({ ...item, progress: computeProgress(item) }))
    .sort((a, b) => {
      if (a.progress.isDone !== b.progress.isDone) return a.progress.isDone ? 1 : -1;
      return daysBetween(todayStr(), a.targetDate) - daysBetween(todayStr(), b.targetDate);
    });
}

export function addMediaItem(title, type, totalUnits, targetDate) {
  const trimmedTitle = (title || '').trim();
  const units = Number(totalUnits);
  if (!trimmedTitle || !targetDate || !Number.isFinite(units) || units <= 0) return;

  items.push({
    id: `media-${Date.now()}`,
    title: trimmedTitle,
    type: TYPE_LABELS[type] ? type : 'drama',
    totalUnits: Math.round(units),
    startDate: todayStr(),
    targetDate,
    completedUnits: 0,
  });
  saveItems(items);
}

export function removeMediaItem(id) {
  items = items.filter((item) => item.id !== id);
  saveItems(items);
}

/** 記錄今天看/讀了幾集/幾頁，累加進 completedUnits */
export function logProgress(id, unitsToday) {
  const n = Number(unitsToday);
  if (!Number.isFinite(n) || n <= 0) return;
  items = items.map((item) => {
    if (item.id !== id) return item;
    return { ...item, completedUnits: Math.min(item.totalUnits, item.completedUnits + Math.round(n)) };
  });
  saveItems(items);
}

/** 延後目標日 N 天（落後太多時使用者自己決定要不要延，而不是系統默默加量） */
export function postponeTarget(id, days) {
  items = items.map((item) => {
    if (item.id !== id) return item;
    return { ...item, targetDate: addDaysStr(item.targetDate, days) };
  });
  saveItems(items);
}
