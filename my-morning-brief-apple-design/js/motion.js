/**
 * 左右切換時的滑入動畫（分頁、週曆上下週、題庫上下題共用）
 * direction > 0：往後切，新內容從右邊滑進來；direction < 0：往前切，從左邊滑進來
 * 樣式在 styles.css 的 .slide-in-left／.slide-in-right；使用者開了「減少動態效果」時不會動
 */
export function slideIn(el, direction) {
  if (!el || !direction) return;
  el.classList.remove('slide-in-left', 'slide-in-right');
  void el.offsetWidth; // 強制重排，連續切換時動畫才會重新播放
  el.classList.add(direction < 0 ? 'slide-in-left' : 'slide-in-right');
}
