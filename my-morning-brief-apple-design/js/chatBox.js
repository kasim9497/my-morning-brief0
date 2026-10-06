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
  TASK_DEFS,
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

const CHAT_WORKER_URL = 'https://my-morning-brief-chat-proxy.loverinline520.workers.dev/';

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
    label: TASK_DEFS[defId]?.label || defId,
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
    postponeTask(getTodayStr(), args.instanceId, args.option);
    return '已經幫你延後了。';
  },
  skip_task: (args) => {
    if (!args.instanceId) return null;
    skipTask(getTodayStr(), args.instanceId);
    return '已標記跳過。';
  },
  toggle_task_done: (args) => {
    if (!args.instanceId) return null;
    toggleDone(getTodayStr(), args.instanceId);
    return '已更新完成狀態。';
  },
  set_task_weekday_schedule: (args) => {
    const validDays = Array.isArray(args.weekdays) && args.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!getConfigurableTaskIds().includes(args.defId) || !validDays) return null;
    setTaskWeekdaySchedule(args.defId, args.weekdays);
    return '作息設定已更新。';
  },
  set_task_interval_schedule: (args) => {
    if (!args.defId || !args.everyNDays) return null;
    setTaskIntervalSchedule(args.defId, args.everyNDays);
    return '作息設定已更新。';
  },
  add_countdown: (args) => {
    if (!args.label || !args.targetDate) return null;
    addCountdown(args.label, args.targetDate);
    return `已新增倒數「${args.label}」。`;
  },
  remove_countdown: (args) => {
    if (!args.id) return null;
    removeCountdown(args.id);
    return '已刪除這個倒數。';
  },
  add_media_item: (args) => {
    if (!args.title || !args.totalUnits || !args.targetDate) return null;
    addMediaItem(args.title, args.type || 'drama', args.totalUnits, args.targetDate);
    return `已新增追蹤「${args.title}」。`;
  },
  log_media_progress: (args) => {
    if (!args.id || !args.units) return null;
    logProgress(args.id, args.units);
    return '進度已記錄。';
  },
  postpone_media_target: (args) => {
    if (!args.id || !args.days) return null;
    postponeTarget(args.id, args.days);
    return '目標日已延後。';
  },
  remove_media_item: (args) => {
    if (!args.id) return null;
    removeMediaItem(args.id);
    return '已刪除這筆追蹤。';
  },
  set_sleep_reminder: (args) => {
    setSleepReminderConfig(!!args.enabled, args.bedTime || '23:30');
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

export async function sendChatMessage(userText) {
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
    const done = resp.ok ? requested.filter((a) => executeAction(a)) : [];
    if (done.length > 0) {
      // 動作改的是 localStorage，畫面上的任務清單／週曆／倒數要跟著重畫
      window.dispatchEvent(new CustomEvent('chenxu:data-changed'));
    }
    // AI 說做了、但參數沒通過這邊的檢查而沒有真的執行時，要讓使用者知道
    if (done.length < requested.length) {
      reply += `\n（有 ${requested.length - done.length} 個動作沒有成功執行，請換個說法再試一次。）`;
    }

    conversationHistory.push({ role: 'assistant', content: reply });
    return reply;
  } catch (e) {
    // fetch 本身失敗（TypeError）多半是網路連不到 workers.dev：這個網域在中國大陸常被擋
    const errText = e instanceof TypeError
      ? '連不上 AI 後端。workers.dev 這個網域在中國大陸常被擋，開 VPN 再試一次。'
      : `連線失敗：${e.message}`;
    conversationHistory.push({ role: 'assistant', content: errText });
    return errText;
  }
}
