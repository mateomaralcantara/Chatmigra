/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      './index.html',
      './**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
      extend: {
        fontFamily: {
          sans: ['Inter', 'system-ui', 'sans-serif'],
        },
        colors: {
          brand: {
            50: '#eff6ff',
            100: '#dbeafe',
            500: '#2563eb',
            600: '#1d4ed8',
            900: '#020617',
          },
        },
        borderRadius: {
          xl: '1rem',
          '2xl': '1.5rem',
        },
        boxShadow: {
          subtle: '0 18px 45px rgba(15,23,42,0.35)',
        },
      },
    },
    plugins: [],
  };
  