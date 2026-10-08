/**
 * 雲端自動備份：把晨序的紀錄存一份在 KV，換手機或資料不見時拿得回來。
 *
 * 認人的方式是使用者自己設的通關密語。手機把密語雜湊成 token 再傳上來，
 * 這裡再雜湊一次當 KV 的 key，所以 KV 裡看不到密語，也看不到能直接拿來用的 token。
 * 這不是正式的登入：知道密語的人就拿得到資料。內容是作息和題庫紀錄，使用者接受這個程度。
 *
 * 防止舊資料蓋掉新資料：上傳時要帶「我上次同步到的版本」（baseSavedAt），
 * 跟雲端現在的版本不一樣就拒絕（409），由使用者決定要用哪一份。
 */

const INDEX_KEY = 'backup-index';
// 這個網址是公開的，有心人可以亂塞資料，所以份數和大小都設上限
const MAX_BACKUPS = 3;
export const MAX_BACKUP_CHARS = 600000;

async function sha256hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 只收晨序自己的資料：key 是 morningBrief. 開頭、值是字串 */
function cleanData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const entries = Object.entries(data).filter(([key, value]) => key.startsWith('morningBrief.') && typeof value === 'string');
  if (!entries.length || JSON.stringify(entries).length > MAX_BACKUP_CHARS) return null;
  return Object.fromEntries(entries);
}

export async function handleBackupRequest(body, env) {
  if (!env.PUSH_KV) return { status: 500, payload: { error: '後端還沒有儲存空間' } };
  if (typeof body.token !== 'string' || !/^[0-9a-f]{64}$/.test(body.token)) {
    return { status: 400, payload: { error: '通關密語的格式不對' } };
  }
  const key = `backup:${await sha256hex(body.token)}`;
  const stored = await env.PUSH_KV.get(key, 'json');

  if (body.mode === 'backup-get') {
    return { status: 200, payload: stored ? { exists: true, savedAt: stored.savedAt, data: stored.data } : { exists: false } };
  }

  const data = cleanData(body.data);
  if (!data) return { status: 400, payload: { error: '備份的內容是空的、格式不對，或太大了' } };

  if (stored && !body.force && stored.savedAt !== body.baseSavedAt) {
    return { status: 409, payload: { error: '雲端有另一份備份', savedAt: stored.savedAt } };
  }
  if (!stored) {
    const index = (await env.PUSH_KV.get(INDEX_KEY, 'json')) || [];
    if (index.length >= MAX_BACKUPS) return { status: 429, payload: { error: '雲端備份的份數已經滿了' } };
    await env.PUSH_KV.put(INDEX_KEY, JSON.stringify([...index, key]));
  }
  const savedAt = new Date().toISOString();
  await env.PUSH_KV.put(key, JSON.stringify({ savedAt, data }));
  return { status: 200, payload: { ok: true, savedAt } };
}
