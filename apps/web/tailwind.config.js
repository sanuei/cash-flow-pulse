/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // v2 设计系统 — 通过 CSS 变量实现深色适配
        notion: {
          text:             'var(--c-text)',
          'text-secondary': 'var(--c-text-secondary)',
          'text-muted':     'var(--c-text-muted)',
          bg:               'var(--c-bg)',
          'bg-alt':         'var(--c-bg-alt)',
          'bg-elev':        'var(--c-bg-elev)',
          'bg-dark':        'var(--c-bg-dark)',
          blue:             'var(--c-accent)',         // 兼容旧名（实际是墨红）
          'blue-hover':     'var(--c-accent-hover)',
          'blue-soft':      'var(--c-accent-soft)',
          'blue-text':      'var(--c-accent-text)',
          warning:          'var(--c-warning)',
          success:          'var(--c-success)',
          border:           'var(--c-border)',
          'border-strong':  'var(--c-border-strong)',
        },
        // v2 新增 — 显式命名
        accent: {
          DEFAULT: 'var(--c-accent)',
          hover:   'var(--c-accent-hover)',
          soft:    'var(--c-accent-soft)',
          text:    'var(--c-accent-text)',
        },
      },
      fontFamily: {
        sans:    ['Inter', '-apple-system', 'system-ui', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        display: ['Fraunces', 'Iowan Old Style', 'Charter', 'Georgia', 'serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        DEFAULT: '8px',
        md: '10px',
        lg: '14px',
        xl: '20px',
        '2xl': '28px',
        pill: '9999px',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        card: 'var(--shadow-sm)',
        deep: 'var(--shadow-lg)',
      },
      letterSpacing: {
        'tight-display': '-0.025em',
        'tight-section': '-0.015em',
        'caps':          '0.08em',
        'wide':          '0.02em',
      },
      transitionDuration: {
        '80':  '80ms',
        '160': '160ms',
        '220': '220ms',
        '320': '320ms',
        '480': '480ms',
        '640': '640ms',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-quart':'cubic-bezier(0.25, 1, 0.5, 1)',
      },
      animation: {
        'fade-up':  'fade-up 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in':  'fade-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-up': 'slide-up 480ms cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer:    'shimmer 1.4s linear infinite',
        'pulse-ring':'pulse-ring 1.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};
