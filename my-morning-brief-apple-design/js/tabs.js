/**
 * 底部 Tab 切換邏輯
 * 職責：切換 .view.active 與 .tab-item.active
 * 不處理各 view 內部渲染（各自負責，之後再加）
 */

const TABS = ['today', 'calendar', 'countdown', 'settings'];
let currentTab = 'today';

export function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-item');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.view;
      if (!TABS.includes(target)) return;
      switchTab(target);
    });
  });

  const saved = localStorage.getItem('currentTab');
  if (saved && TABS.includes(saved)) {
    switchTab(saved);
  }
}

export function switchTab(tabName) {
  if (!TABS.includes(tabName)) return;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById(`view-${tabName}`);
  if (targetView) targetView.classList.add('active');

  document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
  const targetBtn = document.querySelector(`.tab-item[data-view="${tabName}"]`);
  if (targetBtn) targetBtn.classList.add('active');

  currentTab = tabName;
  localStorage.setItem('currentTab', tabName);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function getCurrentTab() {
  return currentTab;
}
