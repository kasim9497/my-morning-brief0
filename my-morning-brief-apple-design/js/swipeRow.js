/**
 * 清單列「向左滑露出刪除鈕」的手勢
 *
 * 用法：列的結構是
 *   <div class="swipe-row">
 *     <button class="swipe-delete">刪除</button>
 *     <div class="swipe-content">…列的內容…</div>
 *   </div>
 * 在外層容器呼叫一次 enableSwipeRows(container)。容器裡的列之後整批重畫也沒關係，
 * 事件是掛在容器上的。
 *
 * 只處理左右滑；上下捲動交還給瀏覽器（.swipe-content 的 touch-action: pan-y）。
 */

const OPEN_X = -88; // 刪除鈕的寬度

function settle(el, open) {
  el.classList.toggle('is-open', open);
  el.style.transform = open ? `translateX(${OPEN_X}px)` : '';
}

export function enableSwipeRows(root) {
  if (root.dataset.swipeEnabled) return;
  root.dataset.swipeEnabled = '1';

  let active = null;

  root.addEventListener('pointerdown', (e) => {
    // 按的是刪除鈕：不要收回這一列。收回去刪除鈕會馬上隱藏，手指放開時就點不到了
    if (e.target.closest('.swipe-delete')) return;
    const content = e.target.closest('.swipe-content');
    // 點別的地方時，把其他已經滑開的列收回去
    root.querySelectorAll('.swipe-content.is-open').forEach((el) => {
      if (el !== content) settle(el, false);
    });
    if (!content) return;
    active = {
      el: content,
      startX: e.clientX,
      startY: e.clientY,
      baseX: content.classList.contains('is-open') ? OPEN_X : 0,
      dragging: false,
    };
  });

  root.addEventListener('pointermove', (e) => {
    if (!active) return;
    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;
    if (!active.dragging) {
      // 手指明顯是橫向移動才算開始滑，避免上下捲動時誤觸
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
      active.dragging = true;
      active.el.classList.add('is-dragging');
    }
    const x = Math.max(OPEN_X, Math.min(0, active.baseX + dx));
    active.el.style.transform = `translateX(${x}px)`;
  });

  const end = (e) => {
    if (!active) return;
    const { el, startX, baseX, dragging } = active;
    active = null;
    if (!dragging) return;
    el.classList.remove('is-dragging');
    const x = baseX + (e.clientX - startX);
    settle(el, e.type !== 'pointercancel' && x < OPEN_X / 2);

    // 滑完放開時瀏覽器還會送一次 click，不要讓它點到列裡面的按鈕
    const swallow = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    root.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => root.removeEventListener('click', swallow, { capture: true }), 80);
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
}
