# 图片质量改动：第五轮验收收尾

日期：2026-11-04。

结论：R4-01 已修复。隔离测试库上的完整 Nest 与前端已经走完测试员工登录、上传、素材库回读、保存、重开、测试页发布、公开接口回读、真实浏览器选图与字节解码，以及数据库授权撤销后的缓存复核。用户 3000/5173 未被替换或停止。

本轮保留第四轮记录，不覆盖 `cursor-acceptance-r4.md`、`cursor-acceptance-r4-evidence.json`、`cursor-acceptance-r4-runtime.json`。只读读取链路的运行记录仍是 `cursor-acceptance-r5-runtime.json`（2026-11-04T16:18:06.237Z，退出码 0）。完整闭环记录是 `cursor-acceptance-r5-closure.json`（2026-11-04T16:44:42.800Z，退出码 0，20 项检查全部为真）。

## 1. R4-01

停止脚本不再用目录名包含 `haichuan-image-r4-` 作为删除条件。`assertExactAcceptanceTempRoot` 在杀进程和递归删除之前执行：

- 校验状态文件结构和本轮身份。
- 目标必须是绝对路径，名称精确等于 `haichuan-image-<本轮身份>-<本轮进程号>`。
- 规范化后的父目录必须等于系统临时目录，目标本身不能是临时根。
- 拒绝 `..`、相对路径、名称相同但位于临时目录外的路径，以及符号链接和目录联接。
- 校验失败直接抛错，不退化为模糊匹配清理。
- `commandMatchesRun` 同时要求当前仓库绝对路径、32 位本轮令牌和角色对应脚本。只含通用脚本片段不算本轮进程。
- 不按端口杀进程。状态里记录的用户 3000/5173 进程号若与目标相同则拒绝。

本轮重新执行 `node --test scripts/image-quality-acceptance/temp-guard.spec.mjs`：7 项通过、0 失败、0 跳过，退出码 0，约 188 毫秒。非法路径只做拒绝断言；测试自己创建的空目录才会被接受并删除，哨兵文件在非法嵌套路径上保持存在。

只读链路启动后，停止脚本删除的是 `C:\Users\Administrator\AppData\Local\Temp\haichuan-image-r5-56136`。完整闭环结束时，`C:\Users\Administrator\AppData\Local\Temp\haichuan-image-r5-78048` 已不存在，名称匹配 `hc-image-r5-` 的容器也不存在。两次核对时，3000 仍是 PID 65740，5173 仍是 PID 16412。

`verify-isolated-read.mjs` 使用独立输出路径，拒绝覆盖已有验收记录。第四轮 runtime 未改写。

## 2. 完整业务闭环走到了哪一步

闭环脚本是 `scripts/image-quality-acceptance/run-isolated-closure.mjs`。环境是 Node v22.23.2、Docker 29.8.0。数据库是本机新建、可丢弃的 MySQL 8 容器：库名 `haichuan_image_r5`，地址 `127.0.0.1:33173`，排序规则 `utf8mb4_unicode_ci`，71 条 migration，数据目录为 tmpfs。完整 Nest 监听 `127.0.0.1:3019`，Vite 监听 `127.0.0.1:5177`。进程工作目录、上传目录、private-media 和派生缓存都在本轮临时目录，启动前断言数据库名，不读取业务 `DATABASE_URL`。`businessDatabaseUsed` 为 false。

实际 HTTP 与浏览器结果：

1. 测试员工登录：超级管理员、审核员、编辑均为 HTTP 201，角色分别为 `SUPER_ADMIN`、审核员、`EDITOR`。
2. 上传中性测试图：桌面 3840×2160、手机 941×1672、64×64 探针和 48×48 归档图均为 HTTP 201、`READY`。
3. 素材库回读：四条均为 `metadataStatus: measured`，展示尺寸与像素尺寸一致。未登录读取素材库为 401。素材库接口本身不返回派生候选；候选出现在公开页 srcset。
4. 两人授权后保存测试首页：保存 HTTP 200。
5. 重新打开：HTTP 200，桌面与手机地址与上传结果一致。
6. 发布隔离测试页：HTTP 200。公开接口 HTTP 200，`documentStatus` 为 `PUBLISHED`，媒体事实宽度为 3840 和 941。
7. 浏览器等待 `[data-page-document-state="published"] .hc-phase1-hero__media img` 出现非空 srcset 后取样，并下载响应字节解码。
8. 桌面 1920 CSS、DPR 2：`currentSrc` 含 `width=3840&rv=2`，解码 WebP 3840×2160，14818 字节，ETag `w3840-v2-b728d02ebbdb705f`。`sizes` 为 `calc(max(100vw, calc(max(620px, 100svh) * 1.7778)))`。
9. 手机 390 CSS、DPR 3：被选中的 `<source>` srcset 末项是 `width=1200&rv=2 941w`，不含 `1200w`。解码 WebP 941×1672，2892 字节，ETag `w1200-v2-f4b8a9104e1d33d9`。`<img>` 自身 srcset 仍是桌面候选，浏览器选中的是手机 source。
10. 横图铺满 1200×1800 竖向画面：取样前画面为 1200×1800 CSS、DPR 2，选中 3840 档。移动鼠标并滚动 48 CSS 像素后，`currentSrc`、`sizes` 和 srcset 保持不变，绘制框仍是 1200×1800。解码仍是 3840×2160 WebP。
11. 已登录隔离后台：移动端与桌面端按钮均按下。缩放控件没有精确 67% 档；适应后两次放大落到 `画布尺寸 1440 × 900，缩放 64%`。修改隔离草稿主标题后，父页面出现“有未保存修改”。没有打开用户现有草稿。

同一隔离库上的 by-url 与缓存授权：

- 员工和编辑读取 by-url 为 200。未登录 401。客户登录 201，客户读取和上传均为 401。
- 空白地址 400“素材地址无效”。外站地址 400“请使用本站页面素材路径”。缺失素材 404“素材不存在”。归档素材读取 200，状态 `ARCHIVED`。
- 文件移走后测量状态为 `unknown`，文件放回后为 `measured`。
- 64×64 探针两次请求 ETag 同为 `w480-v2-2ea5f87a5eaec471`，解码宽 64。随后调用撤销接口 HTTP 201，数据库 `revocationStatus` 为 `REVOKED`，同一 URL 再请求为 404“素材当前不可公开访问”。这是隔离库中的授权变更，不是内存快照。

截图在 `docs/research/image-quality-2026-11-04/r5-screenshots/`：`public-desktop.png`、`public-phone.png`、`public-cover.png`、`editor-mobile.png`、`editor-desktop.png`、`editor-unsaved.png`。时间均为 2026-11-05 00:44。

## 3. 各层分别证明了什么

- 纯函数与组件回归：第四轮独立复跑的 19 项客户端测试和 4 项服务端直接调用仍然是那一层的证据。本轮没有改这些测试，也没有重跑。
- 只读隔离链路（`cursor-acceptance-r5-runtime.json`）：真实 `PageModulesService` 读取已发布首页的 14 条媒体事实，真实网关解码复制到临时目录的图片。桌面 3840×2160 WebP 为 645170 字节；941 描述符对应 941 像素。该链路的撤销只改内存快照，记录中的数据库授权状态在撤销前后都是 `ACTIVE`。不能把它当成数据库撤销传播。
- 隔离完整应用（`cursor-acceptance-r5-closure.json`）：真实 Nest、真实 Prisma、可丢弃 MySQL、真实上传和真实浏览器。上面第 2 节的登录、保存、发布、选图、解码和 404 都属于这一层。

公开首屏在文档就绪后会从首屏预览换成正式主视觉。正式主视觉原先没有把已发布测量尺寸交给选图函数，srcset 会在替换后消失。本轮只在 `client/src/components/blocks/HeroSection.tsx` 补上这条接线：公开模式读取 `usePublicImageFact`，并用与首屏预览相同的 cover `sizes` 表达式。编辑模式仍走预览字节，不生成公开 srcset。浏览器断言改为等待已发布主视觉，不再把加载中的预览图当成最终页面。

客户端 `npx tsc --noEmit -p tsconfig.json` 退出码 0。没有改合同源，没有重跑合同检查，也没有重跑完整构建。

## 4. 尚未完成

- 数据库瞬时读失败后的自动恢复，仍然只有既有 4 项直接测试。完整 Nest 没有安全的故障注入点，本轮没有停掉 MySQL 去制造读失败。
- 编辑器没有精确 67% 缩放档。本轮记录的是实际控件结果 64%。
- D 批原图比例模式、旧模板迁移、真实首页发布、提交、推送和部署未做。
- 用户正在使用的 3000/5173 没有被本轮代码替换，因此不能用它们代表本次接线后的公开页。

## 5. 改动与隔离边界

- 业务源码：只改了 `client/src/components/blocks/HeroSection.tsx`。图片候选算法、权限政策和既有回归断言没有改。
- 隔离测试库：写入了可丢弃库 `haichuan_image_r5`，包括测试账号、中性图片、测试首页草稿和发布快照。容器与临时目录在脚本结束时删除。没有写当前业务库。
- 用户服务：3000 PID 65740 与 5173 PID 16412 在闭环前后都仍在监听。3019、5177、33173 在开始前空闲，结束后不再监听。
