/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // DevPad dark palette, tuned to sit comfortably next to the Godot editor.
        panel: {
          900: '#0e1116',
          850: '#12161d',
          800: '#161b22',
          700: '#1d242e',
          600: '#283140',
          500: '#3a4658',
        },
        accent: {
          DEFAULT: '#478cbf', // Godot blue
          hover: '#5a9fd1',
          muted: '#2f5c7e',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
