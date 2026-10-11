/**
 * 設定頁「作息時間」：一天裡固定的幾個時間點，可以改時間、改名、新增、刪除，
 * 每一項可以各自打開提醒（提醒怎麼發在 sleepReminder.js）
 * 資料存 localStorage（key 用 morningBrief. 開頭，會被備份涵蓋）
 */

const STORAGE_KEY = 'morningBrief.fixedSchedule.v1';

// days：這一項屬於星期幾（0 = 週日）。沒有 days 的每天都算。
const DEFAULTS = [
  { id: 'weekdayBed', label: '平日就寢', note: '週一至週三', time: '01:20', days: [1, 2, 3] },
  { id: 'weekdayWake', label: '平日起床', note: '週一至週三', time: '08:50', days: [1, 2, 3] },
  { id: 'weekendBed', label: '假日就寢', note: '週四至週日', time: '01:00', days: [4, 5, 6, 0] },
  { id: 'weekendWake', label: '假日起床', note: '週四至週日', time: '10:00', days: [4, 5, 6, 0] },
  { id: 'phoneCurfew', label: '手機宵禁', note: '每天', time: '23:00' },
  { id: 'shower', label: '洗澡', note: '每天', time: '23:30' },
];

// 待辦的通知：不是作息，但一樣是「每天幾點響一次」，所以放在同一張清單裡。不能改名和刪除。
// 通知上要寫哪些任務，由 sw.js 看 sleepReminder.js 存好的那份清單決定
const TASK_REMINDERS = [
  { id: 'tasksMorning', kind: 'tasks', label: '今天的待辦', note: '每天', time: '08:30', remind: false },
  { id: 'tasksEvening', kind: 'tasks', label: '還沒做完的', note: '每天', time: '21:30', remind: false },
];

const isTime = (value) => /^\d{2}:\d{2}$/.test(value);
const isBed = (item) => item.id.endsWith('Bed') || item.label.includes('就寢');
const pad = (n) => String(n).padStart(2, '0');

function load() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    saved = null;
  }
  // 舊格式只存 { id: 時間 }，那時候還不能新增刪除
  const items = saved && Array.isArray(saved.items)
    ? saved.items
    : DEFAULTS.map((item) => ({ ...item, time: (saved && saved[item.id]) || item.time, remind: false }));
  return [...items, ...TASK_REMINDERS.filter((extra) => !items.some((item) => item.id === extra.id))];
}

function save(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ items }));
}

export function getFixedSchedule() {
  return load();
}

/** 改一項的時間、名稱或提醒開關；不合格的值會被略過 */
export function updateFixedItem(id, patch) {
  const items = load();
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  if (isTime(patch.time)) item.time = patch.time;
  if (typeof patch.label === 'string' && patch.label.trim()) item.label = patch.label.trim();
  if (typeof patch.remind === 'boolean') item.remind = patch.remind;
  if (Number.isInteger(patch.lead) && patch.lead >= 0 && patch.lead <= 120) item.lead = patch.lead;
  save(items);
}

/** 新增一項，每天都算 */
export function addFixedItem(label, time) {
  const trimmed = String(label || '').trim();
  if (!trimmed || !isTime(time)) return;
  save([...load(), { id: `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label: trimmed, note: '每天', time, remind: false }]);
}

export function removeFixedItem(id) {
  save(load().filter((item) => item.id !== id));
}

/**
 * 這一項會在星期幾的時鐘時間響。
 * ponytail: 凌晨 5 點前的時間算「前一晚」的——「週一至週三 01:20 就寢」實際上是週二到週四的凌晨。
 */
export function fireWeekdays(item) {
  if (!item.days) return null; // 每天
  const shift = Number(item.time.slice(0, 2)) < 5 ? 1 : 0;
  return item.days.map((day) => (day + shift) % 7);
}

/** 提前幾分鐘提醒。就寢沒設過的話是 30：看到通知還要刷牙、收東西，不是馬上躺下 */
export function leadOf(item) {
  return Number.isInteger(item.lead) ? item.lead : (isBed(item) ? 30 : 0);
}

/** 通知實際上幾點、星期幾響（作息時間減掉提前量；減過午夜的話星期也往前一天） */
export function alertOf(item) {
  const lead = leadOf(item);
  const minutes = Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3)) - lead;
  const wrapped = (minutes + 1440) % 1440;
  const weekdays = fireWeekdays(item);
  return {
    time: `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`,
    weekdays: weekdays && minutes < 0 ? weekdays.map((day) => (day + 6) % 7) : weekdays,
    body: lead ? `再 ${lead} 分鐘，${item.time}` : `${item.time} 到了`,
  };
}

// 凌晨還沒睡的時候，「今晚」指的是昨天那一晚
const nightOf = (now) => (now.getDay() + (now.getHours() < 5 ? 6 : 0)) % 7;
const forNight = (items, night) => items.find((item) => !item.days || item.days.includes(night)) || items[0] || null;

/** 今晚適用的那一項就寢時間（就寢提醒、睡眠計算機用的就是它）。就寢項目都被刪掉時回傳 null */
export function getBedItem(now = new Date()) {
  return forNight(load().filter(isBed), nightOf(now));
}

/** 今晚睡下去之後，隔天早上適用的那一項起床時間。沒有就回傳 null */
export function getWakeItem(now = new Date()) {
  return forNight(load().filter((item) => item.id.endsWith('Wake') || item.label.includes('起床')), nightOf(now));
}
