/**
 * 提醒：設定頁「作息時間」裡打開提醒開關的項目，時間到就發通知。
 * 睡眠頁的「就寢提醒」是同一份資料裡今晚適用的那一項就寢時間，不是另外一套。
 *
 * 兩條路：
 * - 裝成 iOS App（ios-shell）：用原生的本機通知，App 關著也會響。
 * - 網頁：瀏覽器通知 + setTimeout，只有晨序開著的時候才會響；
 *   iPhone 的瀏覽器不支援這種通知，開關會打不開並說明原因。
 */

import { getFixedSchedule, updateFixedItem, fireWeekdays, getBedItem } from './fixedSchedule.js';

let timerId = null;

/** 在 iOS App 外殼裡才有；網頁上是 undefined */
function nativeNotifications() {
  return globalThis.Capacitor?.Plugins?.LocalNotifications;
}

export function isNativeApp() {
  return !!nativeNotifications();
}

/** 睡眠頁和 AI 助理用的：今晚那一項就寢時間和它的提醒開關 */
export function getSleepReminderConfig() {
  const bed = getBedItem();
  return { enabled: !!(bed && bed.remind), bedTime: bed ? bed.time : '23:30', label: bed ? bed.label : '就寢' };
}

export function setSleepReminderConfig(enabled, bedTime) {
  const bed = getBedItem();
  if (bed) updateFixedItem(bed.id, { remind: !!enabled, time: bedTime });
  scheduleReminderIfEnabled();
  return getSleepReminderConfig();
}

/** 回傳 'granted' 才能提醒；'unsupported' 是這個瀏覽器根本沒有通知功能 */
export async function requestNotificationPermission() {
  const native = nativeNotifications();
  if (native) return (await native.requestPermissions()).display;
  if (!('Notification' in globalThis)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return await Notification.requestPermission();
}

/** 下一次該響的是哪一項、什麼時候。沒有任何項目開提醒時回傳 null */
export function nextReminder(items, now = new Date()) {
  let best = null;
  for (const item of items) {
    if (!item.remind) continue;
    const [h, m] = item.time.split(':').map(Number);
    const weekdays = fireWeekdays(item);
    for (let offset = 0; offset <= 7; offset++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, m, 0, 0);
      if (at <= now || (weekdays && !weekdays.includes(at.getDay()))) continue;
      if (!best || at < best.at) best = { item, at };
      break;
    }
  }
  return best;
}

// ponytail: 原生這條路沒有在真機上跑過（這台電腦沒有 Mac、App 也還沒裝），
// 照 @capacitor/local-notifications 的文件寫的。裝好 App 後第一件事就是測這個。
async function syncNative(native, items) {
  const pending = await native.getPending();
  if (pending.notifications.length) {
    await native.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
  const notifications = [];
  items.forEach((item, index) => {
    if (!item.remind) return;
    const [hour, minute] = item.time.split(':').map(Number);
    // 原生的 weekday 是 1 = 週日；沒指定星期就是每天
    (fireWeekdays(item) || [null]).forEach((weekday, j) => {
      notifications.push({
        id: index * 10 + j + 1,
        title: item.label,
        body: `${item.time} 到了`,
        schedule: { on: weekday === null ? { hour, minute } : { weekday: weekday + 1, hour, minute } },
      });
    });
  });
  if (notifications.length) await native.schedule({ notifications });
}

/** 頁面載入時、或作息時間有任何變動時呼叫：重新排定提醒 */
export function scheduleReminderIfEnabled() {
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }
  const items = getFixedSchedule();

  const native = nativeNotifications();
  if (native) {
    syncNative(native, items).catch((e) => console.warn('[reminder] 原生通知排程失敗：', e));
    return;
  }

  if (!('Notification' in globalThis) || Notification.permission !== 'granted') return;
  const next = nextReminder(items);
  if (!next) return;
  timerId = setTimeout(() => {
    try {
      new Notification(next.item.label, { body: `${next.item.time} 到了` });
    } catch (e) {
      console.warn('[reminder] 顯示通知失敗：', e);
    }
    scheduleReminderIfEnabled();
  }, next.at.getTime() - Date.now());
}
