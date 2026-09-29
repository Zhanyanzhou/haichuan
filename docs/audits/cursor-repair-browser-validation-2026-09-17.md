# Cursor 修复复验报告：店铺装修、模板目录与公开首页

> 日期：2026-09-17  
> 环境：本地 Real 模式，客户前台 `http://127.0.0.1:5173/`，管理后台 `http://127.0.0.1:5173/admin/editor/home`，服务端 `http://127.0.0.1:3000`  
> 验证方式：真实浏览器只读检查 + Node.js 22 类型门禁 + 定向 Playwright route-Mock 回归  
> 当前结论：**未通过，暂不应视为修复完成。** 存在 1 个构建阻断、1 个移动端关键视觉问题、1 组模板目录素材问题。

## 1. 给 Cursor 的结论摘要

| 编号 | 级别 | 问题 | 当前状态 |
| --- | --- | --- | --- |
| F-01 | 阻断 | Node.js 22 下 TypeScript 检查出现 8 个错误，客户端构建门禁无法通过 | 待修复 |
| F-02 | 高 | 首页 Hero 在 390×844 移动端裁掉图片内嵌标题；公开页、页面装修画布、最新模板预览均可复现 | 待修复 |
| F-03 | 中 | 页面模板库中两个已发布模板卡片显示“素材加载失败”，且卡片内没有图片节点 | 待修复 |

本报告只记录问题和验收标准。检查期间没有点击保存、发布、升级模板，也没有改动页面数据或数据库。

## 2. F-01：TypeScript 构建门禁失败

### 2.1 复现命令

在 `client/` 目录使用项目要求的 Node.js 22：

```powershell
$node22 = 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe'
& $node22 '.\node_modules\typescript\bin\tsc' --noEmit -p tsconfig.json
```

结果：退出码 `1`，共 8 个 TypeScript 错误。由于客户端构建脚本先执行 `tsc --noEmit`，这一项已经足以阻断构建；本轮没有把类型失败误报成构建通过。

### 2.2 错误清单

1. `client/src/page-builder/dynamic-template-instance/DynamicTemplateInstanceInspector.tsx:995`
   - `TS2322`：把 `(() => void) | undefined` 传给要求 `() => void` 的字段。
   - 相关调用为 `resolvePublishIssueReviewAction(...)`，需要在类型和运行时行为之间保持一致，不能仅用非空断言压过错误。

2. `client/src/page-builder/dynamic-template-instance/unauthorizedSlotContent.ts:50`
   - `TS2352`：把通用 `Record<string, unknown>` 直接断言为 `TemplateDefinitionV2`，两个结构缺少足够重叠。
   - 应复用项目现有合同校验或增加明确的结构守卫，不能用双重断言绕过不可信数据检查。

3. `client/src/page-builder/inspector/SchemaInspectorPanel.tsx:1207`
   - `TS2322`：与第 1 项相同，可选回调被传给必选回调字段。

4. `client/src/page-builder/template-editor/TemplateEditorLibrary.tsx:602`
5. `client/src/page-builder/template-editor/TemplateEditorLibrary.tsx:614`
   - `TS2322`：`unknown` 不能赋值给 `number`。
   - 当前 `Number.isInteger(value.version)` 没有把 `unknown` 缩窄为 `number`；需先做 `typeof value.version === 'number'` 等真实类型守卫。

6. `client/src/page-builder/template-editor/TemplateNativeDesignControls.tsx:526`
7. `client/src/page-builder/template-editor/TemplateNativeDesignControls.tsx:561`
8. `client/src/page-builder/template-editor/TemplateNativeResponsiveControls.tsx:158`
   - `TS7053`：当前断点联合类型仍可能是 `tablet`，但被索引的标签或选项映射只声明了 `desktop`、`mobile`，部分映射另含 `system`。
   - 应先核对现行断点合同和 `tablet` 的实际生命周期，再统一类型、映射和 UI 行为。不要为了消除报错直接删掉合同中的断点或用宽泛字符串索引。

### 2.3 修复约束

- 不使用 `as any`、双重断言或非空断言掩盖真实分支。
- 可选回调应在调用方显式判空，或由被调用函数正式接受可选回调并定义无回调时的行为。
- 来自存储、接口或事件的模板对象仍按不可信输入处理，保留运行时守卫。
- 断点类型必须与当前合同及现有 UI 一致；如 `tablet` 已不在 UI 中，也需确认它是否仍用于历史数据兼容。

### 2.4 验收标准

- 上述 Node.js 22 `tsc --noEmit` 命令退出码为 `0`。
- 正常客户端构建门禁通过，且没有降低 `strict`、跳过文件或关闭相关规则。
- 发布问题复核按钮、模板事件读取、响应式设计控件均进行一次定向回归。

## 3. F-02：移动端 Hero 图片内嵌标题被裁切

### 3.1 复现位置

使用实际 CSS 视口 `390×844`，以下三个位置均可观察到标题不完整：

1. 客户前台首页 `/`。
2. 管理后台 `/admin/editor/home` 的页面装修移动端画布。
3. 模板设计中最新已发布模板“首页首屏 v12”的只读放大预览，切换到移动端后仍发生裁切。

现象不是轻微边缘截断：当前画面只能看到图片内嵌标题的局部字样，例如“共映”，在 v12 预览中甚至只剩“恒”等片段，完整文案语义已经丢失。

### 3.2 已确认事实

- 当前页面实例固定使用 `hcHomeHero v10`，目录显示存在 v12 升级。
- v12 自身的移动端只读预览也有同类裁切，因此仅升级版本不能解决问题。
- 当前页面素材尺寸为 `1672×941`，宽高比约 `1.78`；界面提示桌面推荐 `1920×1080`，移动端推荐 `4:5`。
- 移动端使用填充裁切并以约 `50% / 50%` 为焦点。标题已经烘焙在图片中，随图片一起被裁掉。
- 页面没有 DOM 横向溢出，现有响应式用例也能通过；所以只断言 `scrollWidth` 或元素边界不能发现这类“图片内语义内容被裁掉”的问题。

### 3.3 建议修复边界

优先采用以下任一可靠方案：

- 为移动端提供真正适配的 `4:5` 素材，确保人物、珠宝和完整标题都位于安全区；或
- 将标题和辅助文案从位图中拆出，改为可响应式排版的 HTML 文本，图片只承载摄影画面。

若暂时沿用同一张横图，至少需要可独立配置的移动端素材或移动端焦点，并以完整文案和主体是否可见为验收依据。只调整容器高度、继续使用居中 `cover`，很可能仍会在其他窄屏裁掉文案。

修复时不要自动升级当前页面的 v10 实例，也不要替用户保存或发布。先修复模板/素材并生成可验收的新版本；页面实例升级、保存和发布属于后续明确操作。

### 3.4 验收标准

- 在 `390×844` 下，公开首页、页面装修移动端画布、最新模板移动端预览都能看到完整标题、核心主体和 CTA。
- 在 `375×812`、`390×844`、`430×932` 至少三个常见窄屏尺寸复核，无语义性裁切、无横向滚动。
- 桌面端构图不退化。
- 增加针对移动素材/安全区的回归覆盖；断言不能仅限于 DOM 无溢出。
- 若采用 HTML 文案，需同时验证可访问名称、对比度、换行和缩放表现。

## 4. F-03：两个已发布模板卡片显示“素材加载失败”

### 4.1 复现路径

1. 打开 `/admin/editor/home`。
2. 进入页面装修的模板库。
3. 查看以下两个已发布模板卡片：
   - `hcHomeBespoke` / “首页高级定制 v5”
   - `hcHomeCollection` / “首页精选作品 v5”

两张卡片稳定显示“素材加载失败”；关闭再打开预览后仍可复现。浏览器检查时，受影响卡片内没有 `<img>` 节点，而其他页面模板卡片可以正常加载。

### 4.2 建议排查范围

- 模板目录返回的预览模型及对应媒体引用是否完整。
- 媒体资源是否已注册、URL 是否可访问、授权检查是否误拦截目录只读预览。
- 模板卡片和放大预览是否使用了相同的 Renderer/素材解析链路。
- 缓存是否保留了已经失效的素材身份，删除或重新发布后是否正确失效。

不要用静态占位图永久遮盖错误，也不要把加载失败静默当成成功。可以保留清晰失败态，但正常已发布模板必须展示真实可用预览。

### 4.3 验收标准

- 两个模板在页面装修模板库中都不再显示“素材加载失败”。
- 卡片缩略图和只读放大预览均正常，关闭后重新打开仍可加载。
- 刷新页面和清空该目录的应用级缓存后结果一致。
- 使用故意失效的测试夹具时，失败态仍能正确出现，不因修复而吞掉真实错误。
- 不改变当前公开首页其他区块，也不自动写入页面实例或发布数据。

## 5. 已通过项目：修复时不得回归

### 5.1 真实浏览器与服务状态

- `http://127.0.0.1:3000/api/ready` 返回 HTTP 200。
- `http://127.0.0.1:5173/api/ready` 返回 HTTP 200。
- 真实后台会话可以打开 `/admin/editor/home`；检查时页面显示“已发布”和“页面草稿已保存”，撤销/重做不可用。
- 页面装修与模板设计之间可以切换；检查过程中未点击保存、发布或模板升级。
- 页面装修模板库正确隐藏咨询类起步模板，模板设计库仍展示它们。
- 已退役的 `tpl_hero` 测试样本未出现在真实模板库。
- 最新已发布模板的交接和升级入口可以出现。
- 客户前台桌面端最终渲染出 7 张图片，图片自然尺寸完整。
- 移动端菜单可以打开、关闭并正确取得焦点；页面无 DOM 横向溢出。
- 排除浏览器控制工具自身注入脚本后，没有观察到应用来源的控制台错误或警告。

### 5.2 定向 Playwright 回归

Node.js 22 下共执行 17 条定向用例，全部通过：

- 9 条：admin 目录缓存身份、删除/归档失效、页面/设计模式过滤、发布后交接、旧实例升级。
- 6 条：公开首页读取状态、预渲染文档校准、767/768/1023/1024 px 边界响应式。
- 2 条：admin 超级管理员直接发布 UI、已发布页面产生修改后的再次发布。

这些是 route-Mock 浏览器测试，只证明确定性 UI 流程；不能替代真实后端、数据库写入或正式发布验证。

## 6. 给 Cursor 的复验命令

全部在 `client/` 目录执行：

```powershell
$node22 = 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe'

& $node22 '.\node_modules\typescript\bin\tsc' --noEmit -p tsconfig.json

$env:PLAYWRIGHT_PORT = '5181'
& $node22 '.\node_modules\@playwright\test\cli.js' test tests/published-template-catalog-cache.unit.ts tests/template-lifecycle-unification.admin.spec.ts --project=admin-chromium --grep '目录身份只认|归档或删除按 templateId|移除后的目录身份|页面装修目录预览|页面装修模板库不展示|页面装修与模板设计都不展示|发布后切到页面装修|页面已有模块时刚发布|页面已有旧实例时刚发布'

$env:PLAYWRIGHT_PORT = '5182'
& $node22 '.\node_modules\@playwright\test\cli.js' test tests/site-maturity-foundation.spec.ts tests/responsive-public.spec.ts --project=public-chromium --grep '首页公开读取期间|预渲染首页在接口校准前|首页在 (767|768|1023|1024)px'

$env:PLAYWRIGHT_PORT = '5183'
& $node22 '.\node_modules\@playwright\test\cli.js' test tests/editor-draft-recovery.admin.spec.ts --project=admin-chromium --grep '超级管理员草稿不显示分步审核|已发布页面产生本地修改后可直接发布'
```

完成代码修复后，还需要用真实浏览器重新执行 F-02、F-03 的人工验收；现有 17 条测试无法证明位图内文案没有被裁切，也无法证明真实目录素材已经恢复。

## 7. 明确不要做的事情

- 不要 `reset`、`clean`、`restore`、`rebase` 或覆盖当前未提交修改。
- 不要自动升级 `hcHomeHero v10` 页面实例，不要替用户保存或发布。
- 不要为通过 TypeScript 而放宽类型、关闭严格检查或使用 `any` 掩盖分支。
- 不要在没有核对历史数据兼容性前删除 `tablet` 合同。
- 不要用永久占位图或吞错逻辑伪装模板素材加载成功。
- 不要追查本轮浏览器工具注入脚本产生的 `MutationObserver.observe` 参数错误；CDP 已确认它来自无 URL 的浏览器控制注入脚本，不是项目代码。

## 8. 修复完成判定

只有同时满足以下条件，才可把本轮问题标记为完成：

1. F-01 的 Node.js 22 类型和客户端构建门禁通过。
2. F-02 在真实公开页、真实页面装修画布和最新模板预览中通过三个移动端尺寸验收，桌面无回归。
3. F-03 的两个真实已发布模板卡片和放大预览恢复，同时保留可验证的失败态。
4. 本报告列出的 17 条定向回归继续全部通过。
5. 排除浏览器工具注入脚本后，没有新增应用来源的控制台错误或警告。
6. 对“代码修复完成”“内容已保存”“页面已发布”“正式上线”分别给出证据，不得互相替代。
