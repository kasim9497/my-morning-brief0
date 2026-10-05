/**
 * 錯題本：把機車筆試答錯的題目存起來，之後可以單獨拿出來複習
 * 資料存 localStorage（key 用 morningBrief. 開頭，會被設定頁的備份涵蓋）
 * 每天的題目 id 是當天重編的（q_1、q_2…），不能拿來認題目，所以用「題目文字」當 key
 */

const STORAGE_KEY = 'morningBrief.quizMistakes.v1';

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** 答錯時呼叫：第一次會存下整題，之後再錯只累加次數 */
export function recordMistake(q) {
  const store = loadStore();
  const existing = store[q.question];
  store[q.question] = {
    question: q.question,
    options: q.options,
    answer: q.answer,
    category: q.category,
    explanation: q.explanation,
    source: q.source,
    source_url: q.source_url,
    updated_at: q.updated_at,
    wrongCount: (existing ? existing.wrongCount : 0) + 1,
    lastWrongAt: new Date().toISOString(),
  };
  saveStore(store);
}

/** 複習時答對了：從錯題本移除 */
export function resolveMistake(questionText) {
  const store = loadStore();
  delete store[questionText];
  saveStore(store);
}

/** 最近答錯的排前面 */
export function getMistakes() {
  return Object.values(loadStore()).sort((a, b) => (a.lastWrongAt < b.lastWrongAt ? 1 : -1));
}

export function getMistakeCount() {
  return Object.keys(loadStore()).length;
}
