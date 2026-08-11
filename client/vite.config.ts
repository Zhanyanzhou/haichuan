import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET || "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    watch: {
      // Windows 中文路径 + Node.js 文件监视器 = EBUSY，改用轮询
      usePolling: true,
      interval: 1000,
      // 排除构建输出和图片目录，减少中文文件名监视负担
      ignored: ["**/dist/**", "**/dist-*/**", "**/public/images/**"],
    },
    // Mock 模式下不需要代理，后端启动后取消注释
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    // Windows 下清空包含大量图片的输出目录会触发 EPERM；Linux 容器仍执行干净构建。
    emptyOutDir: process.platform !== "win32",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          antd: ["antd", "@ant-design/icons"],
          motion: ["framer-motion"],
        },
      },
    },
  },
});
