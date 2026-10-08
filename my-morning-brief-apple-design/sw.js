/**
 * 晨序的 service worker：只做一件事——收到推播時顯示提醒通知。
 *
 * 刻意沒有 fetch 處理、不快取任何檔案：這個專案被舊快取坑過很多次，
 * 離線快取帶來的好處不值得那個風險。
 *
 * 推播本身不帶內容（見 cloudflare-worker/push.js）。要顯示哪一項，是看頁面那邊
 * 事先存好的時間表（js/sleepReminder.js 寫進 Cache Storage），找現在剛到時間的那幾項。
 */

const SCHEDULE_CACHE = 'chenxu-reminders';
const SCHEDULE_URL = './reminder-schedule.json';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

async function dueLabels() {
  const cache = await caches.open(SCHEDULE_CACHE);
  const res = await cache.match(SCHEDULE_URL);
  if (!res) return [];
  const items = await res.json();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return items.filter((item) => {
    const [h, m] = item.time.split(':').map(Number);
    // 推播可能晚幾分鐘才到；跨過午夜的也算（23:59 的提醒在 00:01 到）
    const late = (nowMinutes - (h * 60 + m) + 1440) % 1440;
    return late <= 5;
  });
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let title = '作息提醒';
    let body = '';
    try {
      const due = await dueLabels();
      if (due.length) {
        title = due.map((item) => item.label).join('、');
        body = `${due[0].time} 到了`;
      }
    } catch (e) {
      // 讀不到時間表也要顯示通知：iOS 規定每一則推播都必須讓使用者看到東西
    }
    await self.registration.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'chenxu-reminder' });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window' });
    if (windows.length) return windows[0].focus();
    return self.clients.openWindow('./');
  })());
});
