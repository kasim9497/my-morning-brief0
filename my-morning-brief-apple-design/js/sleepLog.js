/**
 * 睡眠紀錄。兩種：
 * - 晚上的睡眠（kind: 'night'，舊資料沒有 kind 也算這種）：按「確認現在睡」記上床時間和選的起床時間（wakeAt）；
 *   早上按「我起床了」記實際起床（wokeAt），再答兩題：怎麼醒的（wakeType）、精神（energy）。
 *   起來上廁所又睡回去不用記；按了「我起床了」才又睡回去，按「又睡回去了」，那一晚多算一次醒來（wakeUps）。
 * - 小睡（kind: 'nap'）：自己補記開始和結束，可以標「不是故意的」（坐著就睡著）。
 * 時間都可以事後改。本週摘要會把最近 7 天交給 Claude 分析。
 * 資料存 localStorage（key 用 morningBrief. 開頭，會被備份涵蓋）
 */

const STORAGE_KEY = 'morningBrief.sleepLog.v1';
// 留兩個月就夠看趨勢，不要讓備份越長越大
const KEEP = 80;
// 同一晚按了兩次確認（改主意、重新算過）只留最後一次；已經起床的那筆不算重複
const SAME_NIGHT_MS = 6 * 3600 * 1000;
// 按了「我起床了」之後多久內還問那兩題、還能按「又睡回去了」
const MORNING_WINDOW_MS = 3 * 3600 * 1000;

export const WAKE_TYPES = { alarm: '鬧鐘叫醒', natural: '自然醒', early: '提早醒、睡不回去' };
export const ENERGY = { 1: '很累', 2: '普通', 3: '清醒' };

const pad = (n) => String(n).padStart(2, '0');
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const isNap = (entry) => entry.kind === 'nap';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (e) {
    return [];
  }
}

function save(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.sort((a, b) => Date.parse(a.bedAt) - Date.parse(b.bedAt)).slice(-KEEP)));
}

/** 由舊到新，晚上和小睡混在一起 */
export function getSleepLog() {
  return load().sort((a, b) => Date.parse(a.bedAt) - Date.parse(b.bedAt));
}

const lastNight = (log) => [...log].reverse().find((entry) => !isNap(entry)) || null;

function update(id, change) {
  const list = getSleepLog();
  const entry = list.find((item) => item.id === id);
  if (!entry) return false;
  change(entry);
  save(list);
  return true;
}

/** 按「確認現在睡」。bedAt、wakeAt 是 Date，hours 是選的睡眠機會 */
export function logSleep(bedAt, wakeAt, hours) {
  const list = getSleepLog().filter((entry) => isNap(entry) || entry.wokeAt || Math.abs(Date.parse(entry.bedAt) - bedAt.getTime()) >= SAME_NIGHT_MS);
  const entry = { id: newId('sleep'), kind: 'night', bedAt: bedAt.toISOString(), wakeAt: wakeAt.toISOString(), hours };
  save([...list, entry]);
  return entry;
}

/** 補記一次小睡 */
export function logNap(start, end, dozed = false) {
  const entry = { id: newId('nap'), kind: 'nap', bedAt: start.toISOString(), wokeAt: end.toISOString(), dozed: !!dozed };
  save([...getSleepLog(), entry]);
  return entry;
}

/** 早上按「我起床了」 */
export function logWake(id, at = new Date()) {
  return update(id, (entry) => { entry.wokeAt = at.toISOString(); });
}

/** 起床後那兩題：怎麼醒的、精神 */
export function answerMorning(id, answer) {
  return update(id, (entry) => {
    if (WAKE_TYPES[answer.wakeType]) entry.wakeType = answer.wakeType;
    if (ENERGY[answer.energy]) entry.energy = Number(answer.energy);
  });
}

/** 按了「我起床了」又睡回去：那一晚還沒結束，多記一次醒來 */
export function backToSleep(id) {
  return update(id, (entry) => {
    delete entry.wokeAt;
    delete entry.wakeType;
    delete entry.energy;
    entry.wakeUps = (entry.wakeUps || 0) + 1;
  });
}

/**
 * 早上那一塊現在該顯示什麼：
 * - { stage: 'wake' }：最後一晚還沒按「我起床了」，而且上床已經 2 到 16 小時（剛躺下不問，過了一整天也不問）
 * - { stage: 'questions' }：起床 3 小時內，那兩題還沒答完
 * - null：都不用
 */
export function morningState(now = new Date(), log = getSleepLog()) {
  const entry = lastNight(log);
  if (!entry) return null;
  if (!entry.wokeAt) {
    const elapsed = now.getTime() - Date.parse(entry.bedAt);
    return elapsed >= 2 * 3600000 && elapsed <= 16 * 3600000 ? { stage: 'wake', entry } : null;
  }
  const sinceWake = now.getTime() - Date.parse(entry.wokeAt);
  if (sinceWake < 0 || sinceWake > MORNING_WINDOW_MS) return null;
  return entry.wakeType && entry.energy ? null : { stage: 'questions', entry };
}

/** 舊的名字：還沒按「我起床了」的那一晚 */
export function pendingWake(now = new Date(), log = getSleepLog()) {
  const state = morningState(now, log);
  return state && state.stage === 'wake' ? state.entry : null;
}

/** 這一筆算哪一天（YYYY-MM-DD）。晚上的：凌晨 5 點前上床算前一天晚上，跟就寢提醒同一套規則；小睡就是當天 */
export function nightOf(entry) {
  const bed = new Date(entry.bedAt);
  if (!isNap(entry) && bed.getHours() < 5) bed.setDate(bed.getDate() - 1);
  return `${bed.getFullYear()}-${pad(bed.getMonth() + 1)}-${pad(bed.getDate())}`;
}

/**
 * 事後改時間（「HH:MM」）。日期不用選：上床時間照那一晚推（凌晨的算隔天），
 * 起床時間取上床之後第一次到那個時刻。晚上的改起床時間就是改實際起床
 */
export function editTimes(id, bedTime, wakeTime) {
  const valid = (t) => /^\d{2}:\d{2}$/.test(t || '');
  return update(id, (entry) => {
    const [y, mo, d] = nightOf(entry).split('-').map(Number);
    if (valid(bedTime)) {
      const [h, m] = bedTime.split(':').map(Number);
      const bed = new Date(y, mo - 1, d, h, m);
      if (!isNap(entry) && h < 5) bed.setDate(bed.getDate() + 1);
      entry.bedAt = bed.toISOString();
    }
    const end = valid(wakeTime) ? wakeTime : clockOf(entry.wokeAt || entry.wakeAt);
    const [h, m] = end.split(':').map(Number);
    const bed = new Date(entry.bedAt);
    const wake = new Date(bed.getFullYear(), bed.getMonth(), bed.getDate(), h, m);
    if (wake <= bed) wake.setDate(wake.getDate() + 1);
    if (valid(wakeTime) || entry.wokeAt) entry.wokeAt = wake.toISOString();
    else entry.wakeAt = wake.toISOString();
  });
}

export function removeSleepEntry(id) {
  save(getSleepLog().filter((entry) => entry.id !== id));
}

export function clockOf(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 從上床到起床幾小時。有按「我起床了」用實際的，沒有就用選的鬧鐘時間 */
export function hoursOf(entry) {
  return +((Date.parse(entry.wokeAt || entry.wakeAt) - Date.parse(entry.bedAt)) / 3600000).toFixed(1);
}

/** 小睡幾分鐘 */
export function minutesOf(entry) {
  return Math.round((Date.parse(entry.wokeAt) - Date.parse(entry.bedAt)) / 60000);
}
