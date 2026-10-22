/**
 * 日期與排程邏輯的自動測試。之前抓到的 bug 幾乎都出在這裡（跨日、換月、延後、每 N 天）。
 *
 * 執行：在 my-morning-brief-apple-design 資料夾裡跑 `node --test`
 * 部署流程（.github/workflows/morning_brief.yml）每次上線前也會跑，沒過就不會上線。
 *
 * 這些模組一載入就會讀 localStorage，Node 沒有這個東西，所以先放一個假的再載入。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const fakeStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => (fakeStorage.has(key) ? fakeStorage.get(key) : null),
  setItem: (key, value) => fakeStorage.set(key, String(value)),
  removeItem: (key) => fakeStorage.delete(key),
  key: (index) => [...fakeStorage.keys()][index] ?? null,
  get length() { return fakeStorage.size; },
};

const sleep = await import('../js/sleepCalculator.js');
const tasks = await import('../js/taskEngine.js');
const media = await import('../js/mediaTracker.js');
const countdown = await import('../js/countdown.js');
const weekly = await import('../js/weeklyReport.js');
const sleepLog = await import('../js/sleepLog.js');
const mistakes = await import('../js/quizMistakes.js');
const fixed = await import('../js/fixedSchedule.js');
const reminder = await import('../js/sleepReminder.js');
const push = await import('../../cloudflare-worker/push.js');

const defIds = (dateStr) => tasks.getTasksForDate(dateStr).map((t) => t.defId);

function localDateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── 睡眠計算機 ──────────────────────────────────────────────

test('現在要睡：加 15 分鐘入睡，再往後推 90 分鐘的倍數，跨過午夜要標明天', () => {
  const now = new Date(2026, 9, 6, 23, 50);
  const { sleepTime, options } = sleep.calcFromNow(now);
  assert.equal(sleep.formatTime(sleepTime), '00:05');
  assert.deepEqual(options.map((o) => o.cycles), [3, 4, 5, 6]);
  assert.deepEqual(options.map((o) => o.time), ['04:35', '06:05', '07:35', '09:05']);
  assert.ok(options.every((o) => o.label === '明天'));
  assert.equal(sleep.RECOMMENDED_CYCLES, 5, '推薦 7.5 小時：使用者白天很睏，先睡夠');
});

test('現在要睡：同一天內起床就不標日期', () => {
  const { options } = sleep.calcFromNow(new Date(2026, 9, 6, 1, 0));
  assert.equal(options[0].time, '05:45');
  assert.equal(options[0].label, '');
});

test('指定起床時間：往回推上床時間，並標出是今天還是明天', () => {
  const now = new Date(2026, 9, 6, 22, 0);
  const { wakeDate, options } = sleep.calcFromWakeTime('07:30', now);
  assert.equal(wakeDate.getDate(), 7);
  const byCycles = Object.fromEntries(options.map((o) => [o.cycles, o]));
  assert.equal(byCycles[5].time, '23:45');
  assert.equal(byCycles[5].label, '');
  assert.equal(byCycles[4].time, '01:15');
  assert.equal(byCycles[4].label, '明天');
});

test('指定的起床時間今天已經過了，就算明天的', () => {
  const { wakeDate } = sleep.calcFromWakeTime('07:30', new Date(2026, 9, 6, 8, 0));
  assert.equal(wakeDate.getDate(), 7);
});

// ── 任務排程 ────────────────────────────────────────────────

test('預設作息：週二有運動和蔬果日，週三只有每天固定的兩項', () => {
  const tuesday = defIds('2026-10-06');
  assert.ok(tuesday.includes('supplement') && tuesday.includes('watch'));
  assert.ok(tuesday.includes('exercise_run_strength') && tuesday.includes('veggie_day'));
  assert.deepEqual(defIds('2026-10-07').sort(), ['supplement', 'watch']);
});

test('每月第一個週日才有居家檢查和旅遊規劃', () => {
  assert.ok(defIds('2026-10-04').includes('monthly_maintenance'));
  assert.ok(defIds('2026-10-04').includes('monthly_trip_planning'));
  assert.ok(!defIds('2026-10-11').includes('monthly_maintenance'));
});

test('每 N 天：從起算日開始每隔 N 天出現，起算日之前不出現', () => {
  tasks.setTaskIntervalSchedule('veggie_day', 3, '2026-11-01');
  assert.ok(defIds('2026-11-01').includes('veggie_day'));
  assert.ok(!defIds('2026-11-02').includes('veggie_day'));
  assert.ok(defIds('2026-11-04').includes('veggie_day'));
  assert.ok(!defIds('2026-10-31').includes('veggie_day'));
});

test('延後一天：原本那筆變成已延後，隔天多一筆標明從哪天延來的', () => {
  tasks.getTasksForDate('2026-12-01');
  tasks.postponeTask('2026-12-01', 'supplement', 'plus1');
  const original = tasks.getTasksForDate('2026-12-01').find((t) => t.instanceId === 'supplement');
  assert.equal(original.status, 'postponed');
  const carried = tasks.getTasksForDate('2026-12-02').find((t) => t.carriedFrom === '2026-12-01');
  assert.equal(carried.defId, 'supplement');
  assert.equal(carried.status, 'pending');
});

test('已經延後過的任務再延一次，不會把延過去那筆的完成狀態蓋掉', () => {
  const carried = tasks.getTasksForDate('2026-12-02').find((t) => t.carriedFrom === '2026-12-01');
  tasks.toggleDone('2026-12-02', carried.instanceId);
  tasks.postponeTask('2026-12-01', 'supplement', 'plus1');
  const after = tasks.getTasksForDate('2026-12-02').find((t) => t.instanceId === carried.instanceId);
  assert.equal(after.status, 'done');
});

test('延到下週：落在七天後的同一個星期幾', () => {
  tasks.getTasksForDate('2026-12-03');
  tasks.postponeTask('2026-12-03', 'watch', 'nextWeek');
  assert.ok(tasks.getTasksForDate('2026-12-10').some((t) => t.carriedFrom === '2026-12-03'));
});

test('跳過這週：當天標成已跳過，這週剩下幾天不再出現，下週一恢復', () => {
  tasks.getTasksForDate('2026-12-14'); // 週一
  tasks.postponeTask('2026-12-14', 'supplement', 'skipWeek');
  assert.equal(tasks.getTasksForDate('2026-12-14').find((t) => t.defId === 'supplement').status, 'skipped');
  assert.ok(!defIds('2026-12-16').includes('supplement'));
  assert.ok(!defIds('2026-12-20').includes('supplement')); // 週日還在這週
  assert.ok(defIds('2026-12-21').includes('supplement'));
});

test('只跳過今天：不影響之後幾天', () => {
  tasks.getTasksForDate('2026-12-22');
  tasks.skipTask('2026-12-22', 'watch');
  assert.equal(tasks.getTasksForDate('2026-12-22').find((t) => t.defId === 'watch').status, 'skipped');
  assert.ok(defIds('2026-12-23').includes('watch'));
});

test('自訂作息：新增後排到指定星期，刪掉之後不再出現', () => {
  const defId = tasks.addCustomTask('背單字');
  assert.equal(tasks.getTaskDef(defId).label, '背單字');
  assert.ok(tasks.getConfigurableTaskIds().includes(defId));
  tasks.setTaskWeekdaySchedule(defId, [5]);
  assert.ok(defIds('2027-01-01').includes(defId)); // 週五
  assert.ok(!defIds('2027-01-02').includes(defId));
  tasks.removeRoutineTask(defId);
  assert.ok(!tasks.getConfigurableTaskIds().includes(defId));
  assert.ok(!defIds('2027-01-08').includes(defId));
});

test('刪掉內建作息項目後可以還原', () => {
  tasks.removeRoutineTask('laundry_shopping');
  assert.ok(!tasks.getConfigurableTaskIds().includes('laundry_shopping'));
  assert.ok(tasks.hasRemovedDefaultTasks());
  tasks.restoreDefaultTasks();
  assert.ok(tasks.getConfigurableTaskIds().includes('laundry_shopping'));
});

test('空白名稱不能新增成作息項目', () => {
  assert.equal(tasks.addCustomTask('   '), null);
});

test('日期工具：加天數會正確跨月、跨年，星期幾算得對', () => {
  assert.equal(tasks.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(tasks.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(tasks.addDays('2027-03-01', -1), '2027-02-28');
  assert.equal(tasks.getWeekday('2026-10-06'), 2);
});

// ── 追劇／讀書每日份量 ──────────────────────────────────────

test('每日份量 = 剩餘量 ÷ 剩餘天數（含今天），無條件進位', () => {
  const item = { totalUnits: 16, completedUnits: 0, startDate: localDateStr(0), targetDate: localDateStr(7) };
  const p = media.computeProgress(item);
  assert.equal(p.todayQuota, 2); // 16 集 ÷ 8 天
  assert.equal(p.isFallingBehind, false);
});

test('進度落後：需要的份量超過原本平均的 1.5 倍時會提醒', () => {
  const item = { totalUnits: 20, completedUnits: 0, startDate: localDateStr(-9), targetDate: localDateStr(0) };
  const p = media.computeProgress(item);
  assert.equal(p.originalAverage, 2);
  assert.equal(p.todayQuota, 20);
  assert.equal(p.isFallingBehind, true);
});

test('看完了：今天份量是 0，狀態是已完成', () => {
  const p = media.computeProgress({ totalUnits: 10, completedUnits: 10, startDate: localDateStr(-3), targetDate: localDateStr(3) });
  assert.equal(p.todayQuota, 0);
  assert.equal(p.isDone, true);
});

test('過了目標日還沒看完：標成已逾期，剩下的全算今天', () => {
  const p = media.computeProgress({ totalUnits: 10, completedUnits: 4, startDate: localDateStr(-10), targetDate: localDateStr(-1) });
  assert.equal(p.isOverdue, true);
  assert.equal(p.todayQuota, 6);
});

// ── 倒數 ────────────────────────────────────────────────────

test('倒數：剩餘天數算對，而且越快到的排越前面', () => {
  countdown.addCountdown('明天的事', localDateStr(1));
  countdown.addCountdown('昨天的事', localDateStr(-1));
  const list = countdown.getCountdowns();
  assert.equal(list.find((c) => c.label === '明天的事').daysLeft, 1);
  assert.equal(list.find((c) => c.label === '昨天的事').daysLeft, -1);
  const days = list.map((c) => c.daysLeft);
  assert.deepEqual(days, [...days].sort((a, b) => a - b));
});

// ── 本週摘要 ────────────────────────────────────────────────

test('本週摘要：涵蓋七天、列出每天和每項任務的完成數，有填健康備註才附上', () => {
  tasks.getTasksForDate('2027-03-10');
  tasks.toggleDone('2027-03-10', 'supplement');
  const report = weekly.buildWeeklyReport('平均步數 8000', '2027-03-10');
  assert.ok(report.includes('3/4（四）') && report.includes('3/10（三）'));
  assert.ok(report.includes('- 3/10（三） 完成 1/'));
  assert.ok(report.includes('- 吃保健食品：1/7'));
  assert.ok(report.includes('平均步數 8000'));
  assert.ok(!weekly.buildWeeklyReport('', '2027-03-10').includes('健康」App 補充'));
});

test('睡眠紀錄：同一晚按兩次只留最後一次；凌晨上床算前一晚；早上醒來又睡回去；本週摘要會列出來', () => {
  const at = (d, h, m) => new Date(2027, 2, d, h, m);
  sleepLog.logSleep(at(8, 23, 30), at(9, 7, 15), 5);
  sleepLog.logSleep(at(9, 0, 40), at(9, 8, 25), 5); // 同一晚改主意，晚一點才睡
  sleepLog.logSleep(at(10, 1, 5), at(10, 8, 50), 5);
  const log = sleepLog.getSleepLog();
  assert.equal(log.length, 2);
  assert.equal(sleepLog.nightOf(log[0]), '2027-03-08', '00:40 上床算 3/8 晚上');
  assert.equal(sleepLog.clockOf(log[0].bedAt), '00:40');
  assert.equal(sleepLog.hoursOf(log[1]), 7.8);

  const { options } = sleep.calcFromNow(at(10, 1, 5));
  assert.equal(sleep.formatTime(options[1].at), options[1].time, '計算結果帶著確切的起床時刻');
  assert.ok(weekly.buildWeeklyReport('', '2027-03-10').includes('3/8（一）晚上：00:40 上床，鬧鐘設 08:25（5 個 90 分鐘週期），沒記實際起床時間，在床上 7.8 小時'));

  // 早上：上床 2 到 16 小時之間問「我起床了」
  assert.equal(sleepLog.morningState(at(10, 2, 0)), null, '剛躺下不問');
  assert.equal(sleepLog.morningState(at(10, 7, 0)).stage, 'wake');
  assert.equal(sleepLog.morningState(at(11, 9, 0)), null, '過了一整天不問');
  // 07:10 提早醒、按了起床，上個廁所 07:25 又睡回去：那次變成一次中間醒來，回到還沒起床
  sleepLog.logWake(log[1].id, at(10, 7, 10));
  assert.equal(sleepLog.morningState(at(10, 7, 20)).stage, 'questions');
  sleepLog.backToSleep(log[1].id, at(10, 7, 25));
  assert.equal(sleepLog.morningState(at(10, 7, 30)).stage, 'wake');
  // 06:00 那次是事後補記的（沒開 App）
  assert.equal(sleepLog.addWake(log[1].id, '06:00', '06:10'), true);
  assert.equal(sleepLog.addWake(log[1].id, '亂填', '06:10'), false);
  sleepLog.logWake(log[1].id, at(10, 9, 0));
  sleepLog.answerMorning(log[1].id, { wakeType: 'early', energy: '1' });
  assert.equal(sleepLog.morningState(at(10, 9, 5)).stage, 'questions', '兩題答完還在，按完成才收');
  sleepLog.answerMorning(log[1].id, { done: true });
  assert.equal(sleepLog.morningState(at(10, 9, 5)), null);
  const night = sleepLog.getSleepLog().find((e) => e.id === log[1].id);
  assert.equal(sleepLog.wakeCountOf(night), 2);
  assert.equal(sleepLog.awakeMinutesOf(night), 25);
  assert.ok(weekly.buildWeeklyReport('', '2027-03-10').includes('實際 09:00 起床（提早醒、睡不回去），起床時精神：很累，在床上 7.9 小時，中間醒來 2 次（06:00 醒來、06:10 又睡；07:10 醒來、07:25 又睡，共醒著 25 分鐘）'));
  sleepLog.removeWake(log[1].id, 0);
  assert.equal(sleepLog.wakeCountOf(sleepLog.getSleepLog().find((e) => e.id === log[1].id)), 1);

  // 事後改時間：凌晨的上床時間算那一晚的隔天
  sleepLog.editTimes(log[1].id, '00:50', '09:05');
  const edited = sleepLog.getSleepLog().find((e) => e.id === log[1].id);
  assert.equal(new Date(edited.bedAt).getDate(), 10);
  assert.equal(sleepLog.clockOf(edited.wokeAt), '09:05');

  // 按過「我起床了」之後同一晚又記一筆：前一段留著
  sleepLog.logSleep(at(10, 10, 0), at(10, 11, 30), 1);
  assert.ok(sleepLog.getSleepLog().some((e) => e.id === log[1].id), '有起床時間的那筆沒被蓋掉');
  sleepLog.getSleepLog().forEach((entry) => sleepLog.removeSleepEntry(entry.id));
  assert.ok(weekly.buildWeeklyReport('', '2027-03-10').includes('這一週沒有記錄'));
});

test('錯題本：複習答對後隔 2 天、5 天再出，第三次答對才移除；中途答錯就重來', () => {
  const q = { qid: 'thb_test', question: '測試題', options: { 1: 'a', 2: 'b', 3: 'c' }, answer: '1' };
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
  const isDue = (n) => mistakes.getDueMistakes(day(n)).some((m) => m.qid === q.qid);

  mistakes.recordMistake(q);
  assert.equal(isDue(0), true, '剛答錯，今天就要複習');

  mistakes.resolveMistake(q, day(0));
  assert.equal(isDue(1), false);
  assert.equal(isDue(2), true);

  mistakes.resolveMistake(q, day(2));
  assert.equal(isDue(6), false);
  assert.equal(isDue(7), true);

  mistakes.recordMistake(q);
  assert.equal(isDue(0), true, '又答錯：回到今天就要複習');
  mistakes.resolveMistake(q, day(0));
  mistakes.resolveMistake(q, day(2));
  mistakes.resolveMistake(q, day(7));
  assert.equal(mistakes.getMistakeCount(), 0, '連續答對三次後移除');
});

test('作息時間：可以新增、改名、刪除；舊格式（只存時間）讀得回來', () => {
  localStorage.setItem('morningBrief.fixedSchedule.v1', JSON.stringify({ shower: '22:00' }));
  assert.equal(fixed.getFixedSchedule().find((i) => i.id === 'shower').time, '22:00');

  fixed.addFixedItem('吃藥', '09:00');
  const added = fixed.getFixedSchedule().find((i) => i.label === '吃藥');
  assert.ok(added);
  fixed.updateFixedItem(added.id, { label: '吃維他命', time: '亂填' });
  const renamed = fixed.getFixedSchedule().find((i) => i.id === added.id);
  assert.equal(renamed.label, '吃維他命');
  assert.equal(renamed.time, '09:00', '不合格的時間不會被存進去');
  fixed.removeFixedItem(added.id);
  assert.equal(fixed.getFixedSchedule().some((i) => i.id === added.id), false);
});

test('提醒：挑最近的一項；凌晨的就寢時間算前一晚，所以「週一至週三」是週二到週四凌晨響', () => {
  const items = [
    { id: 'weekdayBed', label: '平日就寢', time: '01:20', days: [1, 2, 3], remind: true, lead: 0 },
    { id: 'shower', label: '洗澡', time: '23:30', remind: true },
    { id: 'off', label: '沒開', time: '12:00', remind: false },
  ];
  // 2026-10-11 是週日 20:00：最近的是當晚 23:30 洗澡
  let next = reminder.nextReminder(items, new Date(2026, 9, 11, 20, 0));
  assert.equal(next.item.id, 'shower');
  // 只看就寢：週日晚上之後，第一次響是週二（10/13）01:20，不是週一凌晨
  next = reminder.nextReminder([items[0]], new Date(2026, 9, 11, 20, 0));
  assert.equal(next.at.getDate(), 13);
  assert.equal(next.at.getHours(), 1);
  assert.equal(reminder.nextReminder([items[2]], new Date()), null);
});

test('週三晚上改成跟假日一樣：手機上已經存好的那份會被改一次，之後不再動', () => {
  const old = [
    { id: 'weekdayBed', label: '平日就寢', note: '週一至週三', time: '01:20', days: [1, 2, 3], remind: true },
    { id: 'weekendBed', label: '假日就寢', note: '週四至週日', time: '01:00', days: [4, 5, 6, 0], remind: true },
  ];
  fakeStorage.delete('chenxu.fixedSchedule.wedNightWeekend');
  localStorage.setItem('morningBrief.fixedSchedule.v1', JSON.stringify({ items: old }));
  const bed = (id) => fixed.getFixedSchedule().find((i) => i.id === id);
  assert.deepEqual(bed('weekdayBed').days, [1, 2]);
  assert.deepEqual(bed('weekendBed').days, [3, 4, 5, 6, 0]);
  // 週三晚上 23:00 看「今晚」是假日就寢
  assert.equal(fixed.getBedItem(new Date(2026, 9, 14, 23, 0)).id, 'weekendBed');
  // 明早起床看的是隔天早上：週日晚上 → 週一 08:50；週三晚上（含凌晨還沒睡）→ 週四 10:00
  const wakes = [
    { id: 'weekdayWake', label: '平日起床', time: '08:50', days: [1, 2, 3] },
    { id: 'weekendWake', label: '假日起床', time: '10:00', days: [4, 5, 6, 0] },
  ];
  localStorage.setItem('morningBrief.fixedSchedule.v1', JSON.stringify({ items: wakes }));
  assert.equal(fixed.getWakeItem(new Date(2026, 9, 11, 23, 0)).id, 'weekdayWake');
  assert.equal(fixed.getWakeItem(new Date(2026, 9, 14, 23, 0)).id, 'weekendWake');
  assert.equal(fixed.getWakeItem(new Date(2026, 9, 15, 1, 0)).id, 'weekendWake');
  // 只改一次：之後存回舊的也不會再被改
  localStorage.setItem('morningBrief.fixedSchedule.v1', JSON.stringify({ items: old }));
  assert.deepEqual(bed('weekdayBed').days, [1, 2, 3]);
  fakeStorage.delete('morningBrief.fixedSchedule.v1');
});

test('提前提醒：就寢預設提前 30 分鐘；減過午夜時星期跟著往前一天', () => {
  const bed = { id: 'weekdayBed', label: '平日就寢', time: '01:20', days: [1, 2, 3], remind: true };
  assert.deepEqual(fixed.alertOf(bed), { time: '00:50', weekdays: [2, 3, 4], body: '再 30 分鐘，01:20' });
  // 00:10 就寢、提前 30 分鐘：變成前一天 23:40，也就是回到週一到週三的晚上
  assert.deepEqual(fixed.alertOf({ ...bed, time: '00:10' }), { time: '23:40', weekdays: [1, 2, 3], body: '再 30 分鐘，00:10' });
  assert.deepEqual(fixed.alertOf({ id: 'shower', label: '洗澡', time: '23:30' }), { time: '23:30', weekdays: null, body: '23:30 到了' });
  // 每天的項目減過午夜不用管星期
  assert.equal(fixed.alertOf({ id: 'x', label: '吃藥', time: '00:05', lead: 10 }).time, '23:55');

  const next = reminder.nextReminder([bed], new Date(2026, 9, 11, 20, 0));
  assert.equal(`${next.at.getDate()} ${next.at.getHours()}:${next.at.getMinutes()}`, '13 0:50');

  fixed.updateFixedItem('shower', { lead: 15 });
  assert.equal(fixed.leadOf(fixed.getFixedSchedule().find((i) => i.id === 'shower')), 15);
  fixed.updateFixedItem('shower', { lead: 999 });
  assert.equal(fixed.leadOf(fixed.getFixedSchedule().find((i) => i.id === 'shower')), 15, '不合理的提前量不會被存進去');
  // 待辦的兩項通知一定在清單裡，預設關著
  assert.deepEqual(fixed.getFixedSchedule().filter((i) => i.kind === 'tasks').map((i) => i.remind), [false, false]);
});

test('作息改名：內建和自訂的項目都能改，空白的名稱不收', () => {
  tasks.renameRoutineTask('veggie_day', '水果日');
  assert.equal(tasks.getTaskDef('veggie_day').label, '水果日');
  tasks.renameRoutineTask('veggie_day', '   ');
  assert.equal(tasks.getTaskDef('veggie_day').label, '水果日');
  const id = tasks.addCustomTask('背單字');
  tasks.renameRoutineTask(id, '背 20 個單字');
  assert.equal(tasks.getTaskDef(id).label, '背 20 個單字');
  tasks.removeRoutineTask(id);
});

test('睡眠：指定之後才上床的時間，起床時間照那個時間推，「明天」照現在標', () => {
  const now = new Date(2026, 9, 8, 22, 0);
  const bed = new Date(2026, 9, 9, 1, 0);
  const result = sleep.calcFromNow(bed, now);
  const four = result.options.find((o) => o.cycles === 4);
  assert.equal(four.time, '07:15');
  assert.equal(four.label, '明天');
});

test('推播後端：時間到了才推，照手機的時區和星期算', () => {
  const sub = { tz: 'Asia/Shanghai', items: [{ time: '23:00', weekdays: null }, { time: '01:20', weekdays: [2, 3, 4] }] };
  // 2026-10-08 15:00 UTC = 南京 23:00（週四）
  assert.equal(push.isDue(sub, new Date(Date.UTC(2026, 9, 8, 15, 0, 20))), true);
  assert.equal(push.isDue(sub, new Date(Date.UTC(2026, 9, 8, 14, 59, 0))), false, '還沒到');
  // 排程晚了 3 分鐘才跑：照樣補推；推過的（sent）不再推；晚太久（超過 5 分鐘）就不補了
  assert.deepEqual(push.dueKeys(sub, new Date(Date.UTC(2026, 9, 8, 15, 3, 0))), ['2026-10-08 23:00']);
  assert.equal(push.isDue({ ...sub, sent: ['2026-10-08 23:00'] }, new Date(Date.UTC(2026, 9, 8, 15, 1, 0))), false);
  assert.equal(push.isDue(sub, new Date(Date.UTC(2026, 9, 8, 15, 6, 0))), false);
  // 2026-10-12 17:20 UTC = 南京週二 01:20，在清單裡；前一天（週一 01:20）不在
  assert.equal(push.isDue(sub, new Date(Date.UTC(2026, 9, 12, 17, 20))), true);
  assert.equal(push.isDue(sub, new Date(Date.UTC(2026, 9, 11, 17, 20))), false);
  assert.equal(push.isDue({ tz: '亂寫的時區', items: sub.items }, new Date()), false);
});

test('推播後端：只收真的推播服務的網址，時間格式不對的項目丟掉', () => {
  const ok = push.cleanSubscription({
    subscription: { endpoint: 'https://web.push.apple.com/abc' },
    tz: 'Asia/Taipei',
    items: [{ time: '09:00', weekdays: [1, 9, 'x'] }, { time: '9點' }],
  });
  assert.deepEqual(ok.items, [{ time: '09:00', weekdays: [1] }]);
  assert.equal(push.cleanSubscription({ subscription: { endpoint: 'https://evil.example.com/x' }, items: [] }), null);
  assert.equal(push.cleanSubscription({ subscription: { endpoint: 'http://web.push.apple.com/x' }, items: [] }), null);
  assert.equal(push.cleanSubscription({}), null);
});

test('推播後端：簽章用公鑰驗得過，而且寫明是給哪個推播服務的', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const header = await push.vapidAuthorization(jwk, 'https://web.push.apple.com/abc', 1000);
  const [, token, key] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(key, push.publicKeyOf(jwk));
  const [h, c, sig] = token.split('.');
  const decode = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
  const claims = JSON.parse(new TextDecoder().decode(decode(c)));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.exp, 1000 + 12 * 3600);
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, decode(sig), new TextEncoder().encode(`${h}.${c}`));
  assert.equal(valid, true);
});

test('推播後端：排程漏跑一分鐘也會補推，而且同一個時間只推一次', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const kv = new Map([['subs', JSON.stringify({ 'https://web.push.apple.com/abc': { tz: 'Asia/Shanghai', items: [{ time: '23:00', weekdays: null }] } })]]);
  const env = {
    VAPID_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)),
    PUSH_KV: { get: async (k) => JSON.parse(kv.get(k) || 'null'), put: async (k, v) => { kv.set(k, v); } },
  };
  let pushes = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { pushes += 1; return { ok: true, status: 201, text: async () => '' }; };
  // 23:00 那一分鐘排程沒跑；23:02 跑到了 → 補推一次。23:03 再跑 → 不重推
  await push.sendDuePushes(env, new Date(Date.UTC(2026, 9, 8, 15, 2, 0)));
  await push.sendDuePushes(env, new Date(Date.UTC(2026, 9, 8, 15, 3, 0)));
  globalThis.fetch = realFetch;
  assert.equal(pushes, 1);
  assert.deepEqual(JSON.parse(kv.get('subs'))['https://web.push.apple.com/abc'].sent, ['2026-10-08 23:00']);
});

test('推播後端：測試通知只推給已經訂閱的手機', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const kv = new Map([['subs', JSON.stringify({ 'https://web.push.apple.com/abc': { tz: 'Asia/Shanghai', items: [] } })]]);
  const env = {
    VAPID_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)),
    PUSH_KV: { get: async (k) => JSON.parse(kv.get(k) || 'null'), put: async (k, v) => { kv.set(k, v); } },
  };
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { sent.push(url); return { ok: true, status: 201 }; };
  const ok = await push.handlePushRequest({ mode: 'push-test', subscription: { endpoint: 'https://web.push.apple.com/abc' } }, env);
  const stranger = await push.handlePushRequest({ mode: 'push-test', subscription: { endpoint: 'https://web.push.apple.com/other' } }, env);
  globalThis.fetch = realFetch;
  assert.equal(ok.status, 200);
  assert.equal(stranger.status, 404);
  assert.deepEqual(sent, ['https://web.push.apple.com/abc']);
});

test('推播後端：金鑰貼進後台時頭尾少了字也讀得出來，缺欄位會講而且不洩漏內容', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const full = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
  const original = JSON.parse(full);
  for (const text of [full, full.slice(2), full.slice(2, -1)]) {
    const jwk = push.parseJwk(text);
    assert.deepEqual([jwk.d, jwk.x, jwk.y], [original.d, original.x, original.y]);
    await push.vapidAuthorization(jwk, 'https://web.push.apple.com/abc');
  }
  assert.throws(() => push.parseJwk('{"x":"abc"}'), (e) => !e.message.includes('abc'));
});

test('復原：延後的拿回來（延過去那筆消失），跳過的拿回來', () => {
  // 自己加兩項每天都有的作息，不靠「那一天剛好排了什麼」——那樣測試會隨日期時過時不過
  const ids = ['測試甲', '測試乙'].map((label) => {
    const id = tasks.addCustomTask(label);
    tasks.setTaskIntervalSchedule(id, 1, localDateStr(0));
    return id;
  });
  const day = localDateStr(40);
  const [a, b] = tasks.getTasksForDate(day).filter((t) => ids.includes(t.defId));
  assert.ok(a && b);
  tasks.postponeTask(day, a.instanceId, 'plus1');
  const moved = tasks.getTasksForDate(day).find((t) => t.instanceId === a.instanceId);
  assert.equal(moved.status, 'postponed');
  assert.equal(moved.movedTo, localDateStr(41));
  assert.equal(moved.canUndo, true);
  assert.equal(tasks.undoTaskAction(day, a.instanceId), true);
  assert.equal(tasks.getTasksForDate(day).find((t) => t.instanceId === a.instanceId).status, 'pending');
  assert.equal(tasks.getTasksForDate(localDateStr(41)).some((t) => t.carriedFrom === day && t.defId === a.defId), false);

  tasks.skipTask(day, b.instanceId);
  assert.equal(tasks.undoTaskAction(day, b.instanceId), true);
  assert.equal(tasks.getTasksForDate(day).find((t) => t.instanceId === b.instanceId).status, 'pending');  ids.forEach((id) => tasks.removeRoutineTask(id));
});

test('復原：延過去那筆已經做完就不能拿回來', () => {
  const id = tasks.addCustomTask('測試丙');
  tasks.setTaskIntervalSchedule(id, 1, localDateStr(0));
  const day = localDateStr(50);
  const a = tasks.getTasksForDate(day).find((t) => t.defId === id);
  tasks.postponeTask(day, a.instanceId, 'plus1');
  // 要連項目一起比對：別的測試可能也從同一天延了別的東西過來
  const carried = tasks.getTasksForDate(localDateStr(51)).find((t) => t.carriedFrom === day && t.defId === id);
  tasks.toggleDone(localDateStr(51), carried.instanceId);
  assert.equal(tasks.getTasksForDate(day).find((t) => t.instanceId === a.instanceId).canUndo, false);
  assert.equal(tasks.undoTaskAction(day, a.instanceId), false);
  tasks.removeRoutineTask(id);
});

test('完成數：跳過和延後的不算在應做的裡面，所以那天還是能顯示全部做完', () => {
  const list = [{ status: 'done' }, { status: 'skipped' }, { status: 'postponed' }, { status: 'pending' }];
  assert.deepEqual(tasks.summarizeTasks(list), { done: 1, total: 2, remaining: 1, setAside: 2 });
  assert.equal(tasks.summarizeTasks([{ status: 'done' }, { status: 'skipped' }]).remaining, 0);
});


test('雲端備份：開啟會上傳；換一支手機用同一組密語能還原；不會默默蓋掉對方的資料', async () => {
  const backend = await import('../../cloudflare-worker/backup.js');
  const kv = new Map();
  const env = { PUSH_KV: {
    get: async (key, type) => (kv.has(key) ? (type === 'json' ? JSON.parse(kv.get(key)) : kv.get(key)) : null),
    put: async (key, value) => { kv.set(key, value); },
  } };
  globalThis.fetch = async (url, init) => {
    const result = await backend.handleBackupRequest(JSON.parse(init.body), env);
    return { ok: result.status < 400, status: result.status, json: async () => result.payload };
  };
  const cloud = await import('../js/cloudBackup.js');
  const clearSync = () => [...fakeStorage.keys()].filter((k) => k.startsWith('chenxu.cloudBackup.')).forEach((k) => fakeStorage.delete(k));

  assert.match(await cloud.turnOnCloudBackup('太短'), /至少/);
  localStorage.setItem('morningBrief.note', 'A 手機的資料');
  assert.equal(await cloud.turnOnCloudBackup('correct horse battery'), null);
  assert.ok(cloud.getCloudBackupState().savedAt, '開啟後馬上傳一份');
  assert.ok(![...kv.values()].some((v) => v.includes('correct horse')), '後端看不到密語');
  assert.ok(![...kv.values()].some((v) => v.includes('A 手機的資料')), '後端看不到內容（加密過了）');
  const stored = () => [...kv.entries()].find(([k]) => k.startsWith('backup:'))[1];

  // 資料變了就再傳；沒變就不傳
  const before = cloud.getCloudBackupState().savedAt;
  await cloud.uploadNow();
  assert.equal(cloud.getCloudBackupState().savedAt, before);
  localStorage.setItem('morningBrief.note', 'A 手機的新資料');
  const firstUpload = stored();
  await cloud.uploadNow();
  assert.notEqual(stored(), firstUpload, '變了的內容有傳上去');
  const fromA = stored();

  // 「另一支手機」：同步狀態是空的、資料不一樣。開啟時不會自己蓋掉雲端，自動上傳也會停住
  clearSync();
  localStorage.setItem('morningBrief.note', 'B 手機的資料');
  assert.equal(await cloud.turnOnCloudBackup('correct horse battery'), null);
  assert.ok(cloud.getCloudBackupState().conflictSavedAt, '發現雲端已經有一份');
  await cloud.uploadNow();
  assert.equal(stored(), fromA, '雲端那份沒有被蓋掉');

  // 選「用雲端那一份」
  assert.equal(await cloud.restoreFromCloud(), null);
  assert.equal(localStorage.getItem('morningBrief.note'), 'A 手機的新資料');
  // 檢查雲端那一份：解得開、跟手機一樣；手機改了之後說「舊一點」，而且檢查不會動到手機的資料
  assert.match((await cloud.verifyCloudBackup()).text, /一模一樣/);
  localStorage.setItem('morningBrief.note', '還沒傳上去的改動');
  assert.match((await cloud.verifyCloudBackup()).text, /舊一點/);
  // 開著但有改動超過一天沒傳上去：設定頁要講「還沒備份」
  const realSavedAt = localStorage.getItem('chenxu.cloudBackup.savedAt');
  localStorage.setItem('chenxu.cloudBackup.savedAt', new Date(Date.now() - 2.5 * 86400000).toISOString());
  assert.equal(cloud.getCloudBackupState().staleDays, 2);
  localStorage.setItem('chenxu.cloudBackup.savedAt', realSavedAt);
  assert.equal(cloud.getCloudBackupState().staleDays, 0, '一天內不算');
  assert.equal(localStorage.getItem('morningBrief.note'), '還沒傳上去的改動');
  localStorage.setItem('morningBrief.note', 'A 手機的新資料');

  // 雲端那份壞掉（解不開）時，手機上的資料不能被清掉
  const [kvKey, kvValue] = [...kv.entries()].find(([k]) => k.startsWith('backup:'));
  const broken = JSON.parse(kvValue);
  broken.data['morningBrief.encrypted.v1'] = broken.data['morningBrief.encrypted.v1'].slice(0, -8) + 'AAAAAAA=';
  kv.set(kvKey, JSON.stringify(broken));
  assert.match(await cloud.restoreFromCloud(), /解不開/);
  assert.equal(localStorage.getItem('morningBrief.note'), 'A 手機的新資料');

  // 加密功能出來之前開啟的手機（沒有鑰匙）：不上傳沒加密的內容，設定頁會提示
  fakeStorage.delete('chenxu.cloudBackup.key');
  assert.equal(cloud.getCloudBackupState().unencrypted, true);
  assert.match(await cloud.restoreFromCloud(), /加密的/);
  const beforeLegacy = JSON.stringify([...kv.entries()]);
  localStorage.setItem('morningBrief.note', '沒有鑰匙時改的');
  await cloud.uploadNow({ force: true });
  assert.equal(JSON.stringify([...kv.entries()]), beforeLegacy, '沒有鑰匙就什麼都不傳');
  assert.ok(cloud.getCloudBackupState().error);
  localStorage.setItem('morningBrief.note', 'A 手機的新資料');

  // 密語不對拿不到別人的資料
  clearSync();
  cloud.turnOffCloudBackup();
  assert.equal((await backend.handleBackupRequest({ mode: 'backup-get', token: 'a'.repeat(64) }, env)).payload.exists, false);
  assert.equal((await backend.handleBackupRequest({ mode: 'backup-get', token: '不是雜湊' }, env)).status, 400);
  fakeStorage.delete('morningBrief.note');
});

test('任務操作回傳有沒有真的改到；做完的不能標成不做；讀不出來的資料會另外留一份', async () => {
  const day = '2027-05-03';
  const id = tasks.addCustomTask('回傳值測試');
  tasks.setTaskWeekdaySchedule(id, [0, 1, 2, 3, 4, 5, 6]);
  const find = () => tasks.getTasksForDate(day).find((t) => t.defId === id);

  assert.equal(tasks.toggleDone(day, '沒有這一項'), false);
  assert.equal(tasks.toggleDone(day, find().instanceId), true);
  assert.equal(tasks.skipTask(day, find().instanceId), false, '做完的不能標成不做');
  assert.equal(tasks.postponeTask(day, find().instanceId, 'plus1'), false, '做完的不能延後');
  assert.equal(find().status, 'done');
  assert.equal(tasks.toggleDone(day, find().instanceId), true);
  assert.equal(tasks.postponeTask(day, find().instanceId, '亂填'), false);
  assert.equal(tasks.skipTask(day, find().instanceId), true);
  assert.equal(tasks.toggleDone(day, find().instanceId), false, '不做的要先復原才能打勾');
  tasks.removeRoutineTask(id);

  const backup = await import('../js/backup.js');
  assert.equal(backup.applyBackupData({}), false);
  assert.equal(backup.applyBackupData({ 'other.key': 'x' }), false);
  assert.equal(backup.applyBackupData({ 'morningBrief.a': '{"ok":1}', 'morningBrief.b': '{壞掉的' }), false, '有一筆壞掉就整份不用');
  assert.ok(localStorage.getItem('morningBrief.taskEngine.v1'), '空的備份不會清掉手機上的資料');

  // 任務資料壞掉時：重新載入的模組會用空白狀態，但原本那份要留著
  const good = localStorage.getItem('morningBrief.taskEngine.v1');
  localStorage.setItem('morningBrief.taskEngine.v1', '{壞掉的');
  await import('../js/taskEngine.js?reload-broken');
  assert.equal(localStorage.getItem('morningBrief.taskEngine.v1.unreadable'), '{壞掉的');
  localStorage.setItem('morningBrief.taskEngine.v1', good);
  fakeStorage.delete('morningBrief.taskEngine.v1.unreadable');
});

test('手機空間滿了：存不進去的改動會退回、回報失敗；還原寫到一半失敗會放回原本的資料', async () => {
  const backup = await import('../js/backup.js');
  const media = await import('../js/mediaTracker.js');
  const realSet = localStorage.setItem;
  const day = '2027-06-02';
  const id = tasks.addCustomTask('空間測試');
  tasks.setTaskWeekdaySchedule(id, [0, 1, 2, 3, 4, 5, 6]);
  const find = () => tasks.getTasksForDate(day).find((t) => t.defId === id);
  const instance = find().instanceId;

  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(tasks.toggleDone(day, instance), false, '存不進去就不能說做好了');
  assert.equal(media.addMediaItem('存不進去的劇', 'drama', 10, '2027-07-01'), false);
  localStorage.setItem = realSet;
  assert.equal(find().status, 'pending', '畫面退回改之前的樣子');
  assert.ok(!media.getMediaItems().some((m) => m.title === '存不進去的劇'));
  tasks.removeRoutineTask(id);

  // 還原：寫到第二筆就失敗 → 手機上原本的資料原封不動
  localStorage.setItem('morningBrief.keepA', '{"a":1}');
  const original = JSON.stringify(backup.collectBackupData());
  let writes = 0;
  localStorage.setItem = (k, v) => { if (++writes === 2) throw new Error('QuotaExceededError'); realSet(k, v); };
  assert.equal(backup.applyBackupData({ 'morningBrief.x': '{"x":1}', 'morningBrief.y': '{"y":2}', 'morningBrief.z': '{"z":3}' }), false);
  localStorage.setItem = realSet;
  assert.equal(JSON.stringify(backup.collectBackupData()), original);
  fakeStorage.delete('morningBrief.keepA');
});

test('AI 的動作照實際結果回報：找不到、數字不合理就不算做好', async () => {
  const media = await import('../js/mediaTracker.js');
  assert.equal(media.logProgress('不存在的', 3), false);
  assert.equal(media.postponeTarget('不存在的', 3), false);
  assert.equal(media.removeMediaItem('不存在的'), false);
  assert.equal(media.addMediaItem('日期亂填', 'drama', 10, '下週'), false);
  assert.equal(media.addMediaItem('負數', 'drama', -1, '2027-07-01'), false);
  assert.equal(media.addMediaItem('正常的', 'drama', 10, '2027-07-01'), true);
  const item = media.getMediaItems().find((m) => m.title === '正常的');
  assert.equal(media.logProgress(item.id, -2), false);
  assert.equal(media.postponeTarget(item.id, 0), false);
  assert.equal(media.logProgress(item.id, 2), true);
  assert.equal(media.removeMediaItem(item.id), true);
  assert.equal(countdown.addCountdown('沒日期', ''), false);
  assert.equal(countdown.removeCountdown('不存在的'), false);
  assert.equal(tasks.setTaskIntervalSchedule('不存在的', 3), false);
  assert.equal(tasks.setTaskWeekdaySchedule('不存在的', [1]), false);
});

test('連續新增：同一瞬間加的幾項不會撞到同一個編號', () => {
  const ids = [1, 2, 3, 4, 5].map((n) => tasks.addCustomTask(`連加 ${n}`));
  assert.equal(new Set(ids).size, 5);
  ids.forEach((id) => tasks.removeRoutineTask(id));
  const before = countdown.getCountdowns().length;
  [1, 2, 3].forEach((n) => countdown.addCountdown(`連加 ${n}`, localDateStr(10 + n)));
  const added = countdown.getCountdowns().filter((c) => c.label.startsWith('連加'));
  assert.equal(added.length, 3);
  assert.equal(new Set(added.map((c) => c.id)).size, 3);
  added.forEach((c) => countdown.removeCountdown(c.id));
  assert.equal(countdown.getCountdowns().length, before);
});
