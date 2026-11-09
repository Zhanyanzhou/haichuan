# 图片质量改动：第六轮，首屏选图与原图回退

日期：2026-11-05。

本轮只修第五轮独立审查指出的两个前端问题：公开首屏 `sizes` 与真实图片框不一致，以及派生图失败时没有一次原图回退。图片档位算法、隔离数据库闭环和上一轮验收工具保持原样。没有覆盖第四轮、第五轮报告、运行记录或截图。

第五轮真实网关与数据库证据继续沿用：

- `cursor-acceptance-r5-runtime.json`（2026-11-04T16:18:06.237Z，退出码 0）
- `cursor-acceptance-r5-closure.json`（2026-11-04T16:44:42.800Z，退出码 0）

本轮没有重建 `haichuan_image_r5`，没有登录，没有打开用户草稿，没有发布真实首页，也没有连接业务数据库。失败态是对本任务试样请求的浏览器 Mock，只证明前端行为。

## 1. 两个问题分别如何修复

### 首屏 sizes

根因：`HeroSection` 原先对手机 source 和桌面 img 都使用 `100vw` × `max(620px, 100svh)` 的 cover 公式。现有 CSS 并不是每个宽度都把图片框拉到这个高度：

- 小于 768px：图片框改为相对定位，比例是手机 `4 / 5`。
- 768–1023px：图片框改为相对定位，比例是桌面 `16 / 9`。这是既有几何适配，不是新的内容端点。
- 1024px 及以上：图片框仍是绝对铺满，区块最小高度 `max(620px, 100svh)`。

768×1024 时，真实图片框约 768×432。旧公式按整屏高度估算约 1820 CSS 像素，DPR 2 时需求被抬到 3840 档。

修复没有改布局结果。`HERO_PUBLIC_IMAGE_FRAME` 把原来的 `max(620px, 100svh)` 和 `1023` 收成一处，CSS 模板改为引用它，发出的规则仍是这两个值。选图使用同一处：

- 手机 source 只按手机比例框计算 cover 宽度。与原图同比例时是 `100vw`，不乘 DPR，也不写 `100svh`。
- 桌面 img 在 `max-width: 1023px` 时按桌面比例框计算；更宽时仍用原来的视口高度 cover 公式，横图盖住竖向视口时继续放大到需要的宽度。
- 计算复用 `renderedWidthFactor`、`scaleSizesExpression` 和 `coverSizesFromViewportBox`。没有用尺寸观察回写布局。

`HomeFirstFold` 的加载预览仍是整屏图，公式未改。取样对象是已发布主视觉 `[data-page-document-state="published"] .hc-phase1-hero__media img`。

### 派生失败回退

根因：公开首屏的 `onError` 直接记下失败并卸掉 `picture`，派生地址失败时不会再请求去掉 `width` 的原图。

修复只对公开页做一次回退。第一次错误换成当前内容端点的原图地址：手机 source 用手机原图，桌面 img 用桌面原图；缺一端时仍沿用原来的复用规则。回退那一帧去掉对应 `source` 和 `img` 上的派生 `srcSet` / `sizes`，避免浏览器继续选中同一个失败 URL。原图再失败才进入现有“主视觉图片暂不可用”，不继续重试。更换图片会重置失败和回退状态。编辑态仍走预览字节，失败后显示原有的编辑占位，不转成公开地址，也不请求 `/uploads`。

## 2. 本轮实际通过的场景

诊断脚本：`node scripts/image-quality-acceptance/verify-hero-frame.mjs`。Node v22.23.2。独立 Vite 在 `127.0.0.1:5191`，不代理 3000。Playwright 使用新的浏览器上下文，没有导入登录态。证据是 `cursor-acceptance-r6-evidence.json`（2026-11-04T17:31:16.103Z），`failures` 为空，进程退出码 0。手机试样是 2000×2500，桌面试样是 3840×2160。

`srcset` 图片的 `naturalWidth` 是浏览器按描述符密度折算后的值，不能当成文件像素。下表的解码尺寸是响应体 PNG 经 sharp 读出的宽高。这些 PNG 由诊断服务按请求宽度生成，不是第五轮真实网关的 WebP。

| 场景 | 图片框 CSS | 生效 sizes | currentSrc | 响应 PNG |
| --- | --- | --- | --- | --- |
| 桌面 1920×1080，DPR 2 | 1920×1080 | img：1023 以下 `100vw`，更宽为视口高度公式 | `r6-desktop-a.png?width=3840` | 3840×2160 |
| 手机 390×844，DPR 3 | 390×487.5 | source：`100vw` | `r6-mobile-a.png?width=1200` | 1200×1500 |
| 767×1000，DPR 2 | 767×958.75 | source：`100vw` | `r6-mobile-a.png?width=1680` | 1680 宽 |
| 768×1024，DPR 2 | 768×432 | img 以 `(max-width: 1023px) 100vw` 开头 | `r6-desktop-a.png?width=1680` | 1680 宽 |
| 1023×1366，DPR 2 | 1023×575.44 | 同上，1023 仍走比例框 | `r6-desktop-a.png?width=2400` | 2400 宽 |
| 1024×1366，DPR 2 | 1024×1366 | img 含 `100svh` | `r6-desktop-a.png?width=3840` | 3840 宽 |
| 竖向 cover 1200×1800，DPR 2 | 1200×1800 | img 含视口高度公式 | `r6-desktop-a.png?width=3840` | 3840×2160 |

768 这一档没有再选 3840。1024 和 1200×1800 仍选 3840，竖向 cover 没有退回更低档。

同一上下文里先在 1920×1080、DPR 2 滚动 48 CSS 像素：地址保持 `width=3840`，图片框保持 1920×1080。随后改到 390、1024、再回到 390：两次手机读数都是 `r6-mobile-a.png?width=800`、框 390×487.5；中间 1024 读数是 `width=3840`、框 1024×1366。这个上下文的 DPR 是 2，所以 390 CSS 的需求是 800 档，不是 DPR 3 的 1200 档。没有出现来回切档或图片框跳动。

失败回退，Mock 只拦截本任务试样：

- 手机 390×844、DPR 3：`r6-mobile-a.png?width=1200` 返回 404，随后无 `width` 的同一路径返回 200，PNG 2000×2500，画面显示，`delivery` 为 `original`。更换后 `r6-mobile-b.png?width=1200` 返回 200，PNG 1200×1500。一共 3 次请求。
- 桌面 1920×1080、DPR 2：`width=3840` 返回 404，原图 200 且 PNG 3840×2160。更换后 `r6-desktop-b.png?width=3840` 返回 200。一共 3 次请求。
- 派生和原图都失败：手机 390×844、DPR 2 先请求 `width=800` 再请求原图，两次都是 404；桌面 1280×800、DPR 2 先请求 `width=2880` 再请求原图，两次都是 404。两边都显示“主视觉图片暂不可用”，没有第三次请求。
- 编辑态成功：只请求 `/api/upload/media/preview-by-storage-key`，两次均为 200、PNG 32×18；`currentSrc` 为 `blob:`，`delivery` 为 `editor`，没有 `/uploads`。
- 编辑态预览失败：三次预览请求都是 404，出现原有编辑占位，没有公开错误句，也没有 `/uploads` 回退。

截图在 `docs/research/image-quality-2026-11-04/r6-screenshots/`：`desktop-1920-dpr2.png`、`phone-390-dpr3.png`、`phone-767-dpr2.png`、`tablet-768-dpr2.png`、`tablet-1023-dpr2.png`、`desktop-1024-dpr2.png`、`cover-1200x1800-dpr2.png`、`fallback-phone.png`、`fallback-desktop.png`、`fallback-both-phone.png`、`edit-preview.png`、`edit-fail.png`。

单元与构建，工作目录 `client/`，Node v22.23.2：

- `node --test responsiveUploadsImage.spec.ts imageDeliveryGeometry.spec.ts trustedMediaSize.spec.ts tests/media-picker-image-quality.unit.mjs`：20 项通过、0 失败，退出码 0，约 2.4 秒。其中“首屏手机和平板按比例框选图，只有更宽的桌面才按视口高度铺满”是本轮新增；原有断言没有删除或放宽。
- `npm run build`：先执行 `tsc --noEmit -p tsconfig.json`，再执行 Vite 构建，退出码 0。Vite 报告 `built in 9.00s`。构建结束时的大包警告是既有输出，不是本轮选图改动的失败。

## 3. 本轮没有完成的检查

- 没有重跑第五轮隔离 Nest、可丢弃 MySQL、真实上传网关和数据库授权撤销。那些结论只属于第五轮记录。
- 本轮解码尺寸是诊断服务生成的 PNG。不能把它写成生产 WebP 或真实网关的解码结果。
- 失败态 Mock 没有经过公开网关的鉴权实现。它证明的是浏览器在派生失败后改请求原图、两边都失败后停止，以及编辑态不改走公开地址。
- 两端都失败的手机视口是 DPR 2，失败的派生档是 800。DPR 3 的 1200 档覆盖的是派生失败后原图成功那一条。
- 没有打开用户正在使用的 3000 首页或 5173 草稿做这条修复的验收。诊断页只渲染本任务夹具里的 `HeroSection`。

## 4. 用户服务、草稿、数据库和既有修改

诊断前后监听未变：3000 仍是 PID 65740，5173 仍是 PID 53468。5191 只在诊断进程内监听，结束时已关闭。没有按端口结束进程。

本任务早先有一次中断的诊断曾改写过 `client/node_modules/.vite` 的优化缓存。成功的这一次把 Vite 缓存放到系统临时目录 `haichuan-image-r6-vite`，没有再写那份缓存。没有停止或替换 3000、5173。

没有提交、推送、部署或发布。没有读取或写入业务库，没有打开用户草稿，没有登录。第四轮和第五轮报告、JSON、截图都还在。

本轮写入的是：

- `client/src/components/blocks/HeroSection.tsx`
- `client/src/page-builder/layout/contentTemplateLayouts.tsx`（只把原有高度和 1023 断点收成共享常量）
- `client/src/page-builder/config/imageDeliveryGeometry.ts`（新增比例框 sizes 与首屏候选）
- `client/imageDeliveryGeometry.spec.ts`（新增一条，原断言保留）
- `client/src/page-builder/dev/heroImageDeliveryFixture.tsx`
- `scripts/image-quality-acceptance/verify-hero-frame.mjs`
- `docs/research/image-quality-2026-11-04/cursor-acceptance-r6.md`
- `docs/research/image-quality-2026-11-04/cursor-acceptance-r6-evidence.json`
- `docs/research/image-quality-2026-11-04/r6-screenshots/`

`npm run build` 还更新了 `client/dist`。工作区里其他未提交修改没有回退、暂存或覆盖。
