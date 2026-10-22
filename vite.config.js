import { defineConfig } from 'vite';

// 相對路徑，讓 GitHub Pages 子路徑（/armored-train/）也能正確載入資源
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    // Blender 輸出模型時檔案會被鎖住，不監看這些資料夾以免開發伺服器中斷
    watch: { ignored: ['**/public/models/**', '**/public/draco/**', '**/assets/**', '**/docs/**', '**/tools/**'] },
  },
});
