# 公开页面自动无障碍检查

这是已接入的测试使用说明，验收标准仍以 `UI_GUIDE.md` 和根 `WORKFLOW.md` 为准。

## 运行

使用项目规定的 Node 22.x，在 `client/` 执行：

```powershell
npm run test:a11y
```

测试复用现有 Playwright 配置和隔离测试服务端口，不需要启动真实后端。

结果在 `client/playwright-report/index.html`；每个扫描状态附有完整 axe JSON，包含违规节点、原因及需要人工复核的 `incomplete` 结果。后续 Playwright 运行可能覆盖该报告，需要留档时先保存本次必要证据。查看交互报告可在 `client/` 执行 `npx playwright show-report`。

## 覆盖与边界

- `tests/public-accessibility.spec.ts` 属于 `public-chromium`，覆盖桌面和手机上的联系表单、错误状态、隐私页与菜单，并检查键盘操作和焦点恢复。视口、用例和 axe 规则以该测试文件为准。
- 自有 API 通过 Playwright 路由夹具提供数据，非 GET API 请求中止；这些结果仅证明该夹具下的页面行为，不能替代真实接口、真实数据、读屏器测试或整站无障碍验收。
- 任一违规让用例失败；软断言允许同一用例完成后续状态扫描，不会把违规变成通过。

接入方式依据 [Playwright 官方无障碍测试指南](https://playwright.dev/docs/accessibility-testing)。自动化只能覆盖部分问题，视觉和实际操作体验仍需人工验收。

## 首次运行记录（2026-09-05）

安装及测试接线已完成；4 个用例均因 `color-contrast` 失败，页面质量尚未通过本项检查：

| 状态 | 桌面违规节点 | 手机违规节点 |
| --- | ---: | ---: |
| 联系页初始状态 | 6 | 6 |
| 联系表单错误状态 | 6 | 6 |
| 隐私页 | 1 | 1 |
| 品牌菜单打开 | 2 | 1 |

这是各状态内的节点数，不能相加作为去重后的缺陷数；菜单打开时扫描整个当前页面。此表只保留首次发现的 serious 对比度问题，整改状态以重新运行后的报告为准。
