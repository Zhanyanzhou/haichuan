// 仅用于带 IPC 的直属验收子进程。先删除标记，避免 fork 后代继承
// --require 后误把 Playwright worker 自己的 IPC 当成验收父连接。
const isOwnedChild = process.env.HAICHUAN_EXIT_WITH_PARENT_OWNER === '1';
if (isOwnedChild) delete process.env.HAICHUAN_EXIT_WITH_PARENT_OWNER;
if (isOwnedChild && process.channel) {
  process.once("disconnect", () => process.exit(1));
  process.channel.unref();
}
