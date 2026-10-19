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
const TASKS_URL = './reminder-tasks.json';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

async function readJson(url) {
  const cache = await caches.open(SCHEDULE_CACHE);
  const res = await cache.match(url);
  return res ? res.json() : null;
}

async function dueItems() {
  const items = (await readJson(SCHEDULE_URL)) || [];
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return items.filter((item) => {
    const [h, m] = item.time.split(':').map(Number);
    // 推播可能晚幾分鐘才到（後端也會補推排程漏掉的分鐘）；跨過午夜的也算（23:59 的提醒在 00:01 到）
    const late = (nowMinutes - (h * 60 + m) + 1440) % 1440;
    return late <= 10;
  });
}

/** 待辦的通知：今天還沒做的那幾項。清單是晨序上次打開時存的（js/sleepReminder.js） */
async function taskNote(item) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const pending = ((await readJson(TASKS_URL)) || {})[today];
  // 太久沒打開晨序，手上沒有今天的清單
  if (!pending) return { title: item.label, body: '打開晨序看看今天的安排' };
  if (!pending.length) return { title: '今天的事都做完了', body: '' };
  return { title: `今天還有 ${pending.length} 項`, body: pending.join('、') };
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const notes = [];
    try {
      const due = await dueItems();
      const fixed = due.filter((item) => !item.tasks);
      const tasks = due.find((item) => item.tasks);
      if (fixed.length) {
        // 時間放上面（粗體那行）、名稱放下面：使用者要一眼先看到還剩多久
        // tag 每個時間各用一個：同一個 tag 的新通知會「安靜地」換掉還留在通知中心的舊通知，不會響也不會跳出來，
        // 前一則沒滑掉的話，這一則看起來就像沒通知
        notes.push({ title: fixed[0].body || `${fixed[0].time} 到了`, body: fixed.map((item) => item.label).join('、'), tag: `chenxu-${fixed[0].time}` });
      }
      if (tasks) notes.push({ ...(await taskNote(tasks)), tag: `chenxu-tasks-${tasks.time}` });
    } catch (e) {
      // 讀不到時間表也要顯示通知：iOS 規定每一則推播都必須讓使用者看到東西
    }
    if (!notes.length) notes.push({ title: '作息提醒', body: '', tag: 'chenxu-reminder' });
    await Promise.all(notes.map((note) => self.registration.showNotification(note.title, { body: note.body, icon: 'icons/icon-192.png', tag: note.tag })));
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
