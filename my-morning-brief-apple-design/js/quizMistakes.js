/**
 * 錯題本：把機車筆試答錯的題目存起來，之後可以單獨拿出來複習
 * 資料存 localStorage（key 用 morningBrief. 開頭，會被設定頁的備份涵蓋）
 * 每天的題目 id 是當天重編的（q_1、q_2…），不能拿來認題目。用題庫編號 qid 當 key；
 * 早期存進來的題目沒有 qid，退回用題目文字（看圖題的題目文字會重複，所以不能只靠文字）
 */

const STORAGE_KEY = 'morningBrief.quizMistakes.v1';

/**
 * 複習時答對後，隔幾天再出一次：第一次答對隔 2 天，第二次隔 5 天，第三次答對才移除。
 * 只答對一次就移除的話，當下記得、過幾天又忘的題目會漏掉。
 */
export const REVIEW_GAPS = [2, 5];

function dayStr(date, offsetDays = 0) {
  const d = new Date(date);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

/** 一題在錯題本裡的 key */
export function mistakeKey(q) {
  return q.qid || q.question;
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** 答錯時呼叫：第一次會存下整題，之後再錯只累加次數 */
export function recordMistake(q) {
  const store = loadStore();
  const key = mistakeKey(q);
  const existing = store[key];
  store[key] = {
    qid: q.qid,
    question: q.question,
    image: q.image,
    options: q.options,
    answer: q.answer,
    category: q.category,
    explanation: q.explanation,
    source: q.source,
    source_url: q.source_url,
    updated_at: q.updated_at,
    wrongCount: (existing ? existing.wrongCount : 0) + 1,
    lastWrongAt: new Date().toISOString(),
    // 又答錯：連續答對次數歸零，馬上可以再複習
    streak: 0,
    dueDate: dayStr(new Date()),
  };
  saveStore(store);
}

/** 複習時答對了：排到幾天後再出一次；連續答對超過 REVIEW_GAPS 的次數才移除 */
export function resolveMistake(q, now = new Date()) {
  const store = loadStore();
  const key = mistakeKey(q);
  const item = store[key];
  if (!item) return;
  const streak = (item.streak || 0) + 1;
  if (streak > REVIEW_GAPS.length) {
    delete store[key];
  } else {
    item.streak = streak;
    item.dueDate = dayStr(now, REVIEW_GAPS[streak - 1]);
  }
  saveStore(store);
}

/** 今天該複習的錯題（還沒到日子的不出）。舊資料沒有 dueDate，當作今天就該複習 */
export function getDueMistakes(now = new Date()) {
  const today = dayStr(now);
  return getMistakes().filter((m) => !m.dueDate || m.dueDate <= today);
}

/** 最近答錯的排前面 */
export function getMistakes() {
  return Object.values(loadStore()).sort((a, b) => (a.lastWrongAt < b.lastWrongAt ? 1 : -1));
}

export function getMistakeCount() {
  return Object.keys(loadStore()).length;
}
