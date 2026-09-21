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

const ALLOWED_ORIGIN = '*'; // 之後如果想收斂，改成你的 GitHub Pages 網域
const MODEL = 'deepseek/deepseek-chat-v3.1';

const SYSTEM_PROMPT = `你是 Kasim 的個人生活排程 App 裡的 AI 助理。你可以直接幫他操作 App（延後任務、改作息設定、記錄追劇/讀書進度、管理倒數等），不是只能聊天的客服機器人。

【你能做的動作，一次只能選一個】：
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
- none：不需要執行任何動作，單純回覆文字

【重要規則】：
1. instanceId / defId / id 一定要從下面提供的【目前 App 狀態】裡面挑選「已經存在」的真實值，絕對不能自己編一個。如果找不到使用者說的項目，就回覆說明「找不到」，action 填 none，不要硬猜一個 id。
2. 使用者的指令不夠明確時（例如沒說清楚要延後幾天、目標日是哪天），先在 reply 裡用一句話問清楚，action 填 none，不要用預設值硬做。
3. 只要有實際執行動作，reply 要用一句話跟使用者確認你做了什麼（用未來完成的口氣，因為前端會在你回覆之後才真的執行）。
4. 一律用繁體中文回覆，語氣自然、簡短，不要長篇大論。

【請輸出嚴格的 JSON 格式】：
{
  "reply": "給使用者看的回覆文字",
  "action": { "type": "上面列的其中一種或 none", "args": { ... } }
}`;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function callOpenRouter(apiKey, messages) {
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
      response_format: { type: 'json_object' },
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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
    }

    if (!env.OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ reply: '後端還沒設定 OPENROUTER_API_KEY，請用 wrangler secret put 加上去。', action: null }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ reply: '請求格式錯誤。', action: null }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const history = Array.isArray(body.history) ? body.history : [];
    const appState = body.appState || {};

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n【目前 App 狀態】：\n${JSON.stringify(appState, null, 2)}` },
      ...history.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    ];

    // 最多重試一次：實測過 OpenRouter 偶爾（路由到不同底層 provider 時）
    // 就算開了 response_format json_object 還是會吐出格式壞掉的 JSON
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await callOpenRouter(env.OPENROUTER_API_KEY, messages);
        return new Response(
          JSON.stringify({
            reply: typeof result.reply === 'string' ? result.reply : '（沒有收到回覆）',
            action: result.action && typeof result.action === 'object' ? result.action : null,
          }),
          { headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
        );
      } catch (e) {
        lastError = e;
      }
    }

    return new Response(JSON.stringify({ reply: `AI 服務暫時不可用（${lastError?.message || '未知錯誤'}），稍後再試試看。`, action: null }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};
