# 海川珠宝 · Copilot 适配

> VS Code GitHub Copilot 自动读取。公共安全规则见 `AGENTS.md`。

---

## 语言

- 始终使用简体中文回答
- 代码保持英文规范，代码注释使用中文
- 英文技术术语格式：中文名称（English Name），禁止只输出英文

---

## 行为

- 严格遵守 `AGENTS.md` 全部规则
- 项目目录内普通开发可连续自主执行
- 高风险操作遵循 AGENTS.md 审批边界
- 不确定时先询问，不猜测

---

## 按任务读取 docs

| 任务类型         | 读取文件                       |
| ---------------- | ------------------------------ |
| 项目概况/技术栈  | `docs/PROJECT.md`              |
| 了解当前实现状态 | `docs/CURRENT_STATE.md`        |
| 系统架构/数据流  | `docs/ARCHITECTURE.md`         |
| 服务端模块       | `docs/MODULES.md`              |
| 公共组件         | `docs/COMPONENTS.md`           |
| API/数据库       | `docs/DATA_AND_API.md`         |
| 设计/样式        | `docs/UI_GUIDE.md`             |
| 技术决策         | `docs/DECISIONS.md`            |
| 开发流程         | `docs/DEVELOPMENT_WORKFLOW.md` |

> 按需读取，不要一次把所有 docs 加入上下文。

---

## Skill 使用

- 视觉/布局/响应式/交互任务 → `.agents/skills/taste-skill/SKILL.md`
- 管理后台只参考 Skill 中的信息层级、色彩对比度、响应式和无障碍部分
- 禁止对整个项目做全局视觉大改
- Skill 参考 `docs/UI_GUIDE.md` 的品牌规范

---

## 路径别名

- `@/` = `client/src/`
