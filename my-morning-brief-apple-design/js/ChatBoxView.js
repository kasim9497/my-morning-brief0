/**
 * AI 助理聊天框：畫面渲染層
 * 資料/邏輯都在 chatBox.js，這裡只負責畫面跟事件綁定
 */

import { sendChatMessage, getConversationHistory } from './chatBox.js';

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 點了會填進輸入框（不會直接送出），可以改完再送
const EXAMPLES = ['把今天的運動延到明天', '這週還有哪些沒做完？', '新增倒數：期末考 2027-01-10'];

function renderMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const history = getConversationHistory();
  if (history.length === 0) {
    container.innerHTML = `<div class="chat-empty">
        可以幫你延後今天的任務、調整每週安排、新增倒數、記錄追劇和讀書進度。點一句試試：
        <div class="chat-examples">${EXAMPLES.map((text) => `<button type="button" class="section-action" data-example="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join('')}</div>
      </div>`;
    container.querySelectorAll('[data-example]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('chat-input');
        if (!input) return;
        input.value = btn.dataset.example;
        input.focus();
      });
    });
    return;
  }

  container.innerHTML = history
    .map((m) => `<div class="chat-bubble chat-bubble-${m.role}">${escapeHtml(m.content)}</div>`)
    .join('');
  container.scrollTop = container.scrollHeight;
}

export function initChatBox() {
  renderMessages();

  const form = document.getElementById('chat-input-form');
  const input = document.getElementById('chat-input');
  if (!form || !input) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const sendBtn = form.querySelector('.chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    const container = document.getElementById('chat-messages');
    if (container) {
      const emptyState = container.querySelector('.chat-empty');
      if (emptyState) emptyState.remove();
      container.insertAdjacentHTML(
        'beforeend',
        `<div class="chat-bubble chat-bubble-user">${escapeHtml(text)}</div><div class="chat-bubble chat-bubble-assistant chat-bubble-loading" id="chat-loading-bubble">思考中…</div>`
      );
      container.scrollTop = container.scrollHeight;
    }

    await sendChatMessage(text);
    renderMessages();

    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  });
}
