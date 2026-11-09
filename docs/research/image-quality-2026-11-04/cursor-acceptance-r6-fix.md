# R6-01 修复与本地验收

日期：2026-11-05（Asia/Shanghai）。

结论：第六轮独立审查发现的换图回退状态缺陷已修复。20项客户端回归、类型检查、隔离目录生产构建及18组真实浏览器组件场景通过，退出码均为0。该结论是本地前端实现与浏览器验收，不是部署、真实网关或数据库验证。

## 修复

HeroSection以规范化的桌面/手机图片来源及编辑模式为React加载实例身份。每次来源切换都创建新的加载实例，包括A→B→A；旧实例的failed、ready、originalFallbackSourceKey和originalFallbackAttempted不再残留到下一轮。

保持同一加载周期内的一次原图回退、原图也失败后终止、现有几何选图和编辑预览。没有增加公开地址或更改授权政策。没有改变CSS布局或比例。

移除仅清ref的旧effect；来源切换通过实例生命周期统一重置状态，避免effect执行前先发出旧原图请求。

## 持久回归

- client/src/page-builder/dev/heroImageDeliveryFixture.tsx：换图按钮改为A/B切换，能够返回A。
- scripts/image-quality-acceptance/verify-hero-frame.mjs：新增手机、桌面各3组往返场景：派生恢复、原图不可用但派生恢复、派生与原图持续失败。
- 支持--output-dir，显式指定独立输出目录时缓存也写入该目录，保留旧r4/r5/r6证据。

新增6组场景验证：
1. A曾回退，经过B再回A：重新请求派生。
2. A原图被阻止、派生已恢复：仍能使用派生图，未请求原图。
3. A两层均失败，经过B再回A：重新完成一次派生+一次原图尝试，显示错误提示并停止；不再保持透明无提示。

手机返回A实际请求1200档PNG，桌面返回A请求3840档PNG；持续失败时均恰好两次404。原来的12组几何、resize/scroll、一次回退、双重失败和编辑预览场景全部保留且通过。

浏览器使用独立Vite5191、新上下文、中性图片和限定图片Mock。PNG由诊断服务生成，不冒充真实上传网关或生产WebP。

## 本轮实际命令

Node22.23.2。

- client：node --test responsiveUploadsImage.spec.ts imageDeliveryGeometry.spec.ts trustedMediaSize.spec.ts tests/media-picker-image-quality.unit.mjs
  - 20通过、0失败、0跳过，退出码0，2563ms自然退出。
- client：node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json
  - 退出码0。
- client：node_modules/.bin/vite build --outDir ../.codex-tmp/r6-source-reset/build
  - 退出码0，built in5.28s。保留大包、混合静态/动态导入和构建耗时提示，未为消除这些提示扩改其他模块。
- 根目录：node scripts/image-quality-acceptance/verify-hero-frame.mjs --output-dir .codex-tmp/r6-source-reset/browser
  - 18组通过、0失败，退出码0，自然关闭浏览器及5191。
- node --check脚本、目标git diff --check通过。

## 资产保护和范围

仅修改HeroSection及两个诊断/回归文件，原有未提交实现以本轮前目标文件快照核对；未回退或覆盖Cursor之前的功能。未提交、推送、发布或部署，未访问数据库、登录后台或操作用户草稿。未重写client/dist，构建输出隔离在本任务临时目录。

诊断结束后3000仍PID65740、5173仍PID53468，5191无监听。

证据保留在cursor-acceptance-r6-fix-evidence.json。正式证据落盘后尝试清理任务专用临时目录，但工具安全策略以blocked by policy拒绝该清理命令，临时构建、缓存、截图和快照仍保留在.codex-tmp/r6-source-reset。永久回归脚本可使用新的--output-dir再次执行。先前独立审查的失败证据仍保留，作为修复前记录。

