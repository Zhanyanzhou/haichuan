import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const apiProxyTarget = "http://127.0.0.1:3000";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // 仅把确需由浏览器读取的公开配置暴露给 import.meta.env。
  // Vite 的 envPrefix 是前缀匹配，因此使用完整键名作为最小白名单。
  envPrefix: ["VITE_API_BASE_URL", "VITE_ANALYTICS_ENABLED"],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // 协议族不承担运行模式切换：real 固定 5173，显式 mock 固定 5174。
    // strictPort 被占时直接报错，避免遗留进程静默制造第二套服务。
    port: mode === "mock" ? 5174 : 5173,
    strictPort: true,
    host: "127.0.0.1",
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
    rolldownOptions: {
      output: {
        // 使用 Rolldown 原生分包，避免旧 manualChunks 兼容层把 React 依赖并入 Ant Design 块。
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: "antd",
              test: /[\\/]node_modules[\\/](@ant-design[\\/]icons|antd)[\\/]/,
              priority: 20,
            },
            {
              name: "motion",
              test: /[\\/]node_modules[\\/]framer-motion[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
}));
