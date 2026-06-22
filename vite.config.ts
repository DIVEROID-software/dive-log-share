import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// `base` mặc định dùng cho GitHub Pages, nhưng có thể override bằng biến môi
// trường VITE_BASE_PATH (ví dụ '/' khi deploy bằng Docker ở root domain).
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/dive-log-share/',
  build: {
    outDir: 'docs',
  },
})
