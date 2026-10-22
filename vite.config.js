import { defineConfig } from 'vite';

// 相對路徑，讓 GitHub Pages 子路徑（/armored-train/）也能正確載入資源
export default defineConfig({
  base: './',
  server: { port: 5173 },
});
