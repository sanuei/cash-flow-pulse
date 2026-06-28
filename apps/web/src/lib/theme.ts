export type Theme = 'warm' | 'white' | 'green' | 'dark' | 'violet';

export const THEMES: { id: Theme; label: string; desc: string; accent: string; bg: string }[] = [
  { id: 'warm',   label: '暖橙',  desc: '默认',  accent: 'oklch(64% 0.165 42)',   bg: 'oklch(97.5% 0.012 75)' },
  { id: 'white',  label: '纯白',  desc: '苹果风', accent: 'oklch(55% 0.22 264)',  bg: 'oklch(99.5% 0.002 260)' },
  { id: 'green',  label: '森林绿', desc: '',      accent: 'oklch(52% 0.145 152)', bg: 'oklch(97.5% 0.014 148)' },
  { id: 'dark',   label: '炭墨',  desc: '深色',  accent: 'oklch(72% 0.155 48)',   bg: 'oklch(16% 0.008 60)' },
  { id: 'violet', label: '紫罗兰', desc: '',      accent: 'oklch(58% 0.22 290)',  bg: 'oklch(97.5% 0.012 290)' },
];

const KEY = 'cfp-theme';

export function getStoredTheme(): Theme {
  try {
    return (localStorage.getItem(KEY) as Theme) ?? 'warm';
  } catch {
    return 'warm';
  }
}

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* noop */ }
  applyTheme(t);
}
