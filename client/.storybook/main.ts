import type { StorybookConfig } from "@storybook/react-vite";
import { fileURLToPath, URL } from "node:url";

/**
 * Storybook 只作为模板 Renderer 的开发与视觉回归工具。
 * stories 目录限制在 .storybook/stories，避免扫描业务源码；
 * 也不进入客户前台生产构建（client/vite.config.ts 不引用本目录）。
 */
const config: StorybookConfig = {
  stories: ["./stories/**/*.stories.tsx"],
  framework: "@storybook/react-vite",
  viteFinal(config) {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    };
    return config;
  },
};

export default config;
