/**
 * 今日頁那張日曆的內容：農曆日期、每天的「宜／忌」和一句重點、連續天數、最近七晚的睡眠。
 *
 * 宜／忌不是抽籤也不是 AI 寫的：每一條都從手機上的真實紀錄或當天的資料推出來
 * （昨晚睡多久、錯題本有幾題該複習、今天會不會下雨…），所以每天不一樣，也都有憑據。
 * 這裡只有計算，沒有畫面，也不碰 localStorage，測試可以直接餵資料進來。
 */

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const shiftDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/** 「邏輯上的今天」：凌晨 5 點前還算前一天（跟就寢提醒、睡眠紀錄同一套規則） */
export const logicalToday = (now = new Date()) => shiftDays(new Date(now.getTime() - 5 * 3600000), 0);

const LUNAR_DAYS = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

/** 農曆「丙午年 十月初四」。用瀏覽器內建的農曆換算；這個瀏覽器不支援就回傳空字串，不自己亂算 */
export function lunarText(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('zh-TW-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' }).formatToParts(date);
    const get = (type) => (parts.find((p) => p.type === type) || {}).value;
    const day = LUNAR_DAYS[Number(get('day')) - 1];
    if (!get('yearName') || !get('month') || !day) return '';
    return `${get('yearName')}年 ${get('month')}${day}`;
  } catch (e) {
    return '';
  }
}

/** 連續幾天：從今天（今天還沒有就從昨天）往回數，中間不能斷 */
export function streakOf(days, today) {
  const set = new Set(days);
  let cursor = set.has(dayKey(today)) ? today : shiftDays(today, -1);
  let count = 0;
  while (set.has(dayKey(cursor))) {
    count += 1;
    cursor = shiftDays(cursor, -1);
  }
  return count;
}

/** 一筆睡眠算哪一晚（凌晨 5 點前上床算前一天晚上）。跟 sleepLog.js 的 nightOf 同一個規則 */
function nightKey(entry) {
  const bed = new Date(entry.bedAt);
  if (bed.getHours() < 5) bed.setDate(bed.getDate() - 1);
  return dayKey(bed);
}

const hoursIn = (entry) => (Date.parse(entry.wokeAt || entry.wakeAt) - Date.parse(entry.bedAt)) / 3600000;
// 上床時間換成「從中午起算的分鐘數」，這樣 23:30 和 01:10 可以直接比先後、算平均
const bedMinutes = (entry) => {
  const bed = new Date(entry.bedAt);
  return ((bed.getHours() + 12) % 24) * 60 + bed.getMinutes();
};
const clockFromBedMinutes = (minutes) => `${pad((Math.floor(minutes / 60) + 12) % 24)}:${pad(Math.round(minutes) % 60)}`;
const average = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

/**
 * 最近的睡眠：昨晚那一筆、最近七晚每晚在床上幾小時（沒記錄的是 null）、這七晚和前七晚的平均、
 * 平均幾點上床、連續記錄幾晚
 */
export function sleepSummary(log, now = new Date()) {
  const nights = log.filter((entry) => entry.kind !== 'nap');
  const byNight = new Map(nights.map((entry) => [nightKey(entry), entry]));
  const lastNightDate = shiftDays(logicalToday(now), -1);
  const series = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDays(lastNightDate, i - 6);
    const entry = byNight.get(dayKey(date)) || null;
    return { date, entry, hours: entry ? +hoursIn(entry).toFixed(1) : null };
  });
  const recent = series.filter((n) => n.entry);
  const previous = Array.from({ length: 7 }, (_, i) => byNight.get(dayKey(shiftDays(lastNightDate, i - 13)))).filter(Boolean);
  const avgBed = average(recent.map((n) => bedMinutes(n.entry)));
  return {
    last: series[6].entry,
    lastHours: series[6].hours,
    series,
    avgHours: recent.length ? +average(recent.map((n) => n.hours)).toFixed(1) : null,
    prevAvgHours: previous.length ? +average(previous.map(hoursIn)).toFixed(1) : null,
    avgBedMinutes: avgBed,
    avgBedClock: avgBed === null ? null : clockFromBedMinutes(avgBed),
    recorded: recent.length,
    streak: streakOf(nights.map(nightKey), lastNightDate),
  };
}

/** 最近七晚的一句結論，給睡眠那張卡片用。沒有紀錄就回傳空字串 */
export function sleepInsight(summary) {
  if (!summary.recorded) return '';
  const parts = [`最近 ${summary.recorded} 晚平均在床上 ${summary.avgHours} 小時`];
  if (summary.prevAvgHours !== null) {
    const diff = Math.round((summary.avgHours - summary.prevAvgHours) * 60);
    if (Math.abs(diff) >= 10) parts.push(`比前一週${diff > 0 ? '多' : '少'} ${Math.abs(diff)} 分鐘`);
    else parts.push('跟前一週差不多');
  }
  if (summary.avgBedClock) parts.push(`平均 ${summary.avgBedClock} 上床`);
  return `${parts.join('，')}。`;
}

const number = (value) => {
  const n = parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// 「運動：跑步 2km + 重訓」只取冒號前面的名稱，日曆上放不下整句
const shortName = (label) => String(label).split(/[：:]/)[0].trim();

/**
 * 今天的「宜／忌」和一句重點。
 * ctx：
 * - sleep：sleepSummary() 的結果
 * - targetBed：今晚設定的就寢時間「HH:MM」（沒有就 null）
 * - curfew：手機宵禁的時間「HH:MM」（沒有就 null）
 * - weather：today.json 的 weather（抓不到就 null）
 * - quiz：{ doneToday, due（今天該複習的錯題數）, streak }
 * - pendingTasks：今天還沒做、而且不是每天都有的任務名稱
 * - countdowns：[{ label, daysLeft }]
 * 回傳 { lead, yi: 最多三條, ji: 最多兩條 }
 */
export function composeBrief(ctx) {
  const { sleep, weather, quiz } = ctx;
  const yi = [];
  const ji = [];
  let lead = '';

  // ── 睡眠：最優先，因為使用者白天很睏
  const short = sleep.lastHours !== null && sleep.lastHours < 6.5;
  if (sleep.last === null) {
    lead = '昨晚沒有睡眠紀錄。';
    yi.push('睡前記下上床時間');
  } else if (short) {
    lead = `昨晚在床上 ${sleep.lastHours} 小時，偏少。`;
    yi.push('今晚提早上床');
    ji.push('午後的咖啡因');
  } else {
    lead = `昨晚在床上 ${sleep.lastHours} 小時${sleep.lastHours >= 7.5 ? '，睡得夠' : ''}。`;
  }
  if (sleep.last && sleep.last.wakeType === 'early') yi.push('午間閉眼二十分鐘');

  if (ctx.targetBed && sleep.avgBedMinutes !== null && sleep.recorded >= 3) {
    const [h, m] = ctx.targetBed.split(':').map(Number);
    const target = ((h + 12) % 24) * 60 + m;
    if (sleep.avgBedMinutes - target > 45) ji.push(`拖過 ${ctx.targetBed} 才上床`);
  }

  // ── 天氣
  if (weather && !weather.isFallback) {
    const rain = number(weather.rainChance);
    const min = number(weather.tempMin);
    const max = number(weather.tempMax);
    if ((rain !== null && rain >= 50) || /雨/.test(weather.condition || '')) yi.push('帶傘');
    if (max !== null && max <= 10) yi.push('穿暖一點');
    else if (min !== null && max !== null && max - min >= 8) yi.push('帶件外套');
    const uv = number(weather.uvIndex);
    if (uv !== null && uv >= 6) yi.push('防曬');
  }

  // ── 題庫
  if (quiz.due > 0) yi.push(`複習錯題 ${quiz.due} 題`);
  else if (!quiz.doneToday) yi.push('題庫十題');
  if (!quiz.doneToday && quiz.streak >= 3) ji.push(`讓題庫連續 ${quiz.streak} 天中斷`);

  // ── 今天特別排的事、快到的倒數
  (ctx.pendingTasks || []).slice(0, 1).forEach((label) => yi.push(shortName(label)));
  const soon = (ctx.countdowns || []).filter((c) => c.daysLeft >= 0 && c.daysLeft <= 7).sort((a, b) => a.daysLeft - b.daysLeft)[0];
  if (soon) yi.push(soon.daysLeft === 0 ? `今天：${soon.label}` : `準備${soon.label}（剩 ${soon.daysLeft} 天）`);

  if (!ji.length && ctx.curfew) ji.push(`${ctx.curfew} 後滑手機`);

  // 重點那句：睡眠之外，再帶一件今天最該做的事
  if (quiz.streak >= 2 && quiz.doneToday) lead += `題庫已經連續 ${quiz.streak} 天。`;
  else if (quiz.due > 0) lead += `錯題本有 ${quiz.due} 題今天該複習。`;

  return { lead, yi: [...new Set(yi)].slice(0, 3), ji: [...new Set(ji)].slice(0, 2) };
}
