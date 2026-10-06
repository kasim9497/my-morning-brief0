/**
 * 任務類型的圖示：彩色圓角方塊裡一個白色線條圖示（跟 iPhone「設定」裡每一列前面的圖示同一種做法）
 * 取代原本的表情符號。圖示的 key 和顏色定義在 taskEngine.js 的 TASK_DEFS。
 */

const PATHS = {
  pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  tv: '<rect x="2" y="7" width="20" height="13" rx="2"/><polyline points="17,2 12,7 7,2"/>',
  pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  dumbbell: '<line x1="7" y1="12" x2="17" y2="12"/><rect x="3" y="8" width="4" height="8" rx="1"/><rect x="17" y="8" width="4" height="8" rx="1"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  note: '<rect x="5" y="3" width="14" height="18" rx="2"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>',
  basket: '<path d="M5 9h14l-1.5 10h-11z"/><path d="M9 9l3-5 3 5"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  map: '<polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
  check: '<circle cx="12" cy="12" r="8"/><polyline points="8.5,12.5 11,15 15.5,9.5"/>',
};

export function renderTaskIcon(icon, tint) {
  const paths = PATHS[icon] || PATHS.check;
  return `<span class="task-glyph tint-${tint || 'blue'}"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
}
