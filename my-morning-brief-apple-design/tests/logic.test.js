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
    { id: 'weekdayBed', label: '平日就寢', time: '01:20', days: [1, 2, 3], remind: true },
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
  assert.equal(push.isDue(sub, new Date(Date.UTC(2026, 9, 8, 15, 1, 0))), false);
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
  const day = localDateStr(40);
  const [a, b] = tasks.getTasksForDate(day);
  assert.ok(a && b, '這一天至少要有兩項固定作息');
  tasks.postponeTask(day, a.instanceId, 'plus1');
  const moved = tasks.getTasksForDate(day).find((t) => t.instanceId === a.instanceId);
  assert.equal(moved.status, 'postponed');
  assert.equal(moved.movedTo, localDateStr(41));
  assert.equal(moved.canUndo, true);
  assert.equal(tasks.undoTaskAction(day, a.instanceId), true);
  assert.equal(tasks.getTasksForDate(day).find((t) => t.instanceId === a.instanceId).status, 'pending');
  assert.equal(tasks.getTasksForDate(localDateStr(41)).some((t) => t.carriedFrom === day), false);

  tasks.skipTask(day, b.instanceId);
  assert.equal(tasks.undoTaskAction(day, b.instanceId), true);
  assert.equal(tasks.getTasksForDate(day).find((t) => t.instanceId === b.instanceId).status, 'pending');
});

test('復原：延過去那筆已經做完就不能拿回來', () => {
  const day = localDateStr(50);
  const [a] = tasks.getTasksForDate(day);
  tasks.postponeTask(day, a.instanceId, 'plus1');
  const carried = tasks.getTasksForDate(localDateStr(51)).find((t) => t.carriedFrom === day);
  tasks.toggleDone(localDateStr(51), carried.instanceId);
  assert.equal(tasks.getTasksForDate(day).find((t) => t.instanceId === a.instanceId).canUndo, false);
  assert.equal(tasks.undoTaskAction(day, a.instanceId), false);
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

  // 資料變了就再傳；沒變就不傳
  const before = cloud.getCloudBackupState().savedAt;
  await cloud.uploadNow();
  assert.equal(cloud.getCloudBackupState().savedAt, before);
  localStorage.setItem('morningBrief.note', 'A 手機的新資料');
  await new Promise((r) => setTimeout(r, 5));
  await cloud.uploadNow();
  assert.notEqual(cloud.getCloudBackupState().savedAt, before);

  // 「另一支手機」：同步狀態是空的、資料不一樣。開啟時不會自己蓋掉雲端，自動上傳也會停住
  clearSync();
  localStorage.setItem('morningBrief.note', 'B 手機的資料');
  assert.equal(await cloud.turnOnCloudBackup('correct horse battery'), null);
  assert.ok(cloud.getCloudBackupState().conflictSavedAt, '發現雲端已經有一份');
  await cloud.uploadNow();
  assert.ok([...kv.values()].some((v) => v.includes('A 手機的新資料')), '雲端那份沒有被蓋掉');

  // 選「用雲端那一份」
  assert.equal(await cloud.restoreFromCloud(), null);
  assert.equal(localStorage.getItem('morningBrief.note'), 'A 手機的新資料');

  // 密語不對拿不到別人的資料
  clearSync();
  cloud.turnOffCloudBackup();
  assert.equal((await backend.handleBackupRequest({ mode: 'backup-get', token: 'a'.repeat(64) }, env)).payload.exists, false);
  assert.equal((await backend.handleBackupRequest({ mode: 'backup-get', token: '不是雜湊' }, env)).status, 400);
  fakeStorage.delete('morningBrief.note');
});
