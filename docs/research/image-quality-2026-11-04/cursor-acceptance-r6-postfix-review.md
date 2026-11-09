# 修复后追加验收：首屏图片跨端失败恢复

日期：2026-11-05（Asia/Shanghai）。

结论：R6-01来源往返状态问题保持关闭；发现另1处P2跨内容端点失败恢复缺陷，完整图片失败状态验收尚不能全部通过。

## 本轮范围和结果

只读检查当前Hero、布局/几何工具、回退状态和测试脚本，没有修改业务源码、数据库、Git状态、用户草稿或现有服务。新建了独立浏览器诊断副本和证据。

本轮浏览器22组检查：20通过、2失败，退出码1。失败来自同一根因的两个方向，不是两个不同缺陷。
- 上轮18组全部再次通过，包括手机与桌面的A→B→A恢复/持续失败。
- 只配置桌面图时手机复用通过；只配置手机图时桌面复用通过。
- 单端最终失败后跨768断点切到健康端：两个方向均失败。

当前Hero源码SHA256与上一轮修复证据一致。因此复用上一轮20项客户端测试、类型检查和隔离构建结果；本轮未重复运行同一组类型检查/构建，不将旧结果记为本轮新执行。

## [P2] R6-02：一个内容端点失败后，另一个健康端点也被抑制

位置：client/src/components/blocks/HeroSection.tsx:111、:138、:260、:307。

sourceKey和imageSourceKey只包含桌面/手机图片地址及编辑模式，不包含当前生效内容端点。failedImageSourceKey和originalFallbackSourceKey因此作用于整个图片对。单端最终失败时，整个picture被卸载；跨768断点后实例身份不变，也不存在picture让浏览器自动选择另一端图片。

独立浏览器复现：
1. 两端均配置，桌面素材正常可读。
2. 在390×844、DPR2，限定Mock手机素材的派生与原图404。
3. 手机显示正常失败提示。
4. 两个图片地址保持不变，将视口改为1920×1080。
5. 仍显示失败提示；picture/img不存在，currentPath为null，naturalWidth为0，没有新增桌面图片请求。

反向：桌面图两次404后改到390×844，健康手机图同样不请求。截图和DOM/请求证据均已保留。

该缺陷来自原有“把整个桌面/手机地址对标为失败”的粒度，不是来源key remount修复引入。普通用户正常加载不受此故障触发；但窗口缩放、设备旋转跨内容断点时可能阻止健康图片恢复。

建议修复：将失败和原图回退状态与当前实际内容端点/资源绑定；跨768内容端点时允许健康端开始新的加载周期。保持同一端的一次原图回退及最终失败停止，避免resize制造无限重试，不新增内容端点或修改CSS比例。

同根较轻问题（本轮仅静态检查，未作为独立缺陷计数）：某端回退原图成功后切到另一端，会让健康另一端也进入original模式。

## 证据和边界

正式证据：
cursor-acceptance-r6-postfix-review-evidence.json

复现命令：
node .codex-tmp/r6-final-acceptance/verify.mjs --output-dir .codex-tmp/r6-final-acceptance/new-results

脚本在独立Vite5191和新浏览器上下文运行；仅内存transform测试夹具以构造缺一端素材，不修改应用源码。故障是自有图片请求Mock，PNG来自中性诊断图片；没有模拟整个应用、登录或数据库。

截图：
.codex-tmp/r6-final-acceptance/results/r6-screenshots/phone-failed-then-desktop.png
.codex-tmp/r6-final-acceptance/results/r6-screenshots/desktop-failed-then-phone.png

结束后3000仍PID65740，5173仍PID53468，5191无监听。没有重启用户服务、写业务库或进行Git写操作。未恢复或发布旧模板功能，也未将组件夹具结果外推为全部动态模板或生产验收。

