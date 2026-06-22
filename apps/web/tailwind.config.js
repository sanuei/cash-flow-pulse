/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // 跟随系统深色模式（prefers-color-scheme: dark）
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Notion 主色 — 通过 CSS 变量实现深色适配
        notion: {
          text:             'var(--c-text)',
          'text-secondary': 'var(--c-text-secondary)',
          'text-muted':     'var(--c-text-muted)',
          bg:               'var(--c-bg)',
          'bg-alt':         'var(--c-bg-alt)',
          'bg-dark':        'var(--c-bg-dark)',
          blue:             'var(--c-blue)',
          'blue-hover':     'var(--c-blue-hover)',
          'blue-soft':      'var(--c-blue-soft)',
          'blue-text':      'var(--c-blue-text)',
          warning:          'var(--c-warning)',
          success:          'var(--c-success)',
          border:           'var(--c-border)',
        },
      },
      borderRadius: {
        micro: '4px',
        subtle: '5px',
        standard: '8px',
        comfortable: '12px',
        large: '16px',
        pill: '9999px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        deep: 'var(--shadow-deep)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'system-ui',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      letterSpacing: {
        'tight-display': '-0.0332em',
        'tight-section': '-0.0234em',
      },
    },
  },
  plugins: [],
};
