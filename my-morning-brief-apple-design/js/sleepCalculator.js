/**
 * 睡眠計算機：根據 90 分鐘睡眠週期理論
 * 入睡平均需要 15 分鐘緩衝，一個完整週期 90 分鐘，
 * 建議睡滿整數個週期（4~6 個）比睡到「整數小時」更容易在淺眠階段自然醒來
 */

const FALL_ASLEEP_BUFFER_MIN = 15;
const CYCLE_MIN = 90;

function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTimeStr(totalMin) {
  const wrapped = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 輸入想起床的時間，往回推算建議的上床時間（6/5/4 個週期） */
export function suggestBedtimes(wakeTimeStr) {
  const wakeMin = parseTimeToMinutes(wakeTimeStr);
  return [6, 5, 4].map((cycles) => {
    const sleepMin = cycles * CYCLE_MIN;
    const bedMin = wakeMin - sleepMin - FALL_ASLEEP_BUFFER_MIN;
    return { cycles, hours: +(sleepMin / 60).toFixed(1), time: minutesToTimeStr(bedMin) };
  });
}

/** 輸入現在／打算上床的時間，往後推算建議的起床時間（4/5/6 個週期） */
export function suggestWakeTimes(bedTimeStr) {
  const asleepMin = parseTimeToMinutes(bedTimeStr) + FALL_ASLEEP_BUFFER_MIN;
  return [4, 5, 6].map((cycles) => {
    const sleepMin = cycles * CYCLE_MIN;
    const wakeMin = asleepMin + sleepMin;
    return { cycles, hours: +(sleepMin / 60).toFixed(1), time: minutesToTimeStr(wakeMin) };
  });
}
