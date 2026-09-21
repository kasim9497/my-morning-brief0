/**
 * 就寢提醒：純前端 setTimeout + 瀏覽器 Notification API
 * 限制：只在這個分頁還開著的時候才會跳通知，PWA 純前端沒辦法背景推播
 * （使用者已知並接受這個限制）
 */

const STORAGE_KEY = 'morningBrief.sleepReminder.v1';
const DEFAULT_CONFIG = { enabled: false, bedTime: '23:30' };

let timerId = null;

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    console.warn('[sleepReminder] localStorage 讀取失敗，使用預設值：', e);
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[sleepReminder] localStorage 寫入失敗：', e);
  }
}

export function getSleepReminderConfig() {
  return loadConfig();
}

export function setSleepReminderConfig(enabled, bedTime) {
  const config = { enabled: !!enabled, bedTime: bedTime || DEFAULT_CONFIG.bedTime };
  saveConfig(config);
  scheduleReminderIfEnabled();
  return config;
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return await Notification.requestPermission();
}

/** 頁面載入時或設定變更時呼叫，重新排定下一次提醒（跨到明天也會自動接續） */
export function scheduleReminderIfEnabled() {
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }

  const config = loadConfig();
  if (!config.enabled) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const [h, m] = config.bedTime.split(':').map(Number);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  const ms = target.getTime() - now.getTime();
  timerId = setTimeout(() => {
    try {
      new Notification('該睡覺了', {
        body: `照設定的就寢時間到了（${config.bedTime}），現在去睡可以睡滿完整的 90 分鐘週期。`,
      });
    } catch (e) {
      console.warn('[sleepReminder] 顯示通知失敗：', e);
    }
    scheduleReminderIfEnabled();
  }, ms);
}
