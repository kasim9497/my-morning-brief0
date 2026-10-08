/**
 * 提醒：設定頁「作息時間」裡打開提醒開關的項目，時間到就發通知。
 * 睡眠頁的「就寢提醒」是同一份資料裡今晚適用的那一項就寢時間，不是另外一套。
 *
 * 三條路，照這個順序挑：
 * 1. 裝成 iOS App（ios-shell）：原生的本機通知。
 * 2. 推播（加到主畫面的網頁、桌機瀏覽器）：把「幾點、星期幾」傳給後端，後端時間到了
 *    推一下這支手機，sw.js 顯示通知。晨序關著也會響。
 *    iPhone 一定要「加到主畫面」再從主畫面打開才有這個功能，在 Safari 分頁裡沒有。
 * 3. 都沒有：瀏覽器通知 + setTimeout，只有晨序開著的時候才會響。
 */

import { getFixedSchedule, updateFixedItem, fireWeekdays, getBedItem } from './fixedSchedule.js';
import { WORKER_URL } from './config.js';

// 改了作息時間但還沒成功傳到後端時記著，設定頁會顯示，下次打開晨序會再試
const PENDING_KEY = 'morningBrief.pushSyncPending';
// sw.js 讀這份來決定通知上要寫哪一項（推播本身不帶內容）
const SCHEDULE_CACHE = 'chenxu-reminders';
const SCHEDULE_URL = './reminder-schedule.json';

let timerId = null;

/** 在 iOS App 外殼裡才有；網頁上是 undefined */
function nativeNotifications() {
  return globalThis.Capacitor?.Plugins?.LocalNotifications;
}

export function isNativeApp() {
  return !!nativeNotifications();
}

function pushSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && 'PushManager' in globalThis && 'Notification' in globalThis;
}

/** 晨序關著也收得到提醒嗎（原生 App 或推播） */
export function canRemindInBackground() {
  return isNativeApp() || pushSupported();
}

/** 上一次把時間表傳給後端有沒有成功。失敗多半是連不上（在中國大陸沒開 VPN） */
export function isPushSyncPending() {
  return localStorage.getItem(PENDING_KEY) === '1';
}

/** 睡眠頁和 AI 助理用的：今晚那一項就寢時間和它的提醒開關 */
export function getSleepReminderConfig() {
  const bed = getBedItem();
  return { exists: !!bed, enabled: !!(bed && bed.remind), bedTime: bed ? bed.time : '23:30', label: bed ? bed.label : '就寢' };
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

/** 開關打不開時要跟使用者說的話 */
export function permissionHelp(permission) {
  return permission === 'unsupported'
    ? '這裡收不到通知。iPhone 要先把晨序「加入主畫面」，再從主畫面的圖示打開，才能開提醒。'
    : '要先允許通知，提醒才會響。';
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

async function callWorker(payload) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const keyBytes = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** 推播這條路：訂閱（第一次才需要）、把時間表存給 sw.js、把時間傳給後端 */
async function syncPush(items) {
  const wanted = items.filter((item) => item.remind);
  const registration = await navigator.serviceWorker.register('./sw.js');
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    if (!wanted.length) return; // 從來沒開過提醒，什麼都不用做
    const { publicKey } = await callWorker({ mode: 'push-key' });
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    });
  }

  const cache = await caches.open(SCHEDULE_CACHE);
  await cache.put(SCHEDULE_URL, new Response(JSON.stringify(wanted.map((item) => ({ label: item.label, time: item.time })))));

  // 名稱不用傳上去，後端只需要知道幾點、星期幾
  await callWorker({
    mode: 'push-sync',
    subscription: subscription.toJSON(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    items: wanted.map((item) => ({ time: item.time, weekdays: fireWeekdays(item) })),
  });
}

function setPending(pending) {
  if (pending) localStorage.setItem(PENDING_KEY, '1');
  else localStorage.removeItem(PENDING_KEY);
  // 設定頁聽這個事件來更新「還沒同步」那行字
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('chenxu:reminder-sync'));
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

  if (pushSupported()) {
    syncPush(items).then(() => setPending(false)).catch((e) => {
      console.warn('[reminder] 推播同步失敗：', e);
      setPending(true);
    });
    return;
  }

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
