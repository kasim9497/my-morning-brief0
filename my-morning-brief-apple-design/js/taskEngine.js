/**
 * Task Engine — 今日任務清單狀態機
 * 狀態：pending / done / postponed / skipped
 * 資料存 localStorage，依星期固定作息表 (v4) 自動產生每日任務。
 */

const STORAGE_KEY = 'morningBrief.taskEngine.v1';

// 星期固定任務範本（0=週日 ... 6=週六，對齊 Date.getDay()）
export const TASK_DEFS = {
  supplement: { label: '吃保健食品', icon: '💊' },
  watch: { label: '追劇：至少看完一集', icon: '📺' },
  exercise_run_strength: { label: '運動：跑步 2km + 重訓', icon: '🏃' },
  exercise_strength: { label: '運動：重訓', icon: '🏋️' },
  veggie_day: { label: '蔬果日：記得吃夠蔬果', icon: '🥦' },
  post_short: { label: 'PO 文：簡短更新', icon: '📝' },
  post_weekly_review: { label: 'PO 文：一週回顧整理', icon: '🗒️' },
  laundry_shopping: { label: '洗衣打掃 + 採買下週蔬果', icon: '🧺' },
  monthly_maintenance: { label: '居家用品檢查（濾心／除溼袋／馬桶殺菌球）', icon: '🔧' },
  monthly_trip_planning: { label: '旅遊規劃（20–30 分鐘）', icon: '🗺️' },
};

// 每天都會出現、不開放調整的固定任務
const ALWAYS_DAILY_TASK_IDS = ['supplement', 'watch'];

// 可以在「設定」頁調整星期幾出現的任務，預設對應 v4 固定作息表
const CONFIGURABLE_TASK_IDS = [
  'exercise_run_strength',
  'exercise_strength',
  'veggie_day',
  'post_short',
  'post_weekly_review',
  'laundry_shopping',
];

const DEFAULT_ROUTINE_CONFIG = {
  exercise_run_strength: [2], // 週二
  exercise_strength: [4], // 週四
  veggie_day: [2], // 週二
  post_short: [3], // 週三
  post_weekly_review: [0], // 週日
  laundry_shopping: [0], // 週日
};

const POSTPONE_OPTIONS = [
  { value: 'plus1', label: '延到明天' },
  { value: 'plus2', label: '延 2 天' },
  { value: 'plus3', label: '延 3 天' },
  { value: 'nextWeek', label: '延到下週同一天' },
  { value: 'skipWeek', label: '這件事跳過這週' },
];

export function getPostponeOptions() {
  return POSTPONE_OPTIONS;
}

// ── 日期工具（一律用本機時區的 YYYY-MM-DD 字串當 key）──────────────────

export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

export function getTodayStr() {
  return formatDate(new Date());
}

// 0=週日 ... 6=週六（對齊 Date.getDay()）
export function getWeekday(dateStr) {
  return parseDate(dateStr).getDay();
}

// 本週結束日（週一為週首、週日為週末），用來判斷「跳過這週」要蓋到哪一天
function getWeekEndStr(dateStr) {
  const d = parseDate(dateStr);
  const weekday = d.getDay(); // 0=週日
  const daysUntilSunday = weekday === 0 ? 0 : 7 - weekday;
  d.setDate(d.getDate() + daysUntilSunday);
  return formatDate(d);
}

function isFirstSundayOfMonth(dateStr) {
  const d = parseDate(dateStr);
  return d.getDay() === 0 && d.getDate() <= 7;
}

// ── 儲存層 ──────────────────────────────────────────────────────────

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { days: {}, skipWeekUntil: {}, routineConfig: { ...DEFAULT_ROUTINE_CONFIG } };
    const parsed = JSON.parse(raw);
    return {
      days: parsed.days || {},
      skipWeekUntil: parsed.skipWeekUntil || {},
      routineConfig: { ...DEFAULT_ROUTINE_CONFIG, ...(parsed.routineConfig || {}) },
    };
  } catch (e) {
    console.warn('[taskEngine] localStorage 讀取失敗，使用空白狀態：', e);
    return { days: {}, skipWeekUntil: {}, routineConfig: { ...DEFAULT_ROUTINE_CONFIG } };
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('[taskEngine] localStorage 寫入失敗：', e);
  }
}

let store = loadStore();

// ── 任務產生 ────────────────────────────────────────────────────────

function getTemplateIdsForDate(dateStr) {
  const weekday = parseDate(dateStr).getDay();
  const ids = [...ALWAYS_DAILY_TASK_IDS];
  for (const defId of CONFIGURABLE_TASK_IDS) {
    if ((store.routineConfig[defId] || []).includes(weekday)) ids.push(defId);
  }
  if (isFirstSundayOfMonth(dateStr)) {
    ids.push('monthly_maintenance', 'monthly_trip_planning');
  }
  return ids.filter((defId) => {
    const suppressedUntil = store.skipWeekUntil[defId];
    return !suppressedUntil || dateStr > suppressedUntil;
  });
}

// ── 作息設定（給 SettingsView.js 用）───────────────────────────────────

export function getConfigurableTaskIds() {
  return [...CONFIGURABLE_TASK_IDS];
}

/** 回傳目前每個可調整任務出現在哪些星期幾（0=週日...6=週六） */
export function getRoutineConfig() {
  return JSON.parse(JSON.stringify(store.routineConfig));
}

export function setTaskWeekdays(defId, weekdays) {
  if (!CONFIGURABLE_TASK_IDS.includes(defId)) return;
  store.routineConfig[defId] = [...new Set(weekdays)].sort((a, b) => a - b);
  saveStore(store);
}

function ensureDateInitialized(dateStr) {
  if (!store.days[dateStr]) store.days[dateStr] = {};
  const dayEntries = store.days[dateStr];
  for (const defId of getTemplateIdsForDate(dateStr)) {
    if (!dayEntries[defId]) {
      dayEntries[defId] = { defId, status: 'pending' };
    }
  }
}

/**
 * 取得某一天的任務清單（含當天固定任務 + 從其他天延過來的任務）
 * 回傳陣列，每筆：{ instanceId, defId, label, icon, status, carriedFrom }
 */
export function getTasksForDate(dateStr) {
  ensureDateInitialized(dateStr);
  saveStore(store);

  const dayEntries = store.days[dateStr] || {};
  return Object.entries(dayEntries).map(([instanceId, entry]) => {
    const def = TASK_DEFS[entry.defId] || { label: entry.defId, icon: '•' };
    return {
      instanceId,
      defId: entry.defId,
      label: def.label,
      icon: def.icon,
      status: entry.status,
      carriedFrom: entry.carriedFrom || null,
    };
  });
}

// ── 狀態變更 ────────────────────────────────────────────────────────

export function toggleDone(dateStr, instanceId) {
  const entry = store.days[dateStr]?.[instanceId];
  if (!entry) return;
  entry.status = entry.status === 'done' ? 'pending' : 'done';
  saveStore(store);
}

export function skipTask(dateStr, instanceId) {
  const entry = store.days[dateStr]?.[instanceId];
  if (!entry) return;
  entry.status = 'skipped';
  saveStore(store);
}

/**
 * 延後任務。option 對應 POSTPONE_OPTIONS 的 value。
 * plus1/plus2/plus3/nextWeek：把任務併入目標日期，今天標記為 postponed。
 * skipWeek：今天標記為 skipped，並讓這個任務本週剩下的天數都不再產生。
 */
export function postponeTask(dateStr, instanceId, option) {
  const entry = store.days[dateStr]?.[instanceId];
  if (!entry) return;

  if (option === 'skipWeek') {
    entry.status = 'skipped';
    const weekEnd = getWeekEndStr(dateStr);
    const existing = store.skipWeekUntil[entry.defId];
    if (!existing || weekEnd > existing) {
      store.skipWeekUntil[entry.defId] = weekEnd;
    }
    // 本週已經產生過、但還沒完成的同一項任務也一併標記跳過
    for (const [otherDateStr, entries] of Object.entries(store.days)) {
      if (otherDateStr <= dateStr || otherDateStr > weekEnd) continue;
      const other = entries[entry.defId];
      if (other && other.status === 'pending') other.status = 'skipped';
    }
    saveStore(store);
    return;
  }

  const daysMap = { plus1: 1, plus2: 2, plus3: 3, nextWeek: 7 };
  const offset = daysMap[option];
  if (!offset) return;

  const targetDateStr = addDays(dateStr, offset);
  entry.status = 'postponed';

  ensureDateInitialized(targetDateStr);
  const targetInstanceId = `${entry.defId}__from_${dateStr}`;
  store.days[targetDateStr][targetInstanceId] = {
    defId: entry.defId,
    status: 'pending',
    carriedFrom: dateStr,
  };

  saveStore(store);
}
