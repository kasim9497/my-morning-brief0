/**
 * 雲端自動備份：開啟後，資料有變動就自動存一份到後端（cloudflare-worker/backup.js）。
 * 手動的「現在備份」還是留著，當第二道保險。
 *
 * 這裡存的幾個 key 刻意不用 morningBrief. 開頭：它們是「這支手機和雲端的同步狀態」，
 * 不是使用者的紀錄，不該被打包進備份，也不該在還原時被清掉。
 */

import { WORKER_URL } from './config.js';
import { collectBackupData, applyBackupData } from './backup.js';

const TOKEN_KEY = 'chenxu.cloudBackup.token';
const SAVED_AT_KEY = 'chenxu.cloudBackup.savedAt'; // 這支手機上次同步到的雲端版本
const HASH_KEY = 'chenxu.cloudBackup.hash';        // 那一次上傳的內容指紋，沒變就不用再傳
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
    conflictSavedAt,
    error: lastError,
  };
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
  try {
    const result = await call({ mode: 'backup-put', token, data, baseSavedAt: localStorage.getItem(SAVED_AT_KEY), force });
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
  applyBackupData(result.data);
  conflictSavedAt = null;
  localStorage.setItem(SAVED_AT_KEY, result.savedAt);
  localStorage.setItem(HASH_KEY, fingerprint(collectBackupData()));
  if (typeof window !== 'undefined' && window.location) window.location.reload();
  return null;
}

/** 關閉：這支手機不再自動上傳。雲端那一份留著 */
export function turnOffCloudBackup() {
  [TOKEN_KEY, SAVED_AT_KEY, HASH_KEY].forEach((key) => localStorage.removeItem(key));
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
