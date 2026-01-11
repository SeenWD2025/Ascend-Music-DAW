/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // DAW-specific color palette
        daw: {
          bg: {
            primary: '#1a1a2e',
            secondary: '#16213e',
            tertiary: '#0f0f1a',
          },
          accent: {
            primary: '#6366f1',
            secondary: '#8b5cf6',
            success: '#22c55e',
            warning: '#f59e0b',
            error: '#ef4444',
          },
          text: {
            primary: '#f8fafc',
            secondary: '#94a3b8',
            muted: '#64748b',
          },
          border: {
            primary: '#334155',
            secondary: '#1e293b',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
