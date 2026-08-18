---
name: figma-design-to-code
description: 海川珠宝 Figma 设计转代码适配层，也是调用 get_design_context 前的强制前置 Skill。用户要求实现、移植或还原 Figma 页面、组件、节点时使用；先遵守当前官方 Figma Skill 和工具 Schema，再把设计证据适配到海川现有 React/Vite、Puck、组件和设计规范。前台功能页只配合 design-taste-frontend，Hero/系列/编辑影像才追加 luxury-visual；后台使用 UI_GUIDE 附录 A 与 ADMIN_COPY_GUIDE。
---

# 海川 Figma 设计转代码适配层

> 官方 Figma Skill 和当前工具 Schema 负责工具调用协议；本 Skill 只负责海川项目的路由、实现边界和验收，避免复制会变化的 MCP 参数与返回格式。

## 1. 方向与工具前置

- 仅用于从 Figma 读取设计并实现到代码；向 Figma 写入内容使用对应的官方生成或编辑 Skill。
- 调用 `get_design_context` 前，先加载当前环境提供的官方 Figma design-to-code Skill，并按工具的当前参数要求执行；不可用时说明限制，不猜测参数。
- 写代码前必须取得目标节点的设计上下文；截图和 metadata 可用于定位或校验，但不能替代设计上下文。
- 缺少节点级 URL、选择范围或访问权限时，先取得必要输入；不得根据整份文件猜测目标节点。

## 2. 项目预检

开始前读取当前事实，不把 Skill 中的技术栈描述当成永久版本：

- `client/package.json`、`client/tsconfig.json` 和 Vite 配置。
- 目标页面、邻近组件、共享布局、设计令牌和数据接口。
- `docs/UI_GUIDE.md`；后台任务追加 `docs/ADMIN_COPY_GUIDE.md`。
- Puck 任务追加当前 `client/src/page-builder/`、`components/blocks/`、Schema、适配器和公开渲染链。

## 3. 任务路由

- **客户前台功能页**：使用 `design-taste-frontend`，以信息、任务、响应式和可访问性为先；搜索、隐私、账户、表单和服务流程不自动加载摄影规则。
- **Hero、系列专题、品牌故事、编辑影像**：使用 `design-taste-frontend`，并追加 `luxury-visual` 做艺术指导。
- **管理后台**：使用 `docs/UI_GUIDE.md` 附录 A 与 `docs/ADMIN_COPY_GUIDE.md`；不套用前台大留白、衬线功能字和摄影动效。
- **Puck 编辑器**：编辑器壳层按后台规则；画布内公开内容预览按前台规则。设计不得绕过现有模板合同、Schema、适配器或渲染器另建第二套数据来源。

## 4. 从设计证据到实现

1. 把设计上下文、截图、Code Connect、注解和 token 当作证据，不把生成代码直接粘贴为最终实现。
2. 优先复用项目现有组件、布局、字段、数据流和 token；视觉相似但业务语义不同的组件不得强行复用。
3. 将 Figma token 映射到项目 token；原始 hex、绝对定位和固定像素只作为设计意图线索，不自动成为生产规范。
4. 图片、图标和字体先核对来源、授权、真实性和持久化方式。临时远程资源不能作为正式发布依赖；未经授权不得下载并提交第三方品牌资产。
5. 保留设计的层级、比例和交互意图，同时补齐 loading、empty、error、success、focus、权限和响应式状态。
6. Figma 与已批准项目规范冲突时，记录差异和影响范围；未经确认不修改品牌系统、业务合同或权限边界。

## 5. 验收

- 在真实浏览器中对照 Figma 截图和 `docs/UI_GUIDE.md` 检查目标桌面与移动视口。
- 核对字体和图片真实加载、内容顺序、裁切、横向溢出、键盘焦点、主要交互和异步状态。
- Puck 任务追加拖入、编辑、保存、重载、设备预览与公开渲染一致性验证。
- 运行与改动相称的类型检查、测试和构建；构建通过不能代替视觉验收。
- 交付时说明设计忠实项、项目适配项、与 Figma 的有意差异、验证结果和未验证项。
