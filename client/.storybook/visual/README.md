# Renderer 状态检查与视觉基线

本目录渲染生产组件的隔离 Storybook 夹具，不连接真实数据库。目前覆盖 `page-hero` 与 `craft-detail`，不能代表全站设计已验收。

从仓库根目录运行：

- `npm run test:image-quality`：图片宽度、清晰度、上传字段及失败态的自动回归；属于根 `npm test` 与 CI。
- `npm run test:storybook:state`：在桌面 1440×900 与手机 390×844 两个项目分别运行真实对应设备的 Storybook 索引、长文、缺图、15:1 极端图片比例、图片解码、标题、焦点与 axe 检查。两类模板均覆盖长文、缺图和极端比例；主 CI 的 public 分区必跑，不需要截图基线。
- `npm run test:visual`：桌面和手机的像素比较。缺少已认可的基线或画面发生差异时失败，不自动建立/更新基线。
- `npm run test:visual:candidate`：仅在本地生成待审候选图到 `client/test-results/storybook-candidates/<platform>/<projectName>/`；不写入正式基线，不可在 CI 执行。

候选图需要与当前设计目标逐张比较，核对构图、图片裁切、字体、留白、长文和手机可读性。生成成功不是审美验收。获得明确认可后，才把对应 PNG 复制到本目录 `__screenshots__/<platform>/<projectName>/`，并在正常代码评审中说明认可人、对应改动及画面理由。将这些已认可的 PNG 与代码一起版本管理；不要复制 diff 或失败截图作为基线。

2026-11-09 检查到的四张旧本机截图没有可核实的认可记录，已保留原始 SHA-256 并移到根目录 `.codex-tmp/maintenance-20261109/legacy-storybook-baselines/`，其中 `manifest.json` 记录原路径和归档路径。它们不是当前认可基线，不能因为以前生成过就自动复用。

基线按操作系统和项目分开，以免不同字体渲染产生误报。使用与项目 lockfile 一致的 Playwright/Chromium 版本；另一个操作系统缺少基线时仍应失败，不能跨平台直接冒用。以后把截图比较加入 CI 前，需先提供在对应 Linux 环境生成并获认可的基线；当前 CI 状态检查通过不表示这一步已经完成。

Storybook 使用专属端口 6010，不复用人工页面会话。端口被占用时先确认占用来源，或通过 `STORYBOOK_PORT` 指定另一个专属端口。
