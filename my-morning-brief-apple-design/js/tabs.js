/**
 * 底部 Tab 切換邏輯
 * 職責：切換 .view.active 與 .tab-item.active
 * 不處理各 view 內部渲染（各自負責，之後再加）
 */

import { slideIn } from './motion.js';

const TABS = ['today', 'calendar', 'countdown', 'sleep', 'settings'];
const TAB_TITLES = { today: '今日', calendar: '週曆', countdown: '倒數', sleep: '睡眠', settings: '設定' };
let currentTab = 'today';
// 「今日」頁的大標題是問候語（午安，Kasim），資料載入後由 app.js 透過 setTodayTitle 給
let todayTitle = TAB_TITLES.today;

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
    switchTab(saved, false);
  }
}

export function switchTab(tabName, animate = true) {
  if (!TABS.includes(tabName)) return;
  const direction = TABS.indexOf(tabName) - TABS.indexOf(currentTab);

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById(`view-${tabName}`);
  if (targetView) targetView.classList.add('active');
  // 照底部選單的左右順序滑入：往右邊的分頁切，新畫面就從右邊進來
  if (animate) slideIn(targetView, direction);

  document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
  const targetBtn = document.querySelector(`.tab-item[data-view="${tabName}"]`);
  if (targetBtn) targetBtn.classList.add('active');

  // 大標題和導覽列小標題是跨分頁共用的同一組元素
  document.getElementById('page-title').textContent = tabName === 'today' ? todayTitle : TAB_TITLES[tabName];
  document.getElementById('navbar-title').textContent = TAB_TITLES[tabName];
  // 日期只在「今日」頁顯示，其他頁只有大標題
  document.getElementById('header-date').hidden = tabName !== 'today';

  currentTab = tabName;
  localStorage.setItem('currentTab', tabName);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function setTodayTitle(text) {
  todayTitle = text;
  if (currentTab === 'today') document.getElementById('page-title').textContent = text;
}

export function getCurrentTab() {
  return currentTab;
}
