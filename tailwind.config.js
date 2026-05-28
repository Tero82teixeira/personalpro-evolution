/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        ink: '#06101d',
        panel: '#0d1726',
        line: '#1d2b3d',
        fitblue: '#3ab7ff',
        fitorange: '#ff8a3d',
        fitgreen: '#35e68c'
      },
      boxShadow: {
        glow: '0 0 40px rgba(58, 183, 255, 0.18)'
      }
    }
  },
  plugins: []
};
