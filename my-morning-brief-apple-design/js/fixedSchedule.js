/**
 * 設定頁「作息時間」：幾個固定的時間點，可以自己改
 * 資料存 localStorage（key 用 morningBrief. 開頭，會被備份涵蓋）
 */

// ponytail: 這些時間目前只是給自己看的參考，沒有接到任何通知。
// 要讓「手機宵禁」「洗澡」真的跳提醒，得等包成原生 App 之後接本機通知。

const STORAGE_KEY = 'morningBrief.fixedSchedule.v1';

const DEFAULTS = [
  { id: 'weekdayBed', label: '平日就寢', note: '週一至週三', time: '01:20' },
  { id: 'weekdayWake', label: '平日起床', note: '週一至週三', time: '08:50' },
  { id: 'weekendBed', label: '假日就寢', note: '週四至週日', time: '01:00' },
  { id: 'weekendWake', label: '假日起床', note: '週四至週日', time: '10:00' },
  { id: 'phoneCurfew', label: '手機宵禁', note: '每天', time: '23:00' },
  { id: 'shower', label: '洗澡', note: '每天', time: '23:30' },
];

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

export function getFixedSchedule() {
  const saved = loadSaved();
  return DEFAULTS.map((item) => ({ ...item, time: saved[item.id] || item.time }));
}

export function setFixedTime(id, time) {
  if (!DEFAULTS.some((item) => item.id === id) || !/^\d{2}:\d{2}$/.test(time)) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadSaved(), [id]: time }));
}
