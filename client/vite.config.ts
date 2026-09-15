import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { createPublicClientEnvDefinitions } from "./vite-public-env.mjs";

const apiProxyTarget = "http://127.0.0.1:3000";

export default defineConfig(({ mode, command }) => {
  if (command === "build" && mode === "mock") {
    throw new Error("生产构建禁止使用 mock mode");
  }
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    // 不允许任何环境变量仅凭前缀自动进入浏览器包；只由 define 精确注入下面
    // 三个已确认可公开的浏览器配置。
    envPrefix: [],
    define: createPublicClientEnvDefinitions(env),
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
        ignored: [
          "**/dist/**",
          "**/dist-*/**",
          "**/public/images/**",
          // Playwright 每次写报告都会修改 HTML；开发站不得因此整页刷新。
          "**/playwright-report/**",
          "**/test-results/**",
        ],
      },
      // 统一代理本地 API 与上传路径
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        "/uploads": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      // Windows 下清空包含大量图片的输出目录会触发 EPERM；Linux 容器仍执行干净构建。
      emptyOutDir: process.platform !== "win32",
      // 品牌字体（woff2/woff）按 unicode-range 分片，必须保持独立哈希资产由浏览器按需下载；
      // 内联成 data URI 会让异步 CSS chunk 携带全部分片字节，突破最大 CSS 块预算。
      assetsInlineLimit(file) {
        if (/\.(woff2?|ttf|otf)$/.test(file)) return false;
        return undefined;
      },
      rolldownOptions: {
        output: {
          // 只固定共享框架块；Ant Design 保持按懒加载路由拆分，避免公开页下载整个后台组件库。
          codeSplitting: {
            groups: [
              {
                name: "react-vendor",
                test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
                priority: 30,
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
  };
});
