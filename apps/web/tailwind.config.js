/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Notion 主色
        notion: {
          text: 'rgba(0, 0, 0, 0.95)',
          'text-secondary': '#615d59',
          'text-muted': '#a39e98',
          bg: '#ffffff',
          'bg-alt': '#f6f5f4',
          'bg-dark': '#31302e',
          blue: '#0075de',
          'blue-hover': '#005bab',
          'blue-soft': '#f2f9ff',
          'blue-text': '#097fe8',
          warning: '#dd5b00',
          success: '#1aae39',
          border: 'rgba(0, 0, 0, 0.1)',
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
        card: 'rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px',
        deep: 'rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px',
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
        'tight-display': '-0.0332em', // -2.125px / 64px
        'tight-section': '-0.0234em', // -1.5px / 64px
      },
    },
  },
  plugins: [],
};