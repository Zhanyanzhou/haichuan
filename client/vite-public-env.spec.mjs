import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build, loadConfigFromFile, loadEnv } from "vite";
import {
  createPublicClientEnvDefinitions,
  PUBLIC_CLIENT_ENV_KEYS,
} from "./vite-public-env.mjs";

const clientRoot = dirname(fileURLToPath(import.meta.url));
const viteConfigFile = join(clientRoot, "vite.config.ts");

async function loadProjectViteConfig() {
  const result = await loadConfigFromFile(
    { command: "build", mode: "production", isPreview: false, isSsrBuild: false },
    viteConfigFile,
    clientRoot,
    "silent",
  );
  assert.ok(result, "必须能加载真实 client/vite.config.ts");
  return result.config;
}

test("项目 Vite 配置禁用全部前缀自动暴露", async () => {
  const config = await loadProjectViteConfig();
  assert.deepEqual(config.envPrefix, []);
});

test("只向浏览器定义三个批准的公开环境变量", () => {
  const definitions = createPublicClientEnvDefinitions({
    VITE_API_BASE_URL: "/api",
    VITE_PUBLIC_SITE_ORIGIN: "https://example.invalid",
    VITE_ANALYTICS_ENABLED: "false",
    VITE_API_BASE_URL_SECRET: "must-not-leak",
    VITE_PRIVATE_TOKEN: "must-not-leak",
  });

  assert.deepEqual(
    Object.keys(definitions).sort(),
    PUBLIC_CLIENT_ENV_KEYS.map((key) => `import.meta.env.${key}`).sort(),
  );
  assert.equal(definitions["import.meta.env.VITE_API_BASE_URL"], '"/api"');
  assert.ok(!JSON.stringify(definitions).includes("must-not-leak"));
});

test("缺失的公开配置稳定为空字符串并沿用应用内安全默认值", () => {
  const definitions = createPublicClientEnvDefinitions({});
  for (const key of PUBLIC_CLIENT_ENV_KEYS) {
    assert.equal(definitions[`import.meta.env.${key}`], '""');
  }
});

test("真实 Vite 构建不会把同前缀附加变量或秘密写入浏览器包", async () => {
  const root = await mkdtemp(join(tmpdir(), "haichuan-vite-public-env-"));
  try {
    const projectConfig = await loadProjectViteConfig();
    await writeFile(join(root, "index.html"), '<script type="module" src="/main.js"></script>');
    await writeFile(
      join(root, ".env.production"),
      [
        "VITE_API_BASE_URL=/approved-public-api",
        "VITE_API_BASE_URL_SECRET=same-prefix-secret-must-not-leak",
        "VITE_PRIVATE_TOKEN=private-token-must-not-leak",
        "APP_INTERNAL_SECRET=non-vite-secret-must-not-leak",
      ].join("\n"),
    );
    await writeFile(
      join(root, "main.js"),
      "document.body.textContent = JSON.stringify([import.meta.env.VITE_API_BASE_URL, import.meta.env.VITE_API_BASE_URL_SECRET, import.meta.env.VITE_PRIVATE_TOKEN, import.meta.env.APP_INTERNAL_SECRET, import.meta.env]);",
    );
    const loadedEnv = loadEnv("production", root, "");
    assert.equal(loadedEnv.VITE_API_BASE_URL_SECRET, "same-prefix-secret-must-not-leak");
    assert.equal(loadedEnv.APP_INTERNAL_SECRET, "non-vite-secret-must-not-leak");
    await build({
      root,
      logLevel: "silent",
      envPrefix: projectConfig.envPrefix,
      define: createPublicClientEnvDefinitions(loadedEnv),
      build: { outDir: "dist" },
    });

    const assetNames = await readdir(join(root, "dist", "assets"));
    const output = (
      await Promise.all(assetNames.map((name) => readFile(join(root, "dist", "assets", name), "utf8")))
    ).join("\n");
    assert.match(output, /approved-public-api/);
    assert.doesNotMatch(
      output,
      /same-prefix-secret-must-not-leak|private-token-must-not-leak|non-vite-secret-must-not-leak/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
