# 图片质量改动：第四轮独立验收

日期：2026-11-04。

结论：A—C已修复问题和测试退出问题在本轮复测范围内通过；尚不能宣布完整业务链路验收通过。新增停止脚本有一处P2路径保护缺陷，需要修正后再复用。

本轮仅阅读源码、脚本、Cursor运行记录和目标工作树状态，运行目标测试与只读进程/哈希查询，并新增本报告和独立证据。未修改业务源码、Git状态、数据库或现有服务，未操作用户登录后台和草稿，未覆盖Cursor的r4-runtime记录。

## 1. 本轮读取到的实际工作

Cursor留下了可复查的boundary、start、verify、stop和process-guard脚本，补充了by-url直接控制器/守卫/服务测试，修正了happy-dom组件测试的资源清理。

原始记录为cursor-acceptance-r4-runtime.json，生成时间2026-11-04T15:40:29.694Z，记载退出码0、10项检查通过。截图中的“16项”与本轮独立组合命令的19项不矛盾：组合命令还包括trustedMediaSize的3项。

未声称读取了完整Cursor会话或全部终端历史；审查依据是用户截图、项目内保留脚本、源码及运行记录。

## 2. 独立复跑结果

环境Node22.23.2。

- client执行：node --test responsiveUploadsImage.spec.ts imageDeliveryGeometry.spec.ts trustedMediaSize.spec.ts tests/media-picker-image-quality.unit.mjs。19项通过、0失败、0跳过，退出码0，约2.34秒自然退出。
- server执行：node --test -r ts-node/register src/modules/upload/page-media-by-url.direct.spec.ts。4项通过、0失败，退出码0，约2.90秒。
- 根目录npm.cmd run contracts:check通过；start、verify、stop脚本的node --check通过。
- 本轮未重新运行完整客户端/服务端构建和全量类型检查，不沿用旧轮结果冒充本轮新证据。

客户端仍覆盖：810×1440真实父规格在手机上建议约1171；半栏与cover几何；unknown不采信旧宽高；无缓存补读、失败重试、EXIF和迟到响应。组件测试使用happy-dom和模拟接口，不等于真实已登录后台。

清理代码先等待happy-dom abort/close、关闭测试加载后新增MessagePort，再停止esbuild和删除固定测试目录。没有process.exit或强制退出测试参数。存在3秒清理保护计时器和已关闭端口unref；本轮在该超时前自然结束。

服务端4项是直接调用控制器/守卫/服务，加内存员工查询与临时图片文件；覆盖角色、JWT守卫入口、非法地址及缺失/归档/测量失败恢复。不能称为完整Nest鉴权HTTP验收。

## 3. Cursor隔离运行记录的可信范围

本轮独立计算的UploadService、PublicUploadsGateway、PageModulesService三个dist文件SHA256，均与Cursor记录一致；Git HEAD亦一致。这只核对三个目标产物，不证明全部依赖树和部署包一致。

Cursor记录中有：
- 1920 CSS宽、2倍屏：currentSrc选择3840档，字节解码为3840×2160 WebP，645170字节。
- 390 CSS宽手机：941w描述符对应941×1672 WebP，116966字节，未冒充1200像素。
- 把cover父框手工改为700×1200后，sizes约2133px，并选择3840档。
- 默认语言和zh-CN文档均含14条媒体事实；非法rv被拒绝。
- 快照撤销授权后，缓存命中不能绕过授权。

真实服务实现参与了运行，但文档路由由Express手工注册；素材授权行和行锁来自启动时构造的内存快照，图片和派生缓存使用临时副本。未启动完整Nest AppModule，也未运行UploadService启动对账。快照撤销不证明数据库撤销传播。

本轮查询3018/5176均无监听，隔离实例已经退出，所以没有把历史JSON称为本轮独立浏览器复跑。用户3000仍是PID65740，5173仍是PID16412，与记录一致；这证明本轮未替换它们，不证明其正在运行最新功能。

## 4. 唯一新增需修项

### [P2] R4-01：停止脚本的递归删除缺少精确目录边界

位置：scripts/image-quality-acceptance/stop-isolated-read.mjs:47。

现有条件只检查state.tempRoot是否包含haichuan-image-r4-，随即执行recursive rm。目录名包含这串字符不代表目标位于系统临时目录，也不代表它属于本轮。

本轮以纯字符串探针证明：G:\\outside-acceptance\\haichuan-image-r4-unrelated同样通过现有条件，尽管它不在期望临时目录内。未创建、访问或删除这个示例路径；未运行stop脚本。

最小修复：
1. 先验证state结构、规范化绝对目标、系统临时根包含关系及本轮精确目录名；有意外符号链接/junction或边界不明时拒绝清理。
2. 校验失败应在破坏性操作前报错并停止；不得退化到模糊匹配删除。
3. 终止进程也应绑定当前仓库和本轮身份，避免只认通用脚本片段；继续保护用户3000/5173。
4. 用不实际删除的边界测试覆盖外部路径、相对路径、父级跳转和合法本轮根。

这是验收工具的安全问题，不是图片清晰度算法回退，也没有证据表明本轮发生误删。

verify还会固定覆盖原r4-runtime.json。独立重跑应支持新输出路径或先安全保全原证据；本轮未执行覆盖。

## 5. 尚未验证与排除范围

未确认可丢弃测试数据库，本轮没有执行上传、素材库回读、保存、重开、测试发布和发布后回读，也没有执行数据库支持的by-url鉴权HTTP。这些是完整业务链路的证据缺口，不应以新增直接调用测试替代。

已登录后台的双端、编辑缩放和未保存状态仍未在完整应用验收；当前用户3000/5173是否呈现最新A—C行为也未确认。

D批原图比例模式、旧模板迁移、真实首页发布、提交推送和部署不在本次范围，不因它们未做而否定本轮A—C局部结果。

## 6. 验收决定

- A—C已修缺陷的目标回归和测试正常退出：通过。
- Cursor隔离读取/图片渲染记录：边界可解释，记录与三个当前关键产物一致；本轮未重新启动复跑。
- 验收工具直接复用：先修R4-01。
- 完整后台至公开页面链路：尚未验收。
- 上线：本轮没有作上线判断。

下一步仅需修验收工具边界，并在确认可丢弃数据库后补真实业务闭环；无需推倒重做已通过的图片逻辑。

独立证据：cursor-acceptance-r4-evidence.json。原Cursor证据：cursor-acceptance-r4-runtime.json。

