export type Theme = 'warm' | 'white' | 'green' | 'dark' | 'violet' | 'neon';

export const THEMES: { id: Theme; label: string; desc: string; accent: string; bg: string }[] = [
  { id: 'warm',   label: '奶油橙', desc: '默认',  accent: 'oklch(60% 0.155 40)',  bg: 'oklch(96% 0.014 83)' },
  { id: 'white',  label: '皇家蓝', desc: '沉静',  accent: 'oklch(47% 0.15 264)',  bg: 'oklch(96% 0.012 85)' },
  { id: 'green',  label: '森林绿', desc: '',      accent: 'oklch(47% 0.125 152)', bg: 'oklch(96% 0.013 130)' },
  { id: 'dark',   label: '炭墨',  desc: '深色',  accent: 'oklch(70% 0.13 48)',    bg: 'oklch(19% 0.008 65)' },
  { id: 'violet', label: '午夜蓝', desc: '深蓝',  accent: 'oklch(83% 0.085 80)',  bg: 'oklch(26% 0.055 264)' },
  { id: 'neon',   label: '霓虹绿', desc: '暗黑',  accent: 'oklch(92% 0.27 124)',  bg: 'oklch(11% 0.012 135)' },
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
