/**
 * 本週摘要：把最近 7 天記在晨序裡的東西整理成一段文字，讓使用者交給 Claude 分析
 *
 * 只負責產生文字。怎麼送出去（分享、複製）在 SettingsView.js。
 * iPhone「健康」App 的資料網頁讀不到，使用者想一起分析的話自己打在備註欄。
 */

// ponytail: 過去幾天的任務是用「現在」的作息設定回推的。中途改過作息的話，改之前那幾天
// 沒打開過 App 的日子會照新設定算。要精確得每天存一份當天的任務快照。

import { getTasksForDate, getTodayStr, addDays, getWeekday } from './taskEngine.js';
import { getMediaItems, getTypeInfo } from './mediaTracker.js';
import { getMistakes } from './quizMistakes.js';
import { getFixedSchedule } from './fixedSchedule.js';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const STATUS_TEXT = { pending: '沒做', postponed: '延後', skipped: '跳過' };

function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}（${WEEKDAYS[getWeekday(dateStr)]}）`;
}

export function buildWeeklyReport(healthNote = '', today = getTodayStr()) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const perTask = new Map(); // 任務名稱 -> { done, total }
  const dayLines = dates.map((dateStr) => {
    const tasks = getTasksForDate(dateStr);
    tasks.forEach((t) => {
      const stat = perTask.get(t.label) || { done: 0, total: 0 };
      stat.total += 1;
      if (t.status === 'done') stat.done += 1;
      perTask.set(t.label, stat);
    });
    const done = tasks.filter((t) => t.status === 'done').length;
    const missed = tasks.filter((t) => t.status !== 'done').map((t) => `${t.label}（${STATUS_TEXT[t.status]}）`);
    return `- ${shortDate(dateStr)} 完成 ${done}/${tasks.length}${missed.length ? '；未完成：' + missed.join('、') : ''}`;
  });

  const taskLines = [...perTask.entries()].map(([label, s]) => `- ${label}：${s.done}/${s.total}`);
  const mediaLines = getMediaItems().map((m) => {
    const { unit } = getTypeInfo(m.type);
    return `- ${m.title}：${m.completedUnits}/${m.totalUnits} ${unit}，目標日 ${m.targetDate}，${m.progress.status}`;
  });
  const mistakes = getMistakes();
  const scheduleLine = getFixedSchedule().map((item) => `${item.label} ${item.time}`).join('、');

  const sections = [
    `以下是我 ${shortDate(dates[0])} 到 ${shortDate(dates[6])} 這一週在生活排程 App「晨序」裡的紀錄。`,
    '請幫我分析這一週的狀況：哪些習慣做得穩、哪些常漏掉、可能的原因，最後給我 3 個下週可以調整的具體建議。',
    '',
    '【每天的任務】',
    ...dayLines,
    '',
    '【各項任務這週完成幾次】',
    ...taskLines,
    '',
    `【我設定的作息時間】${scheduleLine}`,
  ];
  if (mediaLines.length) sections.push('', '【追劇／讀書進度】', ...mediaLines);
  sections.push('', `【駕照筆試】錯題本目前有 ${mistakes.length} 題${mistakes.length ? `，錯最多次的是「${[...mistakes].sort((a, b) => b.wrongCount - a.wrongCount)[0].question}」` : ''}`);
  if (healthNote.trim()) sections.push('', '【我從 iPhone「健康」App 補充的數據】', healthNote.trim());
  return sections.join('\n');
}
