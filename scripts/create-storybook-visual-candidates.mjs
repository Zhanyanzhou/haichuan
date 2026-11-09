import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// 候选图只能写入忽略的测试产物目录，绝不覆盖共享的已认可基线。
if (process.env.CI) {
  throw new Error("CI 不得生成待审视觉基线。");
}
const client = fileURLToPath(new URL("../client/", import.meta.url));
const cli = fileURLToPath(new URL("../client/node_modules/@playwright/test/cli.js", import.meta.url));
const result = spawnSync(process.execPath, [
  cli, "test", "--config", "playwright.storybook.config.ts", "--grep", "@visual",
], {
  cwd: client,
  env: { ...process.env, STORYBOOK_SCREENSHOT_CANDIDATES: "1" },
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status === 0) {
  console.log("已生成待审候选图：client/test-results/storybook-candidates。测试通过仅说明成功截图，不代表视觉质量获认可。共享基线未更改。");
}
process.exitCode = result.status ?? 1;
