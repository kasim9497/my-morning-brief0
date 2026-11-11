/**
 * 根據紀錄主動提的建議：今日頁日曆下面那一張，一次只出現一條。
 * 每一條都有具體的依據（寫在句子裡）和一個按了就生效的動作；按「先不用」會安靜一陣子。
 * 這裡只決定「現在該提哪一條」，不碰畫面也不碰 localStorage，測試可以直接餵資料。
 *
 * 優先順序：今天的事（昨晚睡太少）＞這一週的事（一直晚睡）＞長期的事（某項作息一直沒做）
 */

const shortName = (label) => String(label).split(/[：:]/)[0].trim();

// 「先不用」之後幾天內不再提同一條
export const SNOOZE_DAYS = { tired: 1, 'late-bed': 7, stale: 21 };
// 任何一條「作息沒做」的建議處理完之後，這個編號也跟著安靜幾天
export const STALE_ANY = 'stale:any';
export const STALE_GAP_DAYS = 3;

/**
 * ctx：
 * - todayKey：今天「YYYY-MM-DD」
 * - sleep：dailyBrief.sleepSummary() 的結果
 * - extras：今天還沒做、而且不是每天都有的任務 [{ instanceId, label }]
 * - bed：今晚的就寢項目 { id, time, lead }（沒有就 null）
 * - routines：可以調整的作息 [{ defId, label, scheduled: 有沒有排在任何一天, recent: 最近幾次的狀態（新的在前） }]
 * - dismissed：{ 建議編號: 安靜到哪一天 }
 * 回傳 { id, kind, text, action: { type, label, ... } } 或 null
 */
export function pickSuggestion(ctx) {
  const quiet = (id) => ctx.dismissed && ctx.dismissed[id] && ctx.dismissed[id] >= ctx.todayKey;
  const { sleep } = ctx;

  // 昨晚睡太少：今天額外排的事延到明天
  if (sleep.lastHours !== null && sleep.lastHours < 6 && ctx.extras.length) {
    const id = `tired:${ctx.todayKey}`;
    if (!quiet(id)) {
      return {
        id,
        kind: 'tired',
        text: `昨晚只在床上 ${sleep.lastHours} 小時。今天排的「${ctx.extras.map((t) => shortName(t.label)).join('、')}」要不要延到明天？`,
        action: { type: 'postpone', label: '延到明天', instanceIds: ctx.extras.map((t) => t.instanceId) },
      };
    }
  }

  // 這一週平均比設定的就寢時間晚很多：把提醒再提前
  if (ctx.bed && sleep.recorded >= 4 && sleep.avgBedMinutes !== null && ctx.bed.lead < 60) {
    const [h, m] = ctx.bed.time.split(':').map(Number);
    const late = Math.round(sleep.avgBedMinutes - (((h + 12) % 24) * 60 + m));
    if (late > 45 && !quiet('late-bed')) {
      return {
        id: 'late-bed',
        kind: 'late-bed',
        text: `最近 ${sleep.recorded} 晚平均 ${sleep.avgBedClock} 上床，比設定的 ${ctx.bed.time} 晚 ${late} 分鐘。要把就寢提醒再提前嗎？`,
        action: { type: 'lead', label: '提前到 60 分鐘', itemId: ctx.bed.id, lead: 60 },
      };
    }
  }

  // 某項作息最近三次都沒做：先停掉，清單才不會一直掛著做不到的事
  // 剛處理過一條作息的建議，幾天內不接著提下一條（STALE_ANY），不然會一條接一條跳出來
  const stale = quiet(STALE_ANY) ? null : ctx.routines.find((r) => r.scheduled && r.recent.length >= 3 && r.recent.slice(0, 3).every((s) => s !== 'done') && !quiet(`stale:${r.defId}`));
  if (stale) {
    return {
      id: `stale:${stale.defId}`,
      kind: 'stale',
      text: `「${stale.label}」最近三次都沒有打勾。先從每週安排拿掉嗎？之後隨時可以在設定加回來。`,
      action: { type: 'pause', label: '先拿掉', defId: stale.defId },
    };
  }

  return null;
}
