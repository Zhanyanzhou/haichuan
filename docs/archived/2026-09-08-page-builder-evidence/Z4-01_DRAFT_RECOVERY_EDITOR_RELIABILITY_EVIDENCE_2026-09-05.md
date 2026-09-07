# Z4-01 草稿恢复与编辑器可靠性验收证据

> 日期：2026-09-05
>
> 分支：`codex/release-curation-20260814`
>
> 基线 HEAD：`abebd555a25f8bf19eb4b9f455b39166f22a1cdd`
>
> 运行时：Node.js `v22.23.2`，npm `10.9.8`
>
> 结论边界：本文件记录本地源码、生产构建与 Chromium 自有 API 夹具证据；不代表真实后端、真实数据库、真实多角色联调、生产发布或真实浏览器用户草稿验收。

## 结果

以下为初轮本地自验结果。总控随后发现另存成功后可访问来源身份 History 的缺陷，退回 R1；初轮 7 项通过不能证明另存后的身份隔离。R1 修复及新增证据见文末，整体验收交回总控复核。

- PageDocument 历史快照把正文、metadata、dirty 状态与保存基线作为一个命令回放；仅 metadata 与正文加 metadata 两类场景均可 Undo、Redo 并显式保存。
- 模板历史恢复继续使用模板编辑器同一 Session/History；读取与载入零写入，Undo/Redo 完整回放可信恢复令牌，只有显式保存才提交。
- 八向 resize 在 pointerup 时仅提交一步历史，合同最小尺寸和模块边界保持生效。
- 过时系统模板草稿的兼容修复进入持久恢复态：持续显示“修复方案尚未保存，原草稿未覆盖”，支持查看差异、取消、Undo/Redo、另存；普通保存不能绕过选择，覆盖必须再次确认。409 时保留当前修复和原草稿，成功确认后才覆盖来源，并清除不再真实的旧恢复 History。
- PageDocument 所需的精确动态模板版本从实际实例推导，并与注册表使用同一校验器。缺失或非法定义不再无限 loading，而是显示包含精确键与原因的错误页；重试恢复后可继续编辑，全程不自动写入页面草稿。

## 初轮验证记录

所有命令均在 `G:\网站搭建2\client` 执行，并直接调用 Node 22 安装路径，避免系统默认 Node 25 污染结论。

1. TypeScript：退出码 0，0 error。

   ```powershell
   & 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe' 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node_modules\npm\bin\npm-cli.js' exec tsc -- --noEmit -p tsconfig.json
   ```

2. 目标 ESLint：退出码 0，0 error，0 warning。

   ```powershell
   & 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe' node_modules/eslint/bin/eslint.js src/page-builder/template-editor/types.ts src/page-builder/template-editor/templateEditorSession.ts src/page-builder/template-editor/TemplateWorkspaceController.tsx src/page-builder/template-editor/TemplateWorkspace.tsx src/page-builder/dynamic-template-instance/registry.ts src/page-builder/dynamic-template-instance/index.ts src/page-builder/dynamic-template-instance/types.ts src/pages/admin/HomepageConfig/PageWorkspaceController.tsx src/pages/admin/HomepageConfig/index.tsx tests/template-internal-editor.spec.ts tests/dynamic-template-page-instance.spec.ts tests/editor-draft-recovery.admin.spec.ts
   ```

3. 定向 Chromium：7 passed，0 failed，耗时 50.5 秒，`admin-chromium`，`--workers=1`。

   ```powershell
   & 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe' node_modules/@playwright/test/cli.js test tests/editor-draft-recovery.admin.spec.ts tests/template-internal-editor.spec.ts tests/dynamic-template-page-instance.spec.ts --grep '历史载入作为一个命令随撤销重做完整回放并可显式保存|模板历史选择零写入、单步撤销，并只在显式保存时提交可信来源|宿主 resize 真实应用合同最小尺寸与模块边界且每次只产生一步历史|过时系统草稿的修复方案可查看|给出可恢复错误且不会写入页面草稿' --workers=1
   ```

   覆盖计数：PageDocument History 2 项、resize 1 项、系统草稿兼容恢复 1 项、模板版本 History 1 项、精确动态模板版本缺失/非法恢复 2 项。

4. 客户端生产构建：退出码 0，TypeScript 与 Vite build 通过；Vite 保留既有大于 500 kB chunk 的性能提示，不是构建失败。

   ```powershell
   & 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node.exe' 'C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation\node_modules\npm\bin\npm-cli.js' run build
   ```

5. 目标路径差异格式：`git diff --check -- <Z4-01 paths>` 退出码 0；仅输出仓库既有的 LF/CRLF 转换提示，无空白错误或冲突标记。

## 保护与未验证边界

- 未执行 `git add`、commit、push、restore、reset、clean、checkout、migration、seed、数据库命令或部署。
- 未读取 `.env` 值，未访问真实数据库、Storage、真实后端或用户浏览器标签页，未保存或刷新用户浏览器中的未保存草稿。
- 开始时工作树已有 149 条状态记录（1 staged、132 unstaged、16 untracked），均按用户资产保留；本任务只会额外增加本证据文件这一条 untracked 记录。HEAD 保持不变。
- 未运行全量 Playwright、真实 API、真实角色权限、跨浏览器、真实设备或生产演练；因此最高证据等级是本地生产构建加 Chromium 自有 API 夹具回归。

## R1：另存后的身份与 History 边界

本轮仅修复 `reconcileSaveResult` 的新身份切换以及对应反馈和测试。成功回写新身份（`asCopy` 为真，或返回的 `definition.templateId` 与请求不同）时，清空来源的 `historyPast` 和 `historyFuture`。同身份普通保存继续保留历史；请求期间出现更新的本地修改时，新副本只保存提交时的快照，来源会话、基线、History、dirty 和修复标记继续保留。成功提示明确说明“当前仍在编辑来源模板，新的修改尚未保存”。迟到结果遇到已切换的 Session 仍返回 `stale-session`。

修改前先增加 4 个浏览器回归，原实现得到 0 passed / 4 failed：普通、修复另存的两项失败于旧 `historyPast` 未清空；另存期间继续编辑的两项已通过完整状态保留断言，失败于缺少说明来源仍在编辑的提示。修复后同组 4 passed / 0 failed（34.8 秒）。另补 1 项产品 Session 边界测试，覆盖未带 `asCopy` 的 ID 变化、同身份普通保存、更新的本地修改以及已切换 Session。

新增普通与修复另存用例均验证：

- 请求前故意同时保留非空的 past 和 future；成功另存后当前模板 ID、本地 ID、remote 数据库 ID 都属于新副本，恢复标记消失，past/future 均为空，Undo/Redo 不可用。
- 在副本内编辑后，Undo 只撤销该编辑，Redo 恢复该编辑；所有可达历史快照始终使用副本身份。
- 再次显式保存仅 PATCH 新副本的 `/draft`，请求体 ID 也为副本 ID；来源没有 PUT/PATCH 请求，来源定义完全不变。
- 异步测试使用可控响应 Promise，在副本创建响应返回前通过产品 Session 注入一次本地编辑；响应返回后来源的完整状态与更新后的快照一致，Undo/Redo 仍回放来源编辑，修复场景的恢复标记保留。

R1 最终验证使用 Node.js `v22.23.2`、npm `10.9.8`，命令在 `G:\网站搭建2\client` 执行。每个 PowerShell 验证进程先执行以下进程内 PATH 设置，使 Playwright/Vite 子进程也沿用 Node 22；未修改用户或系统 PATH：

```powershell
$env:PATH='C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.23.2\installation;' + $env:PATH
```

| 验证 | 实际结果 |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | 退出码 0，0 error |
| 下方目标 ESLint | 退出码 0，0 error / 0 warning |
| 下方单 worker Chromium 组合 | 15 passed / 0 failed / 0 skipped，2.0 分钟 |
| `npm run build` | 退出码 0，TypeScript 和 Vite 通过；4453 模块，保留既有大 chunk / 插件耗时提示 |
| 根目录 `git diff --check -- client/src/page-builder/template-editor/templateEditorSession.ts client/src/page-builder/template-editor/TemplateWorkspaceController.tsx client/tests/template-internal-editor.spec.ts` | 退出码 0，仅 LF/CRLF 提示 |

```powershell
node node_modules/eslint/bin/eslint.js src/page-builder/template-editor/templateEditorSession.ts src/page-builder/template-editor/TemplateWorkspaceController.tsx tests/template-internal-editor.spec.ts

node node_modules/@playwright/test/cli.js test tests/template-internal-editor.spec.ts tests/editor-draft-recovery.admin.spec.ts tests/dynamic-template-page-instance.spec.ts --grep 'Z4-01 R1|同一母模板可选择覆盖或另存|母模板保存冲突时保留当前工作|模板保存响应迟到时保留保存期间的新修改|历史载入作为一个命令随撤销重做完整回放并可显式保存|模板历史选择零写入、单步撤销，并只在显式保存时提交可信来源|宿主 resize 真实应用合同最小尺寸与模块边界且每次只产生一步历史|过时系统草稿的修复方案可查看|给出可恢复错误且不会写入页面草稿' --workers=1 --reporter=line
```

15 项包括 R1 新增 5 项、初轮 7 项，以及既有普通另存、冲突另存、同身份迟到保存 3 项。浏览器使用自有 API 夹具，Session 边界测试调用实际产品 Store；都不计为真实后端证据。

R1 精确修改文件：

- `client/src/page-builder/template-editor/templateEditorSession.ts`
- `client/src/page-builder/template-editor/TemplateWorkspaceController.tsx`
- `client/tests/template-internal-editor.spec.ts`
- 本证据文件

R1 结束时 HEAD 仍为 `abebd555a25f8bf19eb4b9f455b39166f22a1cdd`，工作树状态仍为 150 条（1 staged / 132 unstaged / 17 untracked），与 R1 开始时相同；没有新增文件、Git 写操作或真实数据操作。最高结论为 R1 本地修复和相称回归通过，独立复核交回总控。真实 API/数据库、用户浏览器草稿、全量 E2E、跨浏览器和上线未验证。
