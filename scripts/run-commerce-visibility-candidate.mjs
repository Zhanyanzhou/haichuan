import { spawn } from "node:child_process";
import { readFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// 只在项目内生成一次性制品；不读取 .env，不连接真实 API 或支付渠道。
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const client = join(root, "client");
const tempRoot = join(root, ".tmp");
const origin = "https://commerce-visibility.example";
const host = new URL(origin).host;
const nginxImage = "nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const mounts = [
  ["nginx-main.conf", "/etc/nginx/nginx.conf"],
  ["nginx.conf", "/etc/nginx/conf.d/default.conf"],
];

function assertNode22() {
  if (process.versions.node.split(".")[0] !== "22") {
    throw new Error("COMMERCE_VISIBILITY_NODE_22_REQUIRED");
  }
}

function run(command, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      windowsHide: true,
      shell: process.platform === "win32" && command === npm,
      ...options,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      const value = String(chunk);
      output += value;
      if (options.echo) process.stdout.write(value);
    });
    child.stderr.on("data", (chunk) => {
      const value = String(chunk);
      output += value;
      if (options.echo) process.stderr.write(value);
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? accept(output.trim())
      : reject(new Error(`${command} failed (${code}): ${output.slice(-1800)}`)));
  });
}

function bind(source, target) {
  return ["--mount", `type=bind,src=${source},dst=${target},readonly`];
}

async function main() {
  assertNode22();
  await mkdir(tempRoot, { recursive: true });
  const work = await mkdtemp(join(tempRoot, "commerce-visibility-"));
  const output = join(work, "dist");
  const seo = join(work, "seo");
  await mkdir(seo);
  await mkdir(output);
  let container = "";
  try {
    const gitSha = await run("git", ["rev-parse", "HEAD"]);
    if (!/^[a-f0-9]{40}$/.test(gitSha)) throw new Error("COMMERCE_VISIBILITY_GIT_SHA_INVALID");
    const snapshot = join(seo, "public-seo-snapshot.json");
    await run(process.execPath, ["scripts/create-preproduction-safe-seo-snapshot.mjs",
      "--origin", origin, "--revision", gitSha, "--output", snapshot,
      "--html-output", join(output, "preproduction-not-ready.html")],
    );
    await run(npm, ["run", "build", "--prefix", "client", "--", "--outDir", output], {
      env: {
        ...process.env,
        VITE_API_BASE_URL: "/api",
        VITE_PUBLIC_SITE_ORIGIN: origin,
        VITE_ANALYTICS_ENABLED: "false",
        VITE_USE_MOCK: "false",
      },
      echo: true,
    });
    await run(process.execPath, ["scripts/prerender-public-routes.mjs",
      "--snapshot", snapshot, "--base-html", join(output, "index.html"), "--out-dir", output]);
    await run(process.execPath, ["scripts/generate-public-seo-artifacts.mjs",
      "--strict", "--origin", origin, "--manifest", snapshot,
      "--prerender-manifest", join(output, "prerendered-routes.json"),
      "--out-dir", output,
      "--nginx-map", join(seo, "public-seo-routes.conf"),
      "--nginx-policy", join(seo, "public-seo-policy.conf"),
      "--nginx-origin-redirect", join(seo, "public-origin-redirect.conf"),
      "--nginx-origin-host", join(seo, "public-origin-host.conf")]);

    const dockerArgs = ["run", "-d", "--rm", "--read-only", "--user", "nginx",
      "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=32m", "--add-host", "server:127.0.0.1",
      "-p", "127.0.0.1::8081"];
    for (const [file, target] of mounts) dockerArgs.push(...bind(join(client, file), target));
    for (const file of ["public-seo-routes.conf", "public-seo-policy.conf", "public-origin-redirect.conf", "public-origin-host.conf"]) {
      dockerArgs.push(...bind(join(seo, file), `/etc/nginx/${file}`));
    }
    dockerArgs.push(...bind(output, "/usr/share/nginx/html"), nginxImage);
    container = await run("docker", dockerArgs);
    const portLine = await run("docker", ["port", container, "8081/tcp"]);
    const port = Number(/:(\d+)\s*$/.exec(portLine)?.[1]);
    if (!Number.isInteger(port) || port <= 0) throw new Error("COMMERCE_VISIBILITY_NGINX_PORT_INVALID");
    const baseURL = `http://127.0.0.1:${port}`;
    const readyness = await fetch(`${baseURL}/cart`, { headers: { Host: host } });
    if (!readyness.ok || !readyness.headers.get("content-type")?.includes("text/html")) {
      throw new Error(`COMMERCE_VISIBILITY_NGINX_NOT_READY:${readyness.status}`);
    }
    const spa = await readFile(join(output, "spa-shell.html"));
    const shellHash = createHash("sha256").update(spa).digest("hex");
    process.stdout.write(`COMMERCE_VISIBILITY_NGINX_READY port=${port} spaSha256=${shellHash}\n`);
    await run(process.execPath, [join(client, "node_modules", "@playwright", "test", "cli.js"),
      "test", "--config", "playwright.commerce-visibility.config.ts"], {
      env: {
        ...process.env,
        COMMERCE_VISIBILITY_BASE_URL: baseURL,
        COMMERCE_VISIBILITY_HOST: host,
      },
      cwd: client,
      echo: true,
    });
  } finally {
    if (container) await run("docker", ["stop", container]).catch(() => {});
    // 只删除本次 mkdtemp 返回的目录；不处理已有 .tmp 或其他工作树资产。
    const safeRoot = resolve(tempRoot) + sep;
    if (!resolve(work).startsWith(safeRoot)) throw new Error("COMMERCE_VISIBILITY_TEMP_PATH_UNSAFE");
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
