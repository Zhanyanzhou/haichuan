/**
 * 在本进程内启动 Vite，使命令行同时带有仓库路径、本轮身份和配置文件路径。
 * 参数：<runToken> <configFile> <host> <port>
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const [runToken, configFile, host, portText] = process.argv.slice(2);
if (!/^[a-f0-9]{32}$/.test(runToken || '')) {
  console.error('vite child rejected: missing run identity');
  process.exit(2);
}
if (!configFile || !host || !/^\d+$/.test(portText || '')) {
  console.error('vite child rejected: incomplete arguments');
  process.exit(2);
}

const requireFromClient = createRequire(fileURLToPath(new URL('../../client/package.json', import.meta.url)));
const { createServer } = requireFromClient('vite');
const server = await createServer({
  configFile,
  server: {
    host,
    port: Number(portText),
    strictPort: true,
  },
});
await server.listen();
await new Promise(() => {});
