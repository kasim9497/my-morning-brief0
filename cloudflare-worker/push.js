/**
 * 作息時間的推播提醒。
 *
 * 流程：晨序（加到主畫面的網頁）把「推播訂閱 + 要提醒的時間」傳上來存進 KV；
 * 這個 Worker 每分鐘被排程叫醒一次，看哪些時間到了，就請瀏覽器廠商的推播服務
 * （iPhone 是 Apple 的）敲一下那支手機。手機上的 sw.js 收到後顯示通知。
 *
 * 推播不帶內容：這樣不用做訊息加密，項目名稱也不用離開手機——
 * 這裡只知道「幾點、星期幾」，要顯示哪一項由手機上的 sw.js 自己對時間決定。
 *
 * 需要的設定：
 * - KV 綁定 PUSH_KV（wrangler.toml）
 * - Secret VAPID_PRIVATE_JWK：一把 P-256 私鑰的 JWK（JSON 字串）。產生方式見 README
 */

const KV_KEY = 'subs';
// 這個網址寫在公開的 repo 裡，來源檢查擋不了有心人，所以存的量設上限
const MAX_SUBS = 5;
const MAX_ITEMS = 30;
// 只往真的推播服務送，不讓這個 Worker 被拿來對任意網址發請求
const PUSH_HOSTS = /(^|\.)push\.apple\.com$|^fcm\.googleapis\.com$|(^|\.)push\.services\.mozilla\.com$|(^|\.)notify\.windows\.com$/;
const VAPID_SUBJECT = 'https://kasim9497.github.io/my-morning-brief0/';

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

function loadJwk(env) {
  if (!env.VAPID_PRIVATE_JWK) throw new Error('後端還沒設定推播金鑰（VAPID_PRIVATE_JWK）');
  return JSON.parse(env.VAPID_PRIVATE_JWK);
}

/** 瀏覽器訂閱推播時要用的公鑰（從私鑰的 JWK 裡取 x、y 組出來） */
export function publicKeyOf(jwk) {
  return b64url(new Uint8Array([4, ...fromB64url(jwk.x), ...fromB64url(jwk.y)]));
}

/** 推播服務用來確認「這則推播是訂閱時那把金鑰的主人送的」的簽章 */
export async function vapidAuthorization(jwk, endpoint, nowSeconds = Math.floor(Date.now() / 1000)) {
  const encode = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode({
    aud: new URL(endpoint).origin,
    exp: nowSeconds + 12 * 3600,
    sub: VAPID_SUBJECT,
  })}`;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return `vapid t=${unsigned}.${b64url(signature)}, k=${publicKeyOf(jwk)}`;
}

/** 把手機傳來的東西整理成要存的樣子；格式不對回傳 null */
export function cleanSubscription(body) {
  const endpoint = body && body.subscription && body.subscription.endpoint;
  let host;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return null;
    host = url.hostname;
  } catch (e) {
    return null;
  }
  if (!PUSH_HOSTS.test(host)) return null;

  const items = (Array.isArray(body.items) ? body.items : [])
    .filter((item) => item && /^\d{2}:\d{2}$/.test(item.time))
    .slice(0, MAX_ITEMS)
    .map((item) => ({
      time: item.time,
      weekdays: Array.isArray(item.weekdays) ? item.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : null,
    }));
  return { endpoint, tz: typeof body.tz === 'string' ? body.tz.slice(0, 64) : 'UTC', items };
}

/** 這個訂閱在 now 這一分鐘有沒有該響的項目（照手機自己的時區算） */
export function isDue(sub, now = new Date()) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: sub.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
  } catch (e) {
    return false; // 認不得的時區名稱
  }
  const get = (type) => parts.find((p) => p.type === type).value;
  const time = `${get('hour')}:${get('minute')}`;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return sub.items.some((item) => item.time === time && (!item.weekdays || item.weekdays.includes(weekday)));
}

async function loadSubs(env) {
  return (await env.PUSH_KV.get(KV_KEY, 'json')) || {};
}

/** 手機呼叫的：回傳公鑰、或存下訂閱和時間表 */
export async function handlePushRequest(body, env) {
  if (!env.PUSH_KV) return { status: 500, payload: { error: '後端還沒綁定推播用的儲存空間（PUSH_KV）' } };
  let jwk;
  try {
    jwk = loadJwk(env);
  } catch (e) {
    return { status: 500, payload: { error: e.message } };
  }

  if (body.mode === 'push-key') return { status: 200, payload: { publicKey: publicKeyOf(jwk) } };

  const sub = cleanSubscription(body);
  if (!sub) return { status: 400, payload: { error: '訂閱資料格式不對' } };
  const subs = await loadSubs(env);
  if (sub.items.length) {
    if (!subs[sub.endpoint] && Object.keys(subs).length >= MAX_SUBS) {
      return { status: 429, payload: { error: '已經有太多裝置訂閱提醒了' } };
    }
    subs[sub.endpoint] = { tz: sub.tz, items: sub.items };
  } else {
    delete subs[sub.endpoint]; // 所有提醒都關掉了
  }
  await env.PUSH_KV.put(KV_KEY, JSON.stringify(subs));
  return { status: 200, payload: { ok: true, count: sub.items.length } };
}

/** 排程每分鐘呼叫的：時間到的就推一下 */
export async function sendDuePushes(env, now = new Date()) {
  if (!env.PUSH_KV || !env.VAPID_PRIVATE_JWK) return;
  const jwk = loadJwk(env);
  const subs = await loadSubs(env);
  let changed = false;
  for (const [endpoint, sub] of Object.entries(subs)) {
    if (!isDue({ ...sub, endpoint }, now)) continue;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { TTL: '600', Urgency: 'high', Authorization: await vapidAuthorization(jwk, endpoint) },
      });
      // 訂閱已經失效（使用者移除了主畫面的圖示，或關掉了通知）
      if (res.status === 404 || res.status === 410) {
        delete subs[endpoint];
        changed = true;
      } else if (!res.ok) {
        console.log('push failed', res.status, await res.text());
      }
    } catch (e) {
      console.log('push error', e.message);
    }
  }
  if (changed) await env.PUSH_KV.put(KV_KEY, JSON.stringify(subs));
}
