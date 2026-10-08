/**
 * my-morning-brief0 AI 聊天代理
 *
 * 職責很單純：藏住 OPENROUTER_API_KEY，把前端送來的對話 + App 狀態轉發給
 * OpenRouter，再把模型的決策（要不要執行某個動作）原封不動轉發回前端。
 *
 * 這個 Worker 完全是無狀態的：它不寫 localStorage、不記得任何使用者資料，
 * 「真的執行動作」永遠是前端的 js/chatBox.js 在做。這裡只負責「決定要不要
 * 執行、執行哪一個」，不負責「真的去改」。
 */

// 只接受從晨序網站（和本機開發）送來的請求。瀏覽器會自動帶 Origin，別的網站沒辦法冒用；
// 用 curl 之類的工具還是可以自己填這個標頭，所以這只擋「別的網頁偷用」，
// 真正的上限是 OpenRouter 那把 key 的花費額度。
import { handlePushRequest, sendDuePushes } from './push.js';
import { handleBackupRequest, MAX_BACKUP_CHARS } from './backup.js';

const ALLOWED_ORIGINS = ['https://kasim9497.github.io'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin || '');
}

// 同一個 IP 在一段時間內最多幾次。
// ponytail: 計數放在記憶體裡，Worker 換一台機器或重啟就歸零，所以只是擋掉一口氣狂打的情況。
// 要做到嚴格的限制，改用 Cloudflare 的 Rate Limiting 規則或 KV。
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();

function isRateLimited(ip, now = Date.now()) {
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// 請求內容的大小上限，避免有人塞一大包文字進來燒額度
const MAX_BODY_CHARS = 40000;
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY = 10;
const MODEL = 'deepseek/deepseek-chat-v3.1'; // OpenRouter 上的付費模型（備援）
// Cloudflare Workers AI 的模型（主要）。帳號每天有免費額度，免費方案超過就是當天不能用，不會收費
const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const SYSTEM_PROMPT = `你是 Kasim 的個人生活排程 App 裡的 AI 助理。你可以直接幫他操作 App（延後任務、改作息設定、記錄追劇/讀書進度、管理倒數等），不是只能聊天的客服機器人。

【你能做的動作，一次可以做好幾個】：
- postpone_task { instanceId, option }：延後今天的某個任務。option 只能是 "plus1"（延1天）/ "plus2"（延2天）/ "plus3"（延3天）/ "nextWeek"（延到下週同一天）/ "skipWeek"（這件事跳過這週）
- skip_task { instanceId }：把今天的某個任務標記跳過
- toggle_task_done { instanceId }：切換今天某個任務的完成狀態
- set_task_weekday_schedule { defId, weekdays }：把某個可調整的作息任務改成「星期幾」模式，weekdays 是 0-6 的陣列（0=週日...6=週六）
- set_task_interval_schedule { defId, everyNDays }：把某個可調整的作息任務改成「每 N 天一次」模式
- add_countdown { label, targetDate }：新增一個倒數，targetDate 格式 YYYY-MM-DD
- remove_countdown { id }：刪除一個倒數
- add_media_item { title, type, totalUnits, targetDate }：新增追劇/讀書項目，type 只能是 "drama"/"book"/"movie"，targetDate 格式 YYYY-MM-DD
- log_media_progress { id, units }：記錄某個追劇/讀書項目今天完成的量
- postpone_media_target { id, days }：延後某個追劇/讀書項目的目標日
- remove_media_item { id }：刪除一個追劇/讀書追蹤項目
- set_sleep_reminder { enabled, bedTime }：開關就寢提醒，bedTime 格式 HH:MM

【重要規則】：
1. instanceId / defId / id 一定要從下面【目前 App 狀態】裡挑「已經存在」的真實值，絕對不能自己編。
2. 使用者講的名稱常常不精確（例如把「蔬果日」說成「水果日」、把「運動：重訓」說成「健身」）。只要狀態裡有一個明顯對得上的項目，就直接當成那一個去做，並在 reply 裡講出你用的正式名稱；不要為了這種小差異反問。只有真的有兩個以上都說得通、或完全對不上時才問。
3. 使用者回「好」「對」「是」「可以」這類話時，是在同意你上一句問的事，要接著把那件事做完，不要當成新的話題。
4. 一句話裡有好幾個要求時，每一個都要處理：能做的動作全部放進 actions，問題全部在 reply 裡回答，不要只挑一個。
5. 「改成」「換成」是把原本的設定整個換掉，不是在原本的上面再加。例如原本是星期二，使用者說「改成每週一跟五」，weekdays 就是 [1, 5]，不能把原本的 2 留著。使用者打字常有同音錯字（「一根五」就是「一跟五」），照最合理的意思理解。星期對照：日=0、一=1、二=2、三=3、四=4、五=5、六=6。
6. 真的缺少必要資訊時（例如沒說延到哪一天）才問，而且一次問清楚。
7. 有執行動作時，reply 用一句話說你做了什麼。
8. 不是操作 App 的一般問題也要回答。天氣、匯率、星座、今天日期這些，【目前 App 狀態】的 brief 裡有今天的資料，直接拿來回答；brief 裡沒有的即時資訊就老實說這裡查不到。
9. 被問到你是什麼模型時，照實回答：Meta 的 Llama 3.3 70B（跑在 Cloudflare Workers AI 上）。
10. 一律用繁體中文，語氣自然、簡短。

【請輸出嚴格的 JSON 格式】：
{
  "reply": "給使用者看的回覆文字",
  "actions": [ { "type": "上面列的其中一種", "args": { ... } } ]
}
不需要執行任何動作時，actions 給空陣列 []。`;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function callWorkersAI(ai, messages, maxTokens) {
  const out = await ai.run(WORKERS_AI_MODEL, {
    messages,
    temperature: 0.3,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  });
  // 開了 JSON 模式時 response 有時已經是物件，有時是字串
  const content = out?.response;
  if (!content) throw new Error('Workers AI 回應沒有內容');
  return typeof content === 'string' ? JSON.parse(content) : content;
}

async function callOpenRouter(apiKey, messages, maxTokens) {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      // 同一個模型在 OpenRouter 有好幾家供應商，速度差很多；指定挑回應最快的那一家
      provider: { sort: 'latency' },
    }),
  });

  if (!resp.ok) {
    throw new Error(`OpenRouter HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter 回應沒有內容');
  return JSON.parse(content);
}

// 先用免費的 Workers AI；它失敗（例如當天額度用完）而且有 OpenRouter 金鑰時才改用 OpenRouter
async function callModel(env, messages, maxTokens = 500) {
  if (env.AI) {
    try {
      return await callWorkersAI(env.AI, messages, maxTokens);
    } catch (e) {
      if (!env.OPENROUTER_API_KEY) throw e;
    }
  }
  return callOpenRouter(env.OPENROUTER_API_KEY, messages, maxTokens);
}

export default {
  // 每分鐘一次（wrangler.toml 的 crons）：作息時間到了就推播提醒
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDuePushes(env));
  },

  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (!isAllowedOrigin(origin)) {
      return json({ reply: '這個來源不能使用 AI 助理。', action: null }, 403);
    }

    if (isRateLimited(request.headers.get('CF-Connecting-IP') || 'unknown')) {
      return json({ reply: '問得太頻繁了，過幾分鐘再試。', action: null }, 429);
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(origin) });
    }

    let body;
    try {
      const raw = await request.text();
      // 雲端備份整包資料比一則聊天大得多，上限分開算
      if (raw.length > MAX_BACKUP_CHARS + 2000) return json({ reply: '這次的內容太長了。', action: null }, 413);
      body = JSON.parse(raw);
      if (body.mode !== 'backup-put' && raw.length > MAX_BODY_CHARS) return json({ reply: '這次的內容太長了。', action: null }, 413);
    } catch (e) {
      return new Response(JSON.stringify({ reply: '請求格式錯誤。', action: null }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // 雲端自動備份：存、取使用者的紀錄（cloudflare-worker/backup.js）
    if (body.mode === 'backup-put' || body.mode === 'backup-get') {
      const result = await handleBackupRequest(body, env);
      return json(result.payload, result.status);
    }

    // 作息時間的推播提醒：取公鑰、存訂閱和時間表（cloudflare-worker/push.js）
    if (body.mode === 'push-key' || body.mode === 'push-sync') {
      const result = await handlePushRequest(body, env);
      return json(result.payload, result.status);
    }

    if (!env.AI && !env.OPENROUTER_API_KEY) {
      return json({ reply: '後端沒有可用的 AI 模型。', action: null }, 500);
    }

    // 另一種用法：每日資料流程（generate_brief.py）送一段完整的提示詞過來，這裡只負責叫模型、把它回的 JSON 原樣轉回去。
    // 這樣每日的運勢和出門提醒也能用免費的 Workers AI，不用另外的金鑰。
    if (body.mode === 'brief') {
      if (typeof body.prompt !== 'string' || !body.prompt) return json({ error: 'prompt 不能是空的' }, 400);
      let lastBriefError = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return json({ result: await callModel(env, [{ role: 'user', content: body.prompt }], 1200) });
        } catch (e) {
          lastBriefError = e;
        }
      }
      return json({ error: lastBriefError?.message || '未知錯誤' }, 502);
    }

    const history = (Array.isArray(body.history) ? body.history : [])
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, MAX_MESSAGE_CHARS) }));
    const appState = body.appState || {};

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n【目前 App 狀態】：\n${JSON.stringify(appState)}` },
      ...history.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    ];

    // 最多重試一次：實測過 OpenRouter 偶爾（路由到不同底層 provider 時）
    // 就算開了 response_format json_object 還是會吐出格式壞掉的 JSON
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await callModel(env, messages);
        // 模型有時還是會照舊格式回單一個 action，兩種都收
        const rawActions = Array.isArray(result.actions) ? result.actions : (result.action ? [result.action] : []);
        const actions = rawActions.filter((a) => a && typeof a === 'object' && a.type && a.type !== 'none');
        return new Response(
          JSON.stringify({
            reply: typeof result.reply === 'string' ? result.reply : '（沒有收到回覆）',
            actions,
            // 舊版前端（瀏覽器還留著快取時）只認得單一個 action
            action: actions[0] || null,
          }),
          { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
        );
      } catch (e) {
        lastError = e;
      }
    }

    return new Response(JSON.stringify({ reply: `AI 服務暫時不可用（${lastError?.message || '未知錯誤'}），稍後再試試看。`, action: null }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  },
};
