# 第六轮图片质量修复：独立验收

日期：2026-11-05（Asia/Shanghai）。

结论：几何选图修复及常规一次原图回退通过独立复测；发现1处P2换图状态缺陷，完整签收前需要关闭。没有修改业务源码、Git状态、现有服务、用户草稿或数据库。

## 1. 实际核查

读取Cursor的r6报告、JSON、HeroSection、几何工具、布局常量、fixture及浏览器脚本；核对目标diff。不是只根据完成截图作结论。

独立运行环境Node22.23.2、项目现有Playwright/Vite/Sharp。浏览器使用新上下文，端口5191，不代理用户3000，也不登录或请求业务数据库。

复制原诊断脚本到.codex-tmp/r6-independent-review，仅修改独立输出/缓存路径，以及通过Vite内存transform把fixture的A→B按钮改为A/B往返。应用源码不变。

## 2. 通过的检查

- 客户端目标组合测试：20通过、0失败、0跳过，退出码0，约2739ms自然退出（独立审查代理执行，主任务核对源码和测试覆盖）。
- client执行node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json：退出码0。
- 根目录npm.cmd run contracts:check：退出码0，客户端/服务端合同一致。
- 原脚本的12组浏览器场景全部独立通过：7组几何、resize/scroll、手机回退、桌面回退、双重失败、编辑预览成功/失败。

关键实际结果：
- 1920×1080、DPR2：3840档，PNG解码3840×2160。
- 390×844、DPR3：图片框390×487.5，source sizes=100vw，1200档。
- 768×1024、DPR2：图片框768×432，1680档，未再取3840。
- 1023×1366、DPR2：比例图片框，2400档。
- 1024×1366及1200×1800竖向桌面cover：保持3840档。
- 一次派生失败后两端均能请求各自原图；两次失败后正常停止；换到不同B图后恢复派生。
- 编辑态继续使用blob预览，没有改成公开uploads请求。

这些是当前HeroSection的真实浏览器组件/中性图片fixture证据。响应图片由本地诊断服务生成PNG；故障为自有图片请求Mock，不冒充真实网关、授权或生产WebP结果。第五轮完整Nest/MySQL闭环仍属于第五轮历史证据，本轮未重建。

本轮没有独立重跑完整构建，以免重写现有client/dist；Cursor的r6报告记录其构建成功，此项保留来源区别。

## 3. 唯一发现：R6-01 [P2] 换回旧图会重新启用过期回退状态

位置：client/src/components/blocks/HeroSection.tsx:129、:133、:145-147、:292-303。

imageSourceKey变化时只清originalFallbackAttempted ref，没有清originalFallbackSourceKey。该state仍保存最初回退的A键。切到B时比较为false；再回A时比较重新为true，直接启用旧的original模式。

独立浏览器复现：
1. A派生临时404，原图200，进入original模式。
2. 切B，B派生200，进入derived模式。
3. 恢复A的派生服务，切回A。
4. 组件仍是original，srcset/sizes为空，不尝试已恢复的1200档。

进一步，在独立浏览器中清理HTTP缓存并发出内存压力通知，以排除已解码原图缓存掩盖网络失败；让切回A时的原图404、派生仍可用：
- 网络只请求A原图，返回404。
- img.complete=true，naturalWidth=0，opacity=0。
- delivery仍original，placeholder=false。
- 未请求派生图，也没有显示“主视觉图片暂不可用”。
- 截图确认图片框为空。

原因：回A后ref已被清空，错误处理再次设置与当前相同的originalFallbackSourceKey=A；picture不重新挂载，既没有下一次请求，也没有进入最终失败状态。

两个新增往返断言均失败，脚本退出码1是捕获此缺陷的预期结果；不是Vite启动失败。常规12组仍全部通过。

最小修复方向：让每次实际来源切换启动一个新的加载周期，重置回退/失败状态；同一加载周期仍只回退一次，忽略过期事件。覆盖A→B→A、原图也失败、再次换图和重复onError。无需改动已通过的几何规则、数据库或权限。

## 4. 证据与复现

主要证据：
r6-independent-review/independent-cache-cleared-evidence.json

主要截图：
r6-independent-review/cache-cleared-screenshots/roundtrip-original-fails-on-return.png
r6-independent-review/cache-cleared-screenshots/tablet-768-dpr2.png

复现命令：
node .codex-tmp/r6-independent-review/verify-hero-frame-cache-cleared.mjs

注意：该命令写独立证据及截图；重跑应使用新输出目录或先保全旧记录。不要执行Cursor原脚本覆盖r6原始证据。

诊断初次追加往返用例时，内存transform执行顺序导致按钮未切回A，出现两个测试夹具超时。这份independent-evidence.json不作为产品缺陷证据。已修正为enforce:pre，并通过实际Vite输出确认按钮确实切换A/B；independent-confirmed-evidence.json证实旧original状态。最终cache-cleared记录进一步证实404后透明且无错误提示。

## 5. 用户环境保护与最终决定

独立诊断结束后5191无监听；3000仍PID65740，5173仍PID53468，与本轮开始时一致。未停止或替换用户服务，未读写业务数据库，未操作用户草稿。r4/r5/r6原有记录未覆盖。

验收决定：
- 上轮几何缺陷：关闭。
- 常规派生失败→一次原图回退：通过。
- 换图时完整状态重置：未通过，R6-01需修复。
- 其余范围及生产上线：本轮没有扩大验证声明。

