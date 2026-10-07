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
};

const sleep = await import('../js/sleepCalculator.js');
const tasks = await import('../js/taskEngine.js');
const media = await import('../js/mediaTracker.js');
const countdown = await import('../js/countdown.js');
const weekly = await import('../js/weeklyReport.js');

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
