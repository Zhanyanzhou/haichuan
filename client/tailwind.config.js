/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 品牌色系
        'brand': {
          'bg':      '#F5F2ED',
          'surface': '#FFFFFF',
          'text':    '#1A1A1A',
          'muted':   '#8A7F72',
          'gold':    '#B8944E',
          'goldL':   '#D4C5A2',
          'goldD':   '#9A7B3E',
          'line':    'rgba(0,0,0,0.06)',
          'lineA':   'rgba(0,0,0,0.12)',
        },
        // 语义色
        'semantic': {
          'success': '#52C41A',
          'warning': '#FAAD14',
          'error':   '#FF4D4F',
          'info':    '#1677FF',
        },
      },
      fontFamily: {
        'display': ['"Cormorant Garamond"', 'Georgia', 'serif'],
        'body':    ['"Noto Serif SC"', '"Source Han Serif CN"', 'serif'],
        'sans':    ['Inter', 'system-ui', 'sans-serif'],
      },
      // 字号 Token
      fontSize: {
        'xs':   ['0.75rem', { lineHeight: '1rem' }],
        'sm':   ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg':   ['1.125rem', { lineHeight: '1.75rem' }],
        'xl':   ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl':  ['1.5rem', { lineHeight: '2rem' }],
        '3xl':  ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl':  ['2.25rem', { lineHeight: '2.5rem' }],
      },
      // 间距 Token
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      // 圆角 Token — 仅用于按钮/输入框/弹窗等交互控件，页面大容器统一使用直角
      borderRadius: {
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
      },
      // 阴影 Token
      boxShadow: {
        'card': '0 2px 8px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.1)',
        'modal': '0 8px 32px rgba(0,0,0,0.12)',
        'gold': '0 2px 12px rgba(184,148,78,0.3)',
      },
      // 动画
      animation: {
        'fade-in':     'fadeIn 1.5s ease-out forwards',
        'slide-up':    'slideUp 0.5s ease-out forwards',
        'cart-bounce': 'cartBounce 0.4s ease-out',
        'skeleton':    'skeleton 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(40px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        cartBounce: {
          '0%, 100%': { transform: 'scale(1)' },
          '30%': { transform: 'scale(1.3)' },
          '60%': { transform: 'scale(0.9)' },
        },
        skeleton: {
          '0%':   { backgroundPosition: '-200px 0' },
          '100%': { backgroundPosition: 'calc(200px + 100%) 0' },
        },
      },
    },
  },
  plugins: [],
};
