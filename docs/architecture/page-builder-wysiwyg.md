# 【已废止】页面构建器所见即所得架构

> [!CAUTION]
> 本文是 2026-08-06 的旧 `PageModule/PageModuleVersion + iframe postMessage` 方案，仅保留历史参考，**不具执行力、不得按本文实施或恢复旧架构**。当前页面装修唯一采用 Puck `PageDocument/PageDocumentRevision`，现行边界见 `PROJECT_RULES.md` §7、`docs/architecture/page-builder-boundary.md` 与 `contracts/page-builder/content-templates.contract.json`；页面角色限制只认机器合同 `pageRules`。

> **HC-PAGE-BUILDER-WYSIWYG-21**
> 版本：MVP Phase 2-3
> 日期：2026-08-06

---

## 一、编辑器整体架构

```
┌──────────────┬──────────────────────┬──────────────┐
│  左侧面板     │      中央画布          │  右侧面板     │
│  (200px)     │    (iframe 预览)       │  (300px)     │
│              │                       │              │
│  模块列表     │  /preview/home        │  编辑表单     │
│  · 点击选中   │  ← postMessage →     │  · 内容/布局  │
│  · 上移下移   │    MODULE_HOVERED     │  · 设置       │
│  · 复制删除   │    MODULE_SELECTED    │  · 保存/发布  │
│  · 添加模块   │    CANVAS_READY       │              │
│              │    PATCH_MODULE       │              │
└──────────────┴──────────────────────┴──────────────┘
│                      顶部工具栏                          │
│  桌面1440 | 平板768 | 手机390 | 刷新 | 一键发布           │
└─────────────────────────────────────────────────────────┘
```

## 二、左中右三栏职责

| 区域 | 职责 |
|---|---|
| 左侧 | 模块列表、选中高亮、上移/下移/复制/删除/显示/隐藏、添加模块 |
| 中央 | iframe 加载 HomePreview（草稿模块）、hover 轮廓、click 选中、postMessage 通信 |
| 右侧 | EditPanel（内容/布局/设置Tabs）、保存草稿、发布 |

## 三、ModuleRegistry

当前支持模块：

| type | label | schemaVersion | 渲染器 |
|---|---|---|---|
| hero | 首屏主视觉 | 1 | HeroSection |
| doublePoster | 双图海报 | 1 | DoublePosterSection |
| singlePoster | 单图海报 | 1 | SinglePosterSection |

## 四、数据模型

**PageModule (Prisma):**
- `id, pageKey, moduleType, sortOrder, isVisible`
- `status`: DRAFT | PUBLISHED
- `content`: Json — 模块内容
- `publishedContent`: Json? — 已发布快照
- `layoutConfig`: Json — 布局配置
- `styleConfig`: Json — 样式配置
- `version`: Int — 版本号

**PageModuleVersion:** 发布时自动创建快照

## 五、编辑器状态 (Zustand)

`client/src/store/pageBuilderStore.ts`

| 字段 | 说明 |
|---|---|
| selectedModuleId | 当前选中模块 |
| hoveredModuleId | 当前悬停模块 |
| modules | 模块列表 |
| viewport | desktop/tablet/mobile |
| editorMode | edit/preview |
| isDirty | 是否有未保存修改 |

## 六、iframe 通信

**预览页 → 父页面:**
| 消息 | 触发 |
|---|---|
| CANVAS_READY | 预览加载完成 |
| MODULE_HOVERED | 鼠标悬停模块 |
| MODULE_SELECTED | 点击模块 |

**父页面 → 预览页:**
| 消息 | 触发 |
|---|---|
| PATCH_MODULE | 模块内容更新 |

## 七、草稿保存

1. 右侧表单编辑
2. PUT /page-modules/draft
3. 刷新模块列表
4. iframe reload（previewKey++）

## 八、正式发布

1. 保存草稿
2. PUT /page-modules/publish
3. 后端创建 PageModuleVersion 快照
4. DRAFT → PUBLISHED
5. 前台读取 PUBLISHED 模块

## 九、前台渲染

- `GET /page-modules/published?pageKey=home` (Public)
- `MODULE_MAP` 映射 moduleType → React 组件
- 没有已发布模块时 fallback 到硬编码首页

## 十、响应式

- 单份内容数据，多端布局
- 桌面1440 / 平板768 / 手机390 切换
- 设备间共享：标题、正文、商品引用、按钮链接
- 允许设备差异：模块高度、内容位置、间距

## 十一、权限

- 管理员认证 (JwtAuthGuard)
- 编辑/保存/发布均需登录
- 公开接口无需认证

## 十二、安全

- 富文本过滤
- 链接协议校验
- postMessage origin 校验
- 后端 Schema 验证

## 十三、当前未支持能力

- 拖拽排序
- 撤销/恢复 (undo/redo)
- 编辑/预览模式切换
- TEXT 模块（下一阶段）
- PRODUCT_COLLECTION 模块
- 全局导航/页脚编辑
- 版本历史回滚
