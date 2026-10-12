/**
 * 備份用的共同部分：收集所有 `morningBrief.` 開頭的 localStorage 資料、或用一份備份取代它們。
 * 實際存到哪裡在 js/cloudBackup.js（雲端）。以前還有「存成檔案／從檔案還原」，使用者要求拿掉了。
 * 還原後要重新載入頁面——各模組載入時就把資料讀進記憶體了，只改 localStorage 它們不會知道。
 */

const KEY_PREFIX = 'morningBrief.';

/** 超過這麼多天沒有成功備份，今日頁會提醒 */
export const BACKUP_REMINDER_DAYS = 7;

// 雲端自動備份上次成功的時間（js/cloudBackup.js 寫的）
const CLOUD_SAVED_AT_KEY = 'chenxu.cloudBackup.savedAt';

/**
 * 距離上次雲端備份成功幾天；沒開雲端備份、或從來沒成功過回傳 null。
 * 以前手動存檔的時間不算：那個功能拿掉了，舊的時間戳會讓提醒以為還有備份。
 */
export function daysSinceBackup() {
  const last = Date.parse(localStorage.getItem(CLOUD_SAVED_AT_KEY));
  return Number.isNaN(last) ? null : Math.floor((Date.now() - last) / 86400000);
}

/** 所有要備份的資料：morningBrief. 開頭的每一筆 */
export function collectBackupData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(KEY_PREFIX)) data[key] = localStorage.getItem(key);
  }
  return data;
}

/**
 * 用一份備份取代現在的資料，回傳有沒有換成功。呼叫的人要自己重新載入頁面。
 * 備份是空的或格式不對就什麼都不動：先確認有東西可以放回去，才清手機上現有的。
 */
export function applyBackupData(data) {
  const entries = data && typeof data === 'object' && !Array.isArray(data)
    ? Object.entries(data).filter(([key, value]) => key.startsWith(KEY_PREFIX) && typeof value === 'string')
    : [];
  if (!entries.length) return false;
  // 清掉現有的，備份裡沒有的項目才不會殘留（例如備份當時還沒有追劇清單）
  Object.keys(collectBackupData()).forEach((key) => localStorage.removeItem(key));
  entries.forEach(([key, value]) => localStorage.setItem(key, value));
  return true;
}
