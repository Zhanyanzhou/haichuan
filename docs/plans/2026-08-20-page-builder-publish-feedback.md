# 页面搭建器发布反馈与视频合同收敛实施计划

> 2026-08-20。承接 `2026-08-20-audit-recovery.md` 的工作流 1；只处理 P2-01、P2-02、P2-03，不扩展到模板批量整改或发布运行环境。

## 目标与已定边界

- 后端发布预检和实际发布返回同一份结构化问题：区块级问题必须带稳定的 `blockId`；全页、元数据问题不伪造归属。
- 编辑器不得从中文错误文案解析区块序号。发布失败后，右侧图层栏保留“上次发布检查”的可点击问题列表，点击直接选中并聚焦对应区块。
- 视频模块只暴露且只渲染合同许可的比例：桌面/平板 `16:9`、`21:6`，移动端 `4:5`、`16:9`、`9:16`。`videoWidth` 是已落地的展示层布局能力，写入合同 `allowedControls`；通用背景色是页面模块共享样式能力，不伪造为视频专属合同控制项。
- 保留旧页面的 `21:9`、`4:3`、`16:7`、`3:4`、`21:6` 历史渲染兼容；不得重新开放其新建选择项。`21:6` 不属于历史例外，已恢复为当前宽幕选择项。

## 任务 1：结构化发布问题（P2-01）

**文件：**
- 修改：`server/src/modules/page-modules/page-modules.service.ts`
- 修改：`scripts/verify-page-builder-publish.mjs`

**实施：**
1. `collectPuckDataErrors` 保留原有 `errors` 文案兼容，同时为每条区块校验错误记录产生位置、路径和区块 ID。
2. 同一商品被多个区块引用时，对每个引用区块生成可定位的公开状态问题；全页结构、数量和元数据错误保持无 `blockId`。
3. `collectPageDocumentValidation` 直接合并结构化问题，不再把字符串二次包裹为无归属问题。
4. 在静态运行脚本中先加入断言，覆盖必填图片、商品非公开和页面级问题三种归属。

## 任务 2：持久且可点击的问题清单（P2-02）

**文件：**
- 修改：`client/src/pages/admin/HomepageConfig/index.tsx`
- 修改：`client/src/pages/admin/HomepageConfig/components/LayerRail.tsx`
- 修改：`client/src/pages/admin/HomepageConfig/editor.css`

**实施：**
1. 预检失败时保存本次 error 级 `issues`；预检通过或发布成功时清空，避免把过期问题当成当前结论。
2. 图层栏显示紧凑的“上次发布检查”清单。带 `blockId` 的条目是按钮，点击调用现有选中/画布聚焦路径；全页问题显示但不可伪造跳转。
3. 删除 `publishHome` 对中文文案区块序号的正则解析，只接受后端结构化 `blockId`。
4. 使用现有后台令牌，新增最小样式，不改变主编辑器布局或拖拽行为。

## 任务 3：视频合同与实现一致性（P2-03）

**文件：**
- 修改：`contracts/page-builder/content-templates.contract.json`
- 生成：`client/src/page-builder/generated/contentTemplates.generated.ts`
- 生成：`server/src/modules/page-modules/generated/contentTemplates.generated.ts`
- 修改：`client/src/components/blocks/VideoBlock.tsx`
- 修改：`scripts/verify-content-template-contract.mjs`

**实施：**
1. 把 `videoWidth` 写入视频模板 `allowedControls`，使其可审计；保留背景色为共享样式，不制造不一致的第二份视频专属配置。
2. 删除视频渲染器中“21:9/4:3 是新建规范比例”的陈旧说明；以合同白名单决定新数据回退，并保留明确列出的历史兼容。
3. 扩展合同校验脚本，断言视频宽度控制与当前三端比例矩阵。
4. 用现有生成脚本更新派生文件，禁止手改生成物。

## 验证与停止点

按“先失败、再修复、再验证”执行：相关静态脚本、`npm run contracts:check`、`npm run test:content-templates`、`npm run test:page-builder-publish`、`npm run typecheck`。若本机已有未改动代码的可用前后端运行环境，再在真实浏览器检查“发布失败 → 清单 → 点击定位”桌面与窄屏状态；不启动或修改 Docker/数据库。

完成后回到总计划的页面搭建器合同收敛，再开始 23 模板和公开页面的只读清单审计；不把尚无产品素材、文案或业务负责人授权的内容伪造为已验收成品。
