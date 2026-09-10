/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#FBFAF6',
        surface: '#FFFFFF',
        'surface-muted': '#F1EEE7',
        border: '#E7E4DA',
        ink: '#151412',
        muted: '#73706C',
        faint: '#A8A59C',
        dark: '#151412',
        'dark-raised': '#2E2E2D',
        amber: '#EB9A30',
        green: '#0CAE73',
        blue: '#1868FB',
      },
    },
  },
  plugins: [],
};