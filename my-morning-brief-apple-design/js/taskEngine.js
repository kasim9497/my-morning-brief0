/**
 * Task Engine — 今日任務清單狀態機
 * 狀態：pending / done / postponed / skipped
 * 資料存 localStorage，依星期固定作息表 (v4) 自動產生每日任務。
 */

const STORAGE_KEY = 'morningBrief.taskEngine.v1';

// 星期固定任務範本（0=週日 ... 6=週六，對齊 Date.getDay()）
// icon 是 js/taskIcons.js 裡的圖示名稱，tint 是 styles.css 的 .tint-xxx 顏色
export const TASK_DEFS = {
  supplement: { label: '吃保健食品', icon: 'pill', tint: 'red' },
  watch: { label: '追劇：至少看完一集', icon: 'tv', tint: 'purple' },
  exercise_run_strength: { label: '運動：跑步 2km + 重訓', icon: 'pulse', tint: 'orange' },
  exercise_strength: { label: '運動：重訓', icon: 'dumbbell', tint: 'orange' },
  veggie_day: { label: '蔬果日：記得吃夠蔬果', icon: 'leaf', tint: 'green' },
  post_short: { label: 'PO 文：簡短更新', icon: 'pencil', tint: 'blue' },
  post_weekly_review: { label: 'PO 文：一週回顧整理', icon: 'note', tint: 'blue' },
  laundry_shopping: { label: '洗衣打掃 + 採買下週蔬果', icon: 'basket', tint: 'teal' },
  monthly_maintenance: { label: '居家用品檢查（濾心／除溼袋／馬桶殺菌球）', icon: 'wrench', tint: 'indigo' },
  monthly_trip_planning: { label: '旅遊規劃（20–30 分鐘）', icon: 'map', tint: 'teal' },
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

// 每個可調整任務的排程設定，有兩種 mode：
//   { mode: 'weekday', days: [0-6] }             固定星期幾（原本唯一的模式）
//   { mode: 'interval', everyNDays: N, anchorDate: 'YYYY-MM-DD' }  每 N 天一次，從 anchorDate 開始算
const DEFAULT_ROUTINE_CONFIG = {
  exercise_run_strength: { mode: 'weekday', days: [2] }, // 週二
  exercise_strength: { mode: 'weekday', days: [4] }, // 週四
  veggie_day: { mode: 'weekday', days: [2] }, // 週二
  post_short: { mode: 'weekday', days: [] }, // 預設不開，週回顧已經涵蓋 PO 文需求；想加回來可以在「設定」頁自己開
  post_weekly_review: { mode: 'weekday', days: [0] }, // 週日
  laundry_shopping: { mode: 'weekday', days: [0] }, // 週日
};

// 把舊版（純陣列 [0,2,4]）的存檔資料轉成新版 { mode: 'weekday', days } 物件，
// 不然舊使用者瀏覽器裡的資料會在新版邏輯裡被當成沒有設定
function normalizeRoutineConfig(rawConfig) {
  const normalized = { ...DEFAULT_ROUTINE_CONFIG };
  for (const [defId, value] of Object.entries(rawConfig || {})) {
    if (Array.isArray(value)) {
      normalized[defId] = { mode: 'weekday', days: value };
    } else if (value && typeof value === 'object') {
      normalized[defId] = value;
    }
  }
  return normalized;
}

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

function daysBetween(fromStr, toStr) {
  return Math.round((parseDate(toStr) - parseDate(fromStr)) / (1000 * 60 * 60 * 24));
}

function isTaskActiveOnDate(config, dateStr, weekday) {
  if (!config) return false;
  if (config.mode === 'interval') {
    if (!config.everyNDays || !config.anchorDate) return false;
    const diff = daysBetween(config.anchorDate, dateStr);
    return diff >= 0 && diff % config.everyNDays === 0;
  }
  return (config.days || []).includes(weekday);
}

// ── 儲存層 ──────────────────────────────────────────────────────────

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { days: {}, skipWeekUntil: {}, routineConfig: { ...DEFAULT_ROUTINE_CONFIG }, customTasks: {}, removedTaskIds: [] };
    const parsed = JSON.parse(raw);
    return {
      days: parsed.days || {},
      skipWeekUntil: parsed.skipWeekUntil || {},
      routineConfig: normalizeRoutineConfig(parsed.routineConfig),
      // 使用者自己加的作息項目：{ id: { label } }
      customTasks: parsed.customTasks || {},
      // 使用者刪掉的內建作息項目（內建的定義拿不掉，所以記「不要顯示」）
      removedTaskIds: parsed.removedTaskIds || [],
    };
  } catch (e) {
    console.warn('[taskEngine] localStorage 讀取失敗，使用空白狀態：', e);
    return { days: {}, skipWeekUntil: {}, routineConfig: { ...DEFAULT_ROUTINE_CONFIG }, customTasks: {}, removedTaskIds: [] };
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
  for (const defId of getConfigurableTaskIds()) {
    if (isTaskActiveOnDate(store.routineConfig[defId], dateStr, weekday)) ids.push(defId);
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

/** 「設定」頁可以調整的作息項目：沒被刪掉的內建項目 + 使用者自己加的 */
export function getConfigurableTaskIds() {
  return [
    ...CONFIGURABLE_TASK_IDS.filter((defId) => !store.removedTaskIds.includes(defId)),
    ...Object.keys(store.customTasks),
  ];
}

/** 任務的名稱和圖示。內建的查 TASK_DEFS，自訂的查使用者存的名稱 */
export function getTaskDef(defId) {
  if (TASK_DEFS[defId]) return TASK_DEFS[defId];
  const custom = store.customTasks[defId];
  return { label: custom ? custom.label : '已刪除的項目', icon: 'check', tint: 'blue' };
}

/** 新增一個自訂作息項目，一開始不排在任何一天，回傳它的 id */
export function addCustomTask(label) {
  const trimmed = String(label || '').trim();
  if (!trimmed) return null;
  const defId = `custom_${Date.now().toString(36)}`;
  store.customTasks[defId] = { label: trimmed };
  store.routineConfig[defId] = { mode: 'weekday', days: [] };
  saveStore(store);
  return defId;
}

/** 刪除一個作息項目。今天和之後還沒做的那幾筆一起拿掉，過去的紀錄留著 */
export function removeRoutineTask(defId) {
  if (!getConfigurableTaskIds().includes(defId)) return;
  if (store.customTasks[defId]) {
    delete store.customTasks[defId];
    delete store.routineConfig[defId];
  } else {
    store.removedTaskIds.push(defId);
  }
  const today = getTodayStr();
  for (const [dateStr, entries] of Object.entries(store.days)) {
    if (dateStr < today) continue;
    for (const [instanceId, entry] of Object.entries(entries)) {
      if (entry.defId === defId && entry.status === 'pending') delete entries[instanceId];
    }
  }
  saveStore(store);
}

export function hasRemovedDefaultTasks() {
  return store.removedTaskIds.length > 0;
}

/** 把刪掉的內建項目全部加回來（排程設定還留著） */
export function restoreDefaultTasks() {
  store.removedTaskIds = [];
  saveStore(store);
}

/** 回傳目前每個可調整任務的排程設定：{ mode: 'weekday', days } 或 { mode: 'interval', everyNDays, anchorDate } */
export function getRoutineConfig() {
  return JSON.parse(JSON.stringify(store.routineConfig));
}

export function setTaskWeekdaySchedule(defId, weekdays) {
  if (!getConfigurableTaskIds().includes(defId)) return;
  store.routineConfig[defId] = { mode: 'weekday', days: [...new Set(weekdays)].sort((a, b) => a - b) };
  saveStore(store);
}

/** anchorDate 預設今天：從設定的當下開始算「每 N 天」，不回頭補算過去 */
export function setTaskIntervalSchedule(defId, everyNDays, anchorDate = getTodayStr()) {
  if (!getConfigurableTaskIds().includes(defId)) return;
  const n = Math.max(1, Math.round(Number(everyNDays) || 1));
  store.routineConfig[defId] = { mode: 'interval', everyNDays: n, anchorDate };
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
    const def = getTaskDef(entry.defId);
    return {
      instanceId,
      defId: entry.defId,
      label: def.label,
      icon: def.icon,
      tint: def.tint,
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
  // 一定要擋已經不是 pending 的項目：UI 本身會把已延後/已跳過的任務停用，
  // 這條路走不到，但現在 AI 聊天框的 action executor 也會呼叫這個函式，
  // 沒有同樣的擋。如果對同一個 instance 重複呼叫，會用同一把
  // `defId__from_dateStr` key 覆寫掉目標日那筆「已經被延過去」的任務，
  // 把它的真實狀態（可能已經打勾完成或又被延到更後面）悄悄蓋掉
  if (entry.status !== 'pending') return;

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
