/**
 * 雲端自動備份：開啟後，資料有變動就自動存一份到後端（cloudflare-worker/backup.js）。
 *
 * 內容在手機上先加密（AES-GCM）才傳出去，鑰匙是從通關密語算出來的、只留在這支手機，
 * 所以後端存的是一串看不懂的東西。加密後的內容包成一筆 `morningBrief.encrypted.v1`，
 * 後端不用知道它是加密的，照原本的規則收就好。
 * ponytail: 傳給後端認人用的 token 是密語的一次雜湊。密語太好猜的話，拿得到 token 的人猜得出密語、
 * 也就解得開內容——加密的強度就是密語的強度。
 *
 * 這裡存的幾個 key 刻意不用 morningBrief. 開頭：它們是「這支手機和雲端的同步狀態」，
 * 不是使用者的紀錄，不該被打包進備份，也不該在還原時被清掉。
 */

import { WORKER_URL } from './config.js';
import { collectBackupData, applyBackupData } from './backup.js';

const TOKEN_KEY = 'chenxu.cloudBackup.token';
const SAVED_AT_KEY = 'chenxu.cloudBackup.savedAt'; // 這支手機上次同步到的雲端版本
const HASH_KEY = 'chenxu.cloudBackup.hash';        // 那一次上傳的內容指紋，沒變就不用再傳
const CRYPT_KEY = 'chenxu.cloudBackup.key';
const VERIFIED_AT_KEY = 'chenxu.cloudBackup.verifiedAt'; // 上次「檢查雲端那一份」確認解得開的時間        // 加解密用的鑰匙。2026-10-12 之前開啟的手機沒有這個
const ENCRYPTED_KEY = 'morningBrief.encrypted.v1';
const CHECK_EVERY_MS = 5 * 60 * 1000;
export const MIN_PASSPHRASE_LENGTH = 8;

// 雲端那份跟這支手機對不上（例如換了手機、或另一支裝置傳過）時記著，等使用者決定用哪一份
let conflictSavedAt = null;
let lastError = null;

function fingerprint(data) {
  const text = JSON.stringify(Object.entries(data).sort());
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${text.length}:${hash}`;
}

async function tokenFor(passphrase) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`chenxu-backup:${passphrase}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const toB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** 從密語算出加解密的鑰匙（故意算得慢，讓人不好用猜的） */
async function keyFor(passphrase) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('chenxu-backup-key-v1'), iterations: 210000 },
    material, 256,
  );
  return toB64(bits);
}

const importKey = (stored) => crypto.subtle.importKey('raw', fromB64(stored), 'AES-GCM', false, ['encrypt', 'decrypt']);

async function encrypt(data, storedKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const text = new TextEncoder().encode(JSON.stringify(data));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(storedKey), text);
  // 大的陣列不能一次展開成參數，分段轉
  let body = '';
  const bytes = new Uint8Array(sealed);
  for (let i = 0; i < bytes.length; i += 30000) body += String.fromCharCode(...bytes.subarray(i, i + 30000));
  return { [ENCRYPTED_KEY]: `${toB64(iv)}.${btoa(body)}` };
}

/** 解不開（鑰匙不對、內容壞了）會丟出錯誤 */
async function decrypt(data, storedKey) {
  const [iv, body] = data[ENCRYPTED_KEY].split('.');
  const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await importKey(storedKey), fromB64(body));
  return JSON.parse(new TextDecoder().decode(opened));
}

async function call(payload) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (res.status === 409) return { conflict: true, savedAt: data.savedAt };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function changed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('chenxu:cloud-backup'));
}

/** 設定頁要畫的狀態 */
export function getCloudBackupState() {
  return {
    on: !!localStorage.getItem(TOKEN_KEY),
    savedAt: localStorage.getItem(SAVED_AT_KEY),
    // 加密功能出來之前就開啟的手機：沒有鑰匙，上傳暫停中，要重新輸入一次密語才有鑰匙
    unencrypted: !!localStorage.getItem(TOKEN_KEY) && !localStorage.getItem(CRYPT_KEY),
    conflictSavedAt,
    error: lastError,
    // 開著、但有改動超過一天沒傳上去（多半是一直沒開 VPN）：開啟不等於有備份到
    staleDays: staleDays(),
    // 傳上去成功不等於拿得回來：上次真的下載、解密成功是什麼時候
    verifiedAt: localStorage.getItem(VERIFIED_AT_KEY),
  };
}

function staleDays() {
  const savedAt = Date.parse(localStorage.getItem(SAVED_AT_KEY));
  if (!localStorage.getItem(TOKEN_KEY) || Number.isNaN(savedAt)) return 0;
  const days = Math.floor((Date.now() - savedAt) / 86400000);
  return days >= 1 && fingerprint(collectBackupData()) !== localStorage.getItem(HASH_KEY) ? days : 0;
}

/**
 * 把現在的資料傳上去。內容沒變就不傳。
 * force：不管雲端是哪個版本都蓋過去（使用者明確選了「用這支手機的」才用）。
 */
export async function uploadNow({ force = false } = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  const data = collectBackupData();
  const hash = fingerprint(data);
  if (!force && !conflictSavedAt && hash === localStorage.getItem(HASH_KEY)) return;
  // 還在等使用者決定用哪一份的時候，不要自己上傳
  if (conflictSavedAt && !force) return;
  // 加密功能出來之前開啟的手機沒有鑰匙：寧可先停，也不把沒加密的內容傳出去。設定頁會叫使用者重新開啟一次
  const cryptKey = localStorage.getItem(CRYPT_KEY);
  if (!cryptKey) {
    lastError = '還沒有加密的鑰匙，先暫停上傳';
    changed();
    return;
  }
  try {
    const result = await call({ mode: 'backup-put', token, data: await encrypt(data, cryptKey), baseSavedAt: localStorage.getItem(SAVED_AT_KEY), force });
    if (result.conflict) {
      conflictSavedAt = result.savedAt;
    } else {
      conflictSavedAt = null;
      localStorage.setItem(SAVED_AT_KEY, result.savedAt);
      localStorage.setItem(HASH_KEY, hash);
    }
    lastError = null;
  } catch (e) {
    lastError = e.message;
  }
  changed();
}

/** 開啟：密語太短回傳錯誤訊息；雲端已經有一份時不會自己蓋掉，等使用者選 */
export async function turnOnCloudBackup(passphrase) {
  if (String(passphrase || '').length < MIN_PASSPHRASE_LENGTH) return `通關密語至少要 ${MIN_PASSPHRASE_LENGTH} 個字。`;
  const token = await tokenFor(passphrase);
  let existing;
  try {
    existing = await call({ mode: 'backup-get', token });
  } catch (e) {
    return `連不上雲端（${e.message}）。確認 VPN 開著再試一次。`;
  }
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(CRYPT_KEY, await keyFor(passphrase));
  localStorage.removeItem(SAVED_AT_KEY);
  localStorage.removeItem(HASH_KEY);
  if (existing.exists) {
    conflictSavedAt = existing.savedAt;
    changed();
  } else {
    await uploadNow({ force: true });
  }
  return null;
}

/** 用雲端那份取代這支手機的資料，然後重新載入頁面。失敗回傳錯誤訊息 */
export async function restoreFromCloud() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return '還沒開啟雲端備份。';
  let result;
  try {
    result = await call({ mode: 'backup-get', token });
  } catch (e) {
    return `連不上雲端（${e.message}）。`;
  }
  if (!result.exists) return '雲端沒有這組密語的備份。';
  let data = result.data;
  if (data && data[ENCRYPTED_KEY]) {
    const cryptKey = localStorage.getItem(CRYPT_KEY);
    if (!cryptKey) return '雲端那一份是加密的。請先關閉雲端備份，再用同一組密語重新開啟，就能還原。';
    try {
      data = await decrypt(data, cryptKey);
    } catch (e) {
      return '雲端那一份解不開，這支手機的資料沒有動。';
    }
  }
  // 備份是空的或格式不對時什麼都不會動
  if (!applyBackupData(data)) return '雲端那一份沒辦法還原（空的、格式不對，或手機空間不夠），這支手機的資料沒有動。';
  conflictSavedAt = null;
  localStorage.setItem(SAVED_AT_KEY, result.savedAt);
  localStorage.setItem(HASH_KEY, fingerprint(collectBackupData()));
  if (typeof window !== 'undefined' && window.location) window.location.reload();
  return null;
}

/**
 * 檢查雲端那一份真的拿得回來：下載、解密、跟這支手機現在的資料比對。不會改任何資料。
 * 回傳 { ok, text }，text 直接給使用者看
 */
export async function verifyCloudBackup() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return { ok: false, text: '還沒開啟雲端備份。' };
  let result;
  try {
    result = await call({ mode: 'backup-get', token });
  } catch (e) {
    return { ok: false, text: `連不上雲端（${e.message}），開 VPN 再試一次。` };
  }
  if (!result.exists) return { ok: false, text: '雲端沒有這組密語的備份。' };
  let data = result.data;
  if (data && data[ENCRYPTED_KEY]) {
    const cryptKey = localStorage.getItem(CRYPT_KEY);
    if (!cryptKey) return { ok: false, text: '雲端那一份是加密的，這支手機沒有鑰匙。關閉再用同一組密語重新開啟就有了。' };
    try {
      data = await decrypt(data, cryptKey);
    } catch (e) {
      return { ok: false, text: '雲端那一份解不開，可能壞掉了。這支手機的資料沒有動，按「用這支手機的」可以重傳一份。' };
    }
  }
  const count = Object.keys(data || {}).filter((key) => key.startsWith('morningBrief.')).length;
  if (!count) return { ok: false, text: '雲端那一份是空的。' };
  const same = fingerprint(data) === fingerprint(collectBackupData());
  localStorage.setItem(VERIFIED_AT_KEY, new Date().toISOString());
  return {
    ok: true,
    text: `雲端那一份解得開，有 ${count} 類資料，${same ? '跟這支手機現在的一模一樣。' : '比這支手機現在的舊一點（這裡有新的改動，幾分鐘內會自動傳上去）。'}`,
  };
}

/** 關閉：這支手機不再自動上傳。雲端那一份留著 */
export function turnOffCloudBackup() {
  [TOKEN_KEY, SAVED_AT_KEY, HASH_KEY, CRYPT_KEY, VERIFIED_AT_KEY].forEach((key) => localStorage.removeItem(key));
  conflictSavedAt = null;
  lastError = null;
  changed();
}

/** 頁面載入時呼叫一次：之後每幾分鐘、以及每次回到晨序時，看資料有沒有變，有變就傳 */
export function startCloudBackup() {
  // 沒開啟時 uploadNow 會直接結束，所以不用先檢查；這樣之後才開啟也不用重新載入
  const tick = () => uploadNow();
  tick();
  setInterval(tick, CHECK_EVERY_MS);
  // 離開和回到晨序時各看一次：打完勾切走的那一刻最該存
  document.addEventListener('visibilitychange', tick);
}
