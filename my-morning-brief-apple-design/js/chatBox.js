/**
 * AI 助理聊天框：資料/邏輯層
 *
 * 架構：前端把使用者訊息 + 目前 App 狀態摘要送到 Cloudflare Worker（負責藏
 * OPENROUTER_API_KEY，純靜態網站沒地方藏 key）。Worker 呼叫 OpenRouter 後
 * 回傳 { reply, action }，Worker 本身不執行任何動作、只負責轉發 AI 的決策
 * ——因為 Worker 是無狀態的，碰不到瀏覽器的 localStorage，實際「延後任務」
 * 「改設定」這些操作永遠是這個檔案呼叫本地既有的函式（taskEngine/countdown/
 * mediaTracker/sleepReminder）來做，等於 AI 只負責「決定要呼叫哪個函式」，
 * 不負責「真的去改資料」。
 *
 * CHAT_WORKER_URL 還沒填：Cloudflare Worker 要使用者自己申請帳號部署
 * （步驟見 CLAUDE.md／cloudflare-worker/README.md），部署好之後把網址貼進來。
 */

import {
  getTodayStr,
  getTasksForDate,
  toggleDone,
  skipTask,
  postponeTask,
  getConfigurableTaskIds,
  getRoutineConfig,
  setTaskWeekdaySchedule,
  setTaskIntervalSchedule,
  getTaskDef,
} from './taskEngine.js';

import { getCountdowns, addCountdown, removeCountdown } from './countdown.js';

import {
  getMediaItems,
  addMediaItem,
  removeMediaItem,
  logProgress,
  postponeTarget,
} from './mediaTracker.js';

import { getSleepReminderConfig, setSleepReminderConfig } from './sleepReminder.js';

import { dataService } from './services/dataService.js';
import { WORKER_URL } from './config.js';

const CHAT_WORKER_URL = WORKER_URL;

const VALID_POSTPONE_OPTIONS = ['plus1', 'plus2', 'plus3', 'nextWeek', 'skipWeek'];

let conversationHistory = [];

async function buildAppStateContext() {
  const todayStr = getTodayStr();
  const todayTasks = getTasksForDate(todayStr).map((t) => ({
    instanceId: t.instanceId,
    label: t.label,
    status: t.status,
  }));
  const configurableTasks = getConfigurableTaskIds().map((defId) => ({
    defId,
    label: getTaskDef(defId).label,
    schedule: getRoutineConfig()[defId],
  }));
  const countdowns = getCountdowns().map((c) => ({ id: c.id, label: c.label, targetDate: c.targetDate }));
  const mediaItems = getMediaItems().map((m) => ({
    id: m.id,
    title: m.title,
    type: m.type,
    completedUnits: m.completedUnits,
    totalUnits: m.totalUnits,
    targetDate: m.targetDate,
  }));
  const sleepReminder = getSleepReminderConfig();

  // 今天的晨報資料也帶過去，使用者問天氣、匯率、星座時 AI 才答得出來
  const [weather, rate, horoscope] = await Promise.all([
    dataService.getWeather(),
    dataService.getExchangeRate(),
    dataService.getHoroscope(),
  ]);
  const brief = {
    weekday: `星期${'日一二三四五六'[new Date().getDay()]}`,
    weather: weather && {
      location: weather.location,
      condition: weather.condition,
      tempCurrent: weather.tempCurrent,
      tempMin: weather.tempMin,
      tempMax: weather.tempMax,
      rainChance: weather.rainChance,
      tip: weather.aiTip,
    },
    cnyToTwd: rate && rate.current,
    horoscopeSummary: horoscope && horoscope.aiSummary,
  };

  return { todayStr, brief, todayTasks, configurableTasks, countdowns, mediaItems, sleepReminder };
}

// AI 只負責決定要呼叫哪個函式、帶什麼參數，這裡才是真的執行、真的碰 localStorage 的地方。
// 每個 handler 都要驗證參數存在才動作，不能盲目相信 AI 回傳的內容。
const ACTION_EXECUTORS = {
  postpone_task: (args) => {
    if (!args.instanceId || !VALID_POSTPONE_OPTIONS.includes(args.option)) return null;
    return postponeTask(getTodayStr(), args.instanceId, args.option) ? '已經幫你延後了。' : null;
  },
  skip_task: (args) => {
    if (!args.instanceId) return null;
    return skipTask(getTodayStr(), args.instanceId) ? '已標記跳過。' : null;
  },
  toggle_task_done: (args) => {
    if (!args.instanceId) return null;
    return toggleDone(getTodayStr(), args.instanceId) ? '已更新完成狀態。' : null;
  },
  set_task_weekday_schedule: (args) => {
    const validDays = Array.isArray(args.weekdays) && args.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!getConfigurableTaskIds().includes(args.defId) || !validDays) return null;
    return setTaskWeekdaySchedule(args.defId, args.weekdays) ? '作息設定已更新。' : null;
  },
  set_task_interval_schedule: (args) => {
    // 「每兩週」這種要 AI 換成 14 天；超過設定頁能設的 1–30 天就不做
    const n = Number(args.everyNDays);
    if (!getConfigurableTaskIds().includes(args.defId) || !Number.isInteger(n) || n < 1 || n > 30) return null;
    return setTaskIntervalSchedule(args.defId, n) ? '作息設定已更新。' : null;
  },
  add_countdown: (args) => {
    return addCountdown(args.label, args.targetDate) ? `已新增倒數「${args.label}」。` : null;
  },
  // 刪除沒辦法復原：AI 可能認錯是哪一筆，先讓使用者確認
  remove_countdown: (args) => {
    if (!args.id) return null;
    const target = getCountdowns().find((c) => c.id === args.id);
    if (!target || !window.confirm(`要刪除倒數「${target.label}」嗎？`)) return null;
    return removeCountdown(args.id) ? '已刪除這個倒數。' : null;
  },
  add_media_item: (args) => {
    return addMediaItem(args.title, args.type || 'drama', args.totalUnits, args.targetDate) ? `已新增追蹤「${args.title}」。` : null;
  },
  log_media_progress: (args) => {
    return logProgress(args.id, args.units) ? '進度已記錄。' : null;
  },
  postpone_media_target: (args) => {
    return postponeTarget(args.id, args.days) ? '目標日已延後。' : null;
  },
  remove_media_item: (args) => {
    if (!args.id) return null;
    const target = getMediaItems().find((m) => m.id === args.id);
    if (!target || !window.confirm(`要刪除「${target.title}」的追蹤嗎？`)) return null;
    return removeMediaItem(args.id) ? '已刪除這筆追蹤。' : null;
  },
  set_sleep_reminder: (args) => {
    // 作息裡沒有任何就寢項目時，什麼都改不到
    if (!/^\d{2}:\d{2}$/.test(args.bedTime || '') || !setSleepReminderConfig(!!args.enabled, args.bedTime).exists) return null;
    return '就寢提醒設定已更新。';
  },
};

function executeAction(action) {
  if (!action || action.type === 'none' || !ACTION_EXECUTORS[action.type]) return null;
  try {
    return ACTION_EXECUTORS[action.type](action.args || {});
  } catch (e) {
    console.warn('[chatBox] 執行動作失敗：', e);
    return null;
  }
}

export function getConversationHistory() {
  return conversationHistory;
}

export function isChatConfigured() {
  return !!CHAT_WORKER_URL;
}

// 上一次是不是連不上後端（不是 AI 回答了「做不到」）。畫面靠這個決定要不要把打的字放回輸入框
let lastSendFailed = false;
export const didLastSendFail = () => lastSendFailed;

export async function sendChatMessage(userText) {
  lastSendFailed = false;
  conversationHistory.push({ role: 'user', content: userText });

  if (!CHAT_WORKER_URL) {
    const notice = '這個功能還沒接上後端。需要先部署 Cloudflare Worker（步驟在 cloudflare-worker/README.md），部署好把網址貼進 js/chatBox.js 的 CHAT_WORKER_URL。';
    conversationHistory.push({ role: 'assistant', content: notice });
    return notice;
  }

  const appState = await buildAppStateContext();

  try {
    const resp = await fetch(CHAT_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history: conversationHistory.slice(-10),
        appState,
      }),
    });
    // Worker 出錯時（例如 key 沒設、OpenRouter 掛了）回的也是 { reply }，直接顯示那段說明
    const data = await resp.json().catch(() => null);
    if (!resp.ok && !data?.reply) throw new Error(`HTTP ${resp.status}`);
    let reply = data?.reply || '（沒有收到回覆）';

    // 一句話可能帶好幾個動作；Worker 還是舊版時只會有單一個 action
    const actions = Array.isArray(data?.actions) ? data.actions : (data?.action ? [data.action] : []);
    const requested = actions.filter((a) => a && a.type && a.type !== 'none');
    // 每個動作的實際結果（做到了是一句話，沒做到是 null）
    const results = resp.ok ? requested.map((a) => executeAction(a)) : [];
    const done = results.filter(Boolean);
    if (done.length > 0) {
      // 動作改的是 localStorage，畫面上的任務清單／週曆／倒數要跟著重畫
      window.dispatchEvent(new CustomEvent('chenxu:data-changed'));
    }
    // 有動作沒做到：模型的回覆是在執行之前寫的（常常是「已經幫你刪了」），不能留著。
    // 改成照實際結果講：做到的列出來，沒做到的講幾個
    if (resp.ok && done.length < requested.length) {
      reply = [...done, `有 ${requested.length - done.length} 件沒做到：可能是那一項已經做完、延後或不做了、你取消了，或是我沒聽懂。請看一下清單再說一次。`].join('\n');
    }

    conversationHistory.push({ role: 'assistant', content: reply });
    return reply;
  } catch (e) {
    lastSendFailed = true;
    // fetch 本身失敗（TypeError）多半是網路連不到 workers.dev：這個網域在中國大陸常被擋
    const errText = e instanceof TypeError
      ? '連不上 AI 後端。workers.dev 這個網域在中國大陸常被擋，開 VPN 再試一次。'
      : `連線失敗：${e.message}`;
    conversationHistory.push({ role: 'assistant', content: errText });
    return errText;
  }
}
