/** @type {import('tailwindcss').Config} */
const preset = require('@xiabao/theme/tailwind-preset');

module.exports = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui-native/src/**/*.{ts,tsx}'],
  presets: [preset.default ?? preset],
};
