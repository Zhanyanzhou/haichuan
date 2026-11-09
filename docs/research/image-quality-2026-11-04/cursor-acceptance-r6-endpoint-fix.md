# R6-02 跨端图片失败恢复：修复与验收

日期：2026-11-05（Asia/Shanghai）。

结论：R6-02已在本地前端和真实浏览器组件层验证关闭。25组浏览器检查、20项客户端回归、类型检查和隔离目录构建全部通过。未部署、未操作现有业务数据库。

## 根因与修复

原来failed/original/ready和一次回退标记绑定整对桌面/手机来源。单端失败卸载整个picture后，另一个健康端无法被选择。

本次在HeroSection内：
- 依据RESPONSIVE_CANVAS.mobileMediaQuery订阅当前端点，不新增断点；仅跨768内容端点时通知。
- 按手机/桌面分别保存failed、original、ready和已尝试回退的状态。
- picture key包含当前端点与回退阶段，分离跨端和旧图片节点事件。
- 已失败的手机端不再输出source；桌面失败时不再输出img的src和派生srcSet，避免浏览器在React处理断点变化前请求已知失败候选。
- 两端各自输出自己的original或derived配置，健康端不受另一端回退影响。
- 返回已失败端保留该端终态，窗口反复缩放不触发新重试。
- 图片来源变化仍由上轮来源key实例隔离，A→B→A保持新加载周期。
- 编辑态不应用公开候选屏蔽，继续使用既有管理预览字节。

未修改布局、比例、图片档位算法、授权策略或功能入口。

## 永久回归

verify-hero-frame.mjs在原18组基础上保留新增7组：
1. 仅配置桌面图，在手机复用。
2. 仅配置手机图，在桌面复用。
3. 手机最终失败→桌面健康→返回手机失败端。
4. 手机回退成功→桌面健康派生→返回手机原图。
5. 桌面最终失败→手机健康→返回桌面失败端。
6. 桌面回退成功→手机健康派生→返回桌面原图。
7. 两端都最终失败后反复切换，不重新请求。

严格流量断言没有降低。首轮候选修复使健康端恢复，但旧picture在返回失败端时额外请求一次失败图片；最终通过移除失败候选修正这一浏览器时序缺口。

最终双向记录：
- 手机失败后：桌面3840档正常解码显示。
- 桌面失败后：手机800档正常解码显示。
- 返回失败端及同端缩放：全部图片请求数量均保持3→3，失败素材请求保持2→2。
- 两端失败：总共4次404（每端派生、原图各一次），后续反复切换不增加请求。
- 健康端未被迫下载原图。
- 上轮几何、一次回退、双重失败、A→B→A及编辑Blob场景全部再次通过。

## 本轮命令和结果

Node22.23.2。

- client：node --test responsiveUploadsImage.spec.ts imageDeliveryGeometry.spec.ts trustedMediaSize.spec.ts tests/media-picker-image-quality.unit.mjs
  - 20通过、0失败、0跳过，退出码0，约2889.9ms自然退出。
- client：node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json
  - 退出码0。
- client：node_modules/.bin/vite build --outDir ../.codex-tmp/r6-endpoint-reset/build
  - 退出码0，built in2.70s。保留大包和混合动态/静态导入提示，未扩改无关模块。
- 根目录：node scripts/image-quality-acceptance/verify-hero-frame.mjs --output-dir .codex-tmp/r6-endpoint-reset/browser-verified
  - 25组通过、0失败，退出码0，服务及浏览器自然退出。
- 脚本node --check和目标git diff --check通过。

独立只读审查未发现新的源码阻断。审查者未参与修改。

## 验收边界与资产保护

真实浏览器使用独立Vite5191、新上下文、中性生成图片；故障是限定图片请求Mock，响应解码为PNG，不冒充真实网关、数据库鉴权或生产WebP。

本轮是当前显式Hero组件夹具验收，没有恢复旧模板入口，没有外推为全动态模板或真实Puck iframe跨端验收。顶层fixture中编辑Blob路径通过，不能替代真实Puck portal/iframe状态验收。

只修改HeroSection、测试fixture和诊断脚本，保留既有改动。未重启用户服务、未访问业务库、未操作用户草稿，未提交、推送、发布或部署。构建没有覆盖client/dist。

结束时3000仍PID65740、5173仍PID53468，5191无监听。

正式证据：cursor-acceptance-r6-endpoint-fix-evidence.json。
健康桌面恢复截图：r6-endpoint-fixed-desktop.png。
任务临时构建、缓存和首次诊断留在已忽略的.codex-tmp/r6-endpoint-reset，不尝试绕过先前的清理策略限制。

本轮覆盖范围内未发现其他阻断问题；已发现的R6-01和R6-02均有当前浏览器回归支持关闭。

