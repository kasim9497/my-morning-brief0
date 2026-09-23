/**
 * 睡眠計算機核心邏輯：90 分鐘睡眠週期
 * 入睡緩衝固定 15 分鐘（先寫死，不開放使用者調整，之後真的要加再開放）
 */

export const SLEEP_CYCLE_MIN = 90;
export const FALL_ASLEEP_MIN = 15;
export const MIN_CYCLES = 3;
export const MAX_CYCLES = 6;
export const RECOMMENDED_CYCLES = 4;

function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// 回傳 target 相對 reference 是哪一天：''（同一天）/'明天'/'昨天'/null（差超過一天，不特別標）
function dayLabel(target, reference) {
  const diffDays = Math.round((dateOnly(target) - dateOnly(reference)) / 86400000);
  if (diffDays === 0) return '';
  if (diffDays === 1) return '明天';
  if (diffDays === -1) return '昨天';
  return null;
}

function buildOptions(pickTime) {
  const options = [];
  for (let cycles = MIN_CYCLES; cycles <= MAX_CYCLES; cycles++) {
    options.push({ cycles, hours: +((cycles * SLEEP_CYCLE_MIN) / 60).toFixed(1), ...pickTime(cycles) });
  }
  return options;
}

/** 「我現在要睡」：現在時間 + 15 分鐘入睡緩衝，往後推算各週期數對應的起床時間 */
export function calcFromNow(now = new Date()) {
  const sleepTime = new Date(now.getTime() + FALL_ASLEEP_MIN * 60000);
  const options = buildOptions((cycles) => {
    const wakeTime = new Date(sleepTime.getTime() + cycles * SLEEP_CYCLE_MIN * 60000);
    return { time: formatTime(wakeTime), label: dayLabel(wakeTime, now) };
  });
  return { now, sleepTime, options };
}

/** 「我要幾點起床」：指定起床時間，往回推算各週期數對應的建議上床時間 */
export function calcFromWakeTime(wakeTimeStr, now = new Date()) {
  const [h, m] = wakeTimeStr.split(':').map(Number);
  const wakeDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (wakeDate <= now) wakeDate.setDate(wakeDate.getDate() + 1); // 取「下一次發生」的那個時間點

  const options = buildOptions((cycles) => {
    const sleepTime = new Date(wakeDate.getTime() - cycles * SLEEP_CYCLE_MIN * 60000);
    const bedTime = new Date(sleepTime.getTime() - FALL_ASLEEP_MIN * 60000);
    return { time: formatTime(bedTime), label: dayLabel(bedTime, now) };
  });
  return { wakeDate, options };
}
