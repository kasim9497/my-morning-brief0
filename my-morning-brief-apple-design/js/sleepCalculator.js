/**
 * 睡眠計算機：從上床時間推起床時間，或從起床時間推上床時間。
 *
 * 2026-10-19 改：不再照 90 分鐘週期算。使用者白天很睏、會比鬧鐘早醒又睡不回去，
 * 現階段的目標是先給夠「睡眠機會」（上床到起床的時間），建議 8.5 小時，選項從 7.5 到 9 小時。
 * 不另外加入睡緩衝：這裡算的就是待在床上的時間。
 */

export const SLEEP_HOURS = [7.5, 8, 8.5, 9];
export const RECOMMENDED_HOURS = 8.5;

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

/**
 * 「我現在要睡」：上床時間往後推 7.5～9 小時的起床時間。
 * now 也可以是之後才要上床的時間；這時候把真正的現在傳給 reference，「明天」才標得對
 */
export function calcFromNow(now = new Date(), reference = now) {
  const options = SLEEP_HOURS.map((hours) => {
    const wakeTime = new Date(now.getTime() + hours * 3600000);
    return { hours, time: formatTime(wakeTime), label: dayLabel(wakeTime, reference), at: wakeTime };
  });
  return { now, options };
}

/** 「我要幾點起床」：指定起床時間，往回推 7.5～9 小時的上床時間 */
export function calcFromWakeTime(wakeTimeStr, now = new Date()) {
  const [h, m] = wakeTimeStr.split(':').map(Number);
  const wakeDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (wakeDate <= now) wakeDate.setDate(wakeDate.getDate() + 1); // 取「下一次發生」的那個時間點

  const options = SLEEP_HOURS.map((hours) => {
    const bedTime = new Date(wakeDate.getTime() - hours * 3600000);
    return { hours, time: formatTime(bedTime), label: dayLabel(bedTime, now) };
  });
  return { wakeDate, options };
}
