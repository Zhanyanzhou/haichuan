# 图片质量改动：第三轮独立验收

日期：2026-11-04。结论：上轮两项代码缺陷在标准入口和组件实测层面关闭；A—C整体运行验收仍未完成。
本轮只读调查执行内容和当前实现；仅新增诊断/验收产物，未改业务代码、未重启服务、未上传保存发布或写数据库。D批仍不在范围内。

## 1. 本轮实际读取范围

- 用户提供的Cursor完成截图。
- Cursor留下的docs/research/image-quality-2026-11-04/cursor-acceptance-r3-runtime.json。
- 当前相关源码、目标diff线索，以及新增测试的实际实现。
- 内置聊天工具recent/history均未列出截图中的“Image quality and frame plan”会话，因此没有声称读取了完整Cursor聊天、完整终端历史或全部命令。
- 未在项目允许范围内找到生成该运行JSON的源脚本；不能判断它替换/代理了哪些启动、Prisma、授权或网关环节。既不猜成完整真实联调，也不猜成全Mock。

## 2. 它这轮做了什么

### 2.1 代码修复

1. MediaSpec新增designCanvasWidth，保留换框前槽位设计宽。1440×810换成9:16时，上传规格仍810×1440，但设计基准仍1440。
2. 新designCanvasWidthOnDevice把1440桌面槽位设计宽换到390手机设计基准；MediaPickerField不再直接把810上传短边当成显示宽。
3. 新trustedMediaSize统一补读、上传结果、素材库和缓存的可信尺寸规则：unknown不采信；缺状态时不拿裸width/height冒充展示尺寸。
4. 服务端文件头读取失败时清除展示尺寸并明确unknown；原数据库宽高保留作旧字段，不再充当已测量事实。
5. 新增真实组件的happy-dom测试，以及缺失/破损/EXIF等服务端文件头测试。

主要入口：
- client/src/page-builder/fields/mediaSpec.ts:27、:68
- client/src/page-builder/config/imageDeliveryGeometry.ts:42
- client/src/page-builder/fields/MediaPickerField.tsx:269-286
- client/src/page-builder/fields/trustedMediaSize.ts:23-51
- server/src/modules/upload/upload.service.ts:958-980
- client/tests/media-picker-image-quality.unit.mjs
- server/src/modules/upload/page-media-read-facts.spec.ts

### 2.2 新测试实际覆盖

客户端新增测试确实挂载真实MediaPickerField，输入来自mediaSpecMatchingFrame(1440,810,'9:16')，不再只手工喂390。
但它使用happy-dom和模拟接口方法返回值；源码中的routeMock名称不等于已做真实HTTP路由/鉴权联调。父编辑器/页面装修入口主要由源码正则与静态接线核对，未完整挂载整个登录编辑器。

服务端新测试创建临时图片文件，实际覆盖文件缺失、破损、EXIF6文件头等行为；这比仅测试常量更强，但没有执行真实上传、保存或发布。

### 2.3 Cursor隔离运行记录

历史JSON记载前端5175、API3017、Node22.23.2、进程标记acceptance=r2/PID69596，并记录：
- 默认语言和zh-CN公开文档返回媒体事实；
- 3840档响应解码为3840×2160 WebP；
- 手机941源图选择描述符941，解码为941×1672 WebP；
- 手工将父框改成700×1200后，sizes变约2133px，选择3840档；
- blockedWrites=0，以及216条Prisma读动作名称。

记录能支持“该隔离运行记录中的观察”，不能单凭health字段证明完整Nest、未被替代的授权/网关/缓存、真实数据库提交或写入闭环。
手工改变父框证明的是组件对cover几何变化的响应，不等同于保存后模板的真实作者路径验收。

## 3. 主任务独立浏览器复测

使用独立headless Edge、真实Vite模块中的MediaPickerField、中性图片与自有GET route-Mock；没有使用用户登录或草稿，没有真实上传保存发布。

六个面板均已运行并保留DOM文本和状态：

- 真实810×1440父规格：显示上传推荐810×1440、模板基准1440、手机设计参考390×693；按390宽3倍屏，建议约1171。原2431错误已消失。
- 显式同一设计基准对照：仍为约1171。
- 半栏720：换算960 CSS宽，1600源图提示不足，建议约1920。
- 无缓存：自动GET补读，得到941×1672，状态ready，无需先打开素材库。
- 初次503后点击重试：第二次GET成功，状态ready。
- unknown加旧3840×2160：保持factsState=unknown，清晰度写“还不能确认原图是否够用”，不再good，也不显示“当前像素够用”。

这里的unknown对应quality/loading不应误读为已经检测通过；本轮只确认没有再伪报够用。完整后台加载/状态设计不在该夹具的视觉验收范围。

结论：
- R2-1手机素材规格混入显示几何：在当前标准调用链及实际组件文案层面关闭。
- R2-2未知元数据被旧宽高覆盖：在补读、缓存规则及组件失败态层面关闭。
- 没有发现这两项的确凿产品逻辑遗留，不要求再次推倒重做。

## 4. 仍未通过的检查

### 4.1 新增组件测试进程未正常退出

复核者执行：
    cd client
    node --test responsiveUploadsImage.spec.ts imageDeliveryGeometry.spec.ts tests/media-picker-image-quality.unit.mjs

12项纯函数、1项父调用静态断言、3项组件子用例均打印ok；after已清理临时bundle目录。但超过一分钟仍未出现最终summary与正常退出，复核者仅中断自己的该测试进程，退出1。

因此该命令不能记为整体通过，也不能以加process.exit、forceExit、删用例或跳过测试解决。应定位新增测试的残留句柄、DOM/计时器/MessageChannel或其他异步资源，正常释放后重新运行，保留最终summary及退出0。

这是一项测试收尾问题，不能据此反推两个产品逻辑修复仍然失败。主任务的独立真实浏览器组件夹具已正常结束、退出0。

### 4.2 隔离记录目前不能完整复跑，当前使用页面也未生效

本轮独立检查：
- 5175前端：ECONNREFUSED。
- 3017 API：ECONNREFUSED。
- 当前5173公开首页响应仍无mediaFacts；
- 当前DOM首图srcset/sizes为空，currentSrc仍为原PNG；
- 当前经5173请求3840&rv=2仍404；
- 本轮非法rv探测超时，不沿用旧200结果冒充本轮实测。

隔离临时服务退出本身不构成代码缺陷，但源脚本缺失使本次无法重建它并核对替代边界。不能据历史JSON认定当前3000/5173已换新，也不能把隔离接口结果提升为完整真实联调。

下一阶段须保留可复跑的启动和验证脚本，明确完整应用/真实数据库/只读代理/桩各自参与范围。应在已授权、隔离且不会误写常用库的环境完成真实读取验证，不擅自停止用户服务。

## 5. 本轮新鲜验证结果

- 客户端纯函数：responsiveUploadsImage.spec.ts、imageDeliveryGeometry.spec.ts、trustedMediaSize.spec.ts，15/15，退出0。
- 服务端：page-media-read-facts.spec.ts、page-document-localization.spec.ts、responsive-public-media.spec.ts、public-uploads.gateway.spec.ts，37/37，退出0。
- 上述happy-dom组合命令：断言ok，未正常退出，不计整组通过。
- 主任务独立浏览器组件GET夹具：六场景，命令正常退出0。
- 两端typecheck：退出0。
- contracts:check：通过，schema v3、SHA前缀829234be9442。
- 本轮未重跑完整生产构建，不将Cursor截图中的构建自报当主任务新鲜构建证据。

## 6. 未执行/不能宣称完成

- 当前用户3000/5173运行环境实际加载新实现。
- 完整Nest、授权读取、策略磁盘缓存和代理/CDN的隔离运行闭环。
- 新by-url端点真实HTTP角色鉴权。
- 可丢弃数据库上的上传→素材库→保存→重开→测试发布→公开回读。
- 已登录编辑器的双端、67%缩放、未保存会话保护。
- D批原图比例模式、旧模板迁移及上线；这些未获本轮扩大授权。

## 7. 下一步建议

停止重复修改已关闭的两项功能逻辑，进入验收收尾：
1. 让新增组件测试正常清理并退出，保留完整结果。
2. 保留可重复启动的隔离验证脚本，明确哪些链是真实、哪些被替代。
3. 在允许的隔离环境运行新实现，复核公开GET、srcset、真实响应解码及HTTP授权。
4. 有确认可丢弃的数据库后再做写入闭环；没有时明确未完成，不把它降格成可选项或伪报已完成。

不需要为D批尚未实施而返工本轮A—C，也不应为制造全绿而削弱测试或授权校验。

证据：cursor-acceptance-r3-evidence.json（主任务本轮），cursor-acceptance-r3-runtime.json（Cursor历史记录，原样保留）。
