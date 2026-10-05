/**
 * 外觀：自動（跟系統）／淺色／深色
 * 顏色本身在 styles.css 的 :root 變數；這裡只負責在 <html> 上放 data-theme，
 * 以及讓瀏覽器狀態列的顏色（theme-color）跟著走。
 * index.html 的 <head> 另有一小段行內 script 在畫面出現前先套用，避免閃一下錯的顏色。
 */

const STORAGE_KEY = 'morningBrief.theme';
const BAR_COLOR = { light: '#f2f2f7', dark: '#000000' };

export function getThemePref() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'auto';
}

export function setThemePref(pref) {
  if (pref === 'light' || pref === 'dark') {
    localStorage.setItem(STORAGE_KEY, pref);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  applyTheme();
}

export function applyTheme() {
  const pref = getThemePref();
  if (pref === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.dataset.theme = pref;
  }

  // 兩個 theme-color 分別對應系統的淺色／深色；手動指定時兩個都填同一個顏色
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const scheme = pref === 'auto' ? meta.dataset.scheme : pref;
    meta.setAttribute('content', BAR_COLOR[scheme]);
  });
}
