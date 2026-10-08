/**
 * 資料備份：把所有 `morningBrief.` 開頭的 localStorage 資料匯出成一個 JSON 檔，或從檔案還原。
 * 還原後直接重新載入頁面——各模組載入時就把資料讀進記憶體了，只改 localStorage 它們不會知道。
 */

const KEY_PREFIX = 'morningBrief.';
const APP_ID = 'chenxu';
const LAST_BACKUP_KEY = 'morningBrief.lastBackupAt';

/** 超過這麼多天沒匯出備份，今日頁會提醒 */
export const BACKUP_REMINDER_DAYS = 7;

/** 距離上次匯出備份幾天；從來沒匯出過回傳 null */
export function daysSinceBackup() {
  const last = Date.parse(localStorage.getItem(LAST_BACKUP_KEY));
  return Number.isNaN(last) ? null : Math.floor((Date.now() - last) / 86400000);
}

export function exportBackup() {
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(KEY_PREFIX)) data[key] = localStorage.getItem(key);
  }

  const today = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify({ app: APP_ID, exportedAt: new Date().toISOString(), data }, null, 2)], {
    type: 'application/json',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `chenxu-backup-${today}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** 回傳錯誤訊息字串；成功時會重新載入頁面，不會回傳 */
export async function importBackup(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (e) {
    return '這個檔案不是有效的 JSON。';
  }
  if (parsed?.app !== APP_ID || !parsed.data || typeof parsed.data !== 'object') {
    return '這不是晨序的備份檔。';
  }

  const entries = Object.entries(parsed.data).filter(
    ([key, value]) => key.startsWith(KEY_PREFIX) && typeof value === 'string'
  );
  if (entries.length === 0) return '備份檔裡沒有資料。';

  if (!window.confirm(`要用這份備份（${String(parsed.exportedAt).slice(0, 10)}）覆蓋目前的資料嗎？目前的資料會被取代。`)) {
    return null;
  }

  // 先清掉現有的，備份裡沒有的項目才不會殘留（例如備份當時還沒有追劇清單）
  Object.keys(localStorage)
    .filter((key) => key.startsWith(KEY_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
  for (const [key, value] of entries) localStorage.setItem(key, value);
  window.location.reload();
  return null;
}
