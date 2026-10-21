/**
 * 睡眠紀錄，一晚一筆：
 * - 按「確認現在睡」記上床時間和選的起床時間（wakeAt，跟選了幾個週期 cycles）。
 * - 早上按「我起床了」記實際起床（wokeAt），再答兩題：怎麼醒的（wakeType）、精神（energy），按完成（checkedIn）收起來。
 * - 中間醒來又睡回去（早上提早醒、上個廁所又回去睡）記在 wakes：[{ at: 醒來, back: 又睡著 }]。
 *   按了「我起床了」才又睡回去，按「又睡回去了」，剛才那個起床時間就變成一次中間醒來。
 * 時間都可以事後改。本週摘要會把最近 7 天交給 Claude 分析。
 * 2026-10-19 到 10-21 之間有過白天「小睡」（kind: 'nap'），後來拿掉了；舊的照樣顯示，不刪使用者的資料。
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

/** 由舊到新 */
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

/** 某個「HH:MM」在 after 之後第一次出現的時刻 */
function nextAt(after, time) {
  const [h, m] = time.split(':').map(Number);
  const at = new Date(after.getFullYear(), after.getMonth(), after.getDate(), h, m);
  if (at <= after) at.setDate(at.getDate() + 1);
  return at;
}

const isTime = (t) => /^\d{2}:\d{2}$/.test(t || '');

/** 按「確認現在睡」。bedAt、wakeAt 是 Date，cycles 是選了幾個 90 分鐘週期 */
export function logSleep(bedAt, wakeAt, cycles) {
  const list = getSleepLog().filter((entry) => isNap(entry) || entry.wokeAt || Math.abs(Date.parse(entry.bedAt) - bedAt.getTime()) >= SAME_NIGHT_MS);
  const entry = {
    id: `sleep_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind: 'night',
    bedAt: bedAt.toISOString(),
    wakeAt: wakeAt.toISOString(),
    cycles,
  };
  save([...list, entry]);
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
    if (answer.done) entry.checkedIn = true;
  });
}

/** 按了「我起床了」又睡回去：剛才那個起床時間變成一次中間醒來，這一晚還沒結束 */
export function backToSleep(id, at = new Date()) {
  return update(id, (entry) => {
    if (entry.wokeAt) entry.wakes = [...(entry.wakes || []), { at: entry.wokeAt, back: at.toISOString() }];
    delete entry.wokeAt;
    delete entry.wakeType;
    delete entry.energy;
    delete entry.checkedIn;
  });
}

/** 事後補記一次中間醒來（「HH:MM」），時刻照上床之後推 */
export function addWake(id, wokeTime, backTime) {
  if (!isTime(wokeTime) || !isTime(backTime)) return false;
  return update(id, (entry) => {
    const at = nextAt(new Date(entry.bedAt), wokeTime);
    const back = nextAt(at, backTime);
    entry.wakes = [...(entry.wakes || []), { at: at.toISOString(), back: back.toISOString() }]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  });
}

export function removeWake(id, index) {
  return update(id, (entry) => {
    entry.wakes = (entry.wakes || []).filter((_, i) => i !== index);
  });
}

/**
 * 早上那一塊現在該顯示什麼：
 * - { stage: 'wake' }：最後一晚還沒按「我起床了」，而且上床已經 2 到 16 小時（剛躺下不問，過了一整天也不問）
 * - { stage: 'questions' }：起床 3 小時內，還沒按「完成」
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
  return entry.checkedIn ? null : { stage: 'questions', entry };
}

/** 這一筆算哪一天（YYYY-MM-DD）。晚上的：凌晨 5 點前上床算前一天晚上，跟就寢提醒同一套規則 */
export function nightOf(entry) {
  const bed = new Date(entry.bedAt);
  if (!isNap(entry) && bed.getHours() < 5) bed.setDate(bed.getDate() - 1);
  return `${bed.getFullYear()}-${pad(bed.getMonth() + 1)}-${pad(bed.getDate())}`;
}

/**
 * 事後改時間（「HH:MM」）。日期不用選：上床時間照那一晚推（凌晨的算隔天），
 * 起床時間取上床之後第一次到那個時刻。改起床時間就是記實際起床
 */
export function editTimes(id, bedTime, wakeTime) {
  return update(id, (entry) => {
    if (isTime(bedTime)) {
      const [y, mo, d] = nightOf(entry).split('-').map(Number);
      const [h, m] = bedTime.split(':').map(Number);
      const bed = new Date(y, mo - 1, d, h, m);
      if (!isNap(entry) && h < 5) bed.setDate(bed.getDate() + 1);
      entry.bedAt = bed.toISOString();
    }
    const bed = new Date(entry.bedAt);
    if (isTime(wakeTime)) entry.wokeAt = nextAt(bed, wakeTime).toISOString();
    else if (entry.wokeAt) entry.wokeAt = nextAt(bed, clockOf(entry.wokeAt)).toISOString();
    else entry.wakeAt = nextAt(bed, clockOf(entry.wakeAt)).toISOString();
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

/** 中間醒著的分鐘數（醒來到又睡著） */
export function awakeMinutesOf(entry) {
  return (entry.wakes || []).reduce((sum, w) => sum + Math.max(0, Math.round((Date.parse(w.back) - Date.parse(w.at)) / 60000)), 0);
}

/** 中間醒了幾次。舊資料（10/19 那版）只記次數 */
export const wakeCountOf = (entry) => (entry.wakes || []).length + (entry.wakeUps || 0);

/** 舊的白天小睡幾分鐘 */
export function minutesOf(entry) {
  return Math.round((Date.parse(entry.wokeAt) - Date.parse(entry.bedAt)) / 60000);
}
