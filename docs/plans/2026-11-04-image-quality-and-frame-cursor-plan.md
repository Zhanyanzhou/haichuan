# 海川图片清晰度与成品图画幅：Cursor 实施交接方案

> 日期：2026-11-04（Asia/Shanghai）。状态：调查与实施建议，尚未实施。
> 用户请求：深入检查奢侈品牌图片处理与海川现状，形成可交给 Cursor 的方案。
> 本轮仅新增此交接文档和脱敏证据；未修改业务代码、源合同、现行决策、数据库或公开内容。
> 本文不是产品规则，也不自动授予实施、Git 写入、数据库、部署或发布权限。用户将执行指令交给 Cursor 后，以该指令的实际范围为准。

## 1. 主推荐与交付结果

在现有上传、受控素材服务、动态模板和 Puck PageDocument 上增量完成五个批次：

1. A：修正源尺寸元数据、响应式候选真实宽度和派生缓存语义。
2. B：按实际显示几何选择图片，补足 3840 档，照顾横图裁进竖框的场景。
3. C：后台清晰度、裁切风险、设计尺寸分开提示，修正文案与 D.52 的冲突。
4. D：增加明确选择的“按原图比例”成品图模式。此批需用户批准产品取舍后实施。
5. E：相称的真实接口、持久化和浏览器闭环验收；复用既有验收矩阵，不新建项目台账。

首批技术修复不更改已有模板画幅、不自动换图、不自动迁移页面。标准画幅继续用于有统一版式要求的内容；成品图模式用于需要保全已完成构图的单主图区块。

本次不推荐：取消全部上传限制、向所有设备发送原图、统一把 quality 提到 100、引入新 CDN/付费服务、开放 AVIF/SVG 上传、全局重构 Renderer、删除所有文字能力或重做 23 套历史模板。

## 2. 本轮证据与边界

### 2.1 已确认的实际问题

**F1：大屏候选上限低于现有原图能力。**

本地公开首页首屏原文件 3840×2160。1440 CSS 宽、DPR 2 时下载 2880×1620 WebP，符合该显示条件；1920 CSS 宽、DPR 2 时仍下载 2880×1620，而相应需求为 3840×2160。当前 2880 最高档限制了大屏细节，不能据此推断所有视觉模糊都由它引起。

入口：
- client/src/utils/responsiveUploadsImage.ts:10、:15
- server/src/modules/upload/responsive-public-media.ts:7
- client/src/page-builder/template-definition/DynamicTemplateRenderer.tsx:641

**F2：候选宽度描述符与实际文件宽度不一致，真实 HTTP 已复现。**

手机冷启动首页：390×844、DPR 3，首屏图片框约 390×693.328，使用独立手机图。原图 941×1672，当前候选 URL 为 width=1200，srcset 标 1200w，但响应文件解码只有 941×1672。原图本身也低于此场景约 1171px 的目标宽度。系统不放大小图是正确行为，错误在于仍把它声明成 1200w，以及没有准确区分素材不足。

主任务另以当前函数纯内存复现：
- 200×100 PNG，请求 480，返回 200×100 WebP；
- 固定种子噪声生成的 1000×500 JPEG，quality 5，请求 480，因输出体积判断而返回原始 1000×500 JPEG；
- EXIF orientation 6 的 200×100 JPEG，派生显示尺寸变为 100×200。

第二条证明：只截掉超过原图宽度的候选还不够，服务端“转码体积更大就回原图”也会破坏宽度声明。

入口：
- server/src/modules/upload/responsive-public-media.ts:21
- server/src/common/media/image-content-validation.ts:17
- client/responsiveUploadsImage.spec.ts:47

**F3：cover 的候选选择缺少实际绘制宽度。**

resolveTemplateImageSizes 对首屏和手机直接返回 100vw，没有用源图比例和框高度计算 cover 实际铺开的宽度。横图填竖框时，框宽并不是图像的绘制宽度。

调查期间曾取到横图 3840×2160 在 390×693.328 竖框内用 1200×675 派生图 cover 的结果。但随后冷启动稳定回读使用了独立竖图 941×1672，无法确定前一次是切换瞬态还是内容变化。该横图取样只作为诊断线索，不认定为当前手机页的稳定根因。必须另用可控夹具和无手机图的真实测试草稿验证。

静态代码缺口与数学风险已确认：横图继承时，有效绘制宽度约 1232.58 CSS px，DPR 3 所需源宽约 3697.75；100vw 只给浏览器 390 CSS px 的提示。增加 3840 档而不修 sizes，仍可能选到 1200。

**F4：尺寸建议与高倍屏需求没有接通。**

生成器用设计画布/区域宽高生成 recommendedWidth/Height；MediaPickerField 以建议值的 75% 判不足，并对继承图抑制提示。mediaSpecMatchingFrame 沿旧建议长边换算比例，不能代表实际框和高清目标。现行规格已经建议桌面全幅源图 2880、手机 1170，但数据流没有一致兑现。

入口：
- client/src/page-builder/template-creation/generateTemplateFromRecipe.ts:206
- client/src/page-builder/fields/mediaSpec.ts:39
- client/src/page-builder/fields/MediaPickerField.tsx:124
- docs/page-builder/section-template-standard.md:548

**F5：派生策略变化不会更新现有宽度缓存。**

内存 key、ETag、磁盘名称使用源指纹和宽度，未包含转码策略版本。改格式、quality、旋转或尺寸回退语义后，旧派生结果仍可能复用。仅给磁盘 key 加版本，也不能让已被浏览器长期缓存的同 URL 自动更新。

入口：
- server/src/modules/upload/upload.service.ts:744、:783
- server/src/modules/upload/public-uploads.gateway.spec.ts:155

**F6：“随内容”与“按原图比例”不是同一能力。**

根随内容时，生成器仍给图片槽写固定 aspectRatio 和图片节点比例高度；Renderer 在图片节点 auto 时还会使用槽位比例，img 默认 width/height 都是 100%。手机还有首屏框和比例派生。只把节根改 auto，无法实现成品图满宽、保全构图、自然增高。

入口：
- client/src/page-builder/template-creation/generateTemplateFromRecipe.ts:73、:205
- client/src/page-builder/template-definition/DynamicTemplateRenderer.tsx:475、:691
- client/src/page-builder/template-definition/mobileWorkGrid.ts:167、:222

**F7：后台提示与当前产品决定有冲突。**

DynamicTemplateInstanceInspector 的“图片已含标题”仍提示“标题仍要填写”。D.52 已允许影像类成品图不填可见标题，但仍保留作者明确必填槽的承诺。应按实际槽位要求提示，不能把所有旧模板都改成无条件可空。

入口：
- client/src/page-builder/dynamic-template-instance/DynamicTemplateInstanceInspector.tsx:996
- docs/DECISIONS.md:614

### 2.2 正常能力与不应误判的限制

- 1440×810 是设计参考及画幅，不是上传像素上限；普通上传保留原始字节。
- 现有硬限制为文件 10MB、总像素 25MP、单边 12000。3840×2160 在像素范围内，仍需满足文件大小。首批保持这些安全限制。
- 普通图片槽已使用 srcset/sizes；后台 hostFetch 使用受控 blob，与公开图片分发不同。
- 底层 node.rules.backgroundImage 的 CSS 背景直接读原 URL；不能因为中文槽名叫“背景图片”，就认定走的是该 CSS 路径。
- 裁切端点存在 1920×1920 上限，但当前检索到的客户端调用是模板目录封面编辑。没有证据表明它在压低当前公开首屏原图。
- 透明 PNG 派生 alpha 在子代理纯内存试验中保留；没有发现强制铺白。
- GIF 当前不走响应式派生。动画 WebP 会进入派生，子代理试验中两帧变一帧；首批采用动画直出、保留现有动画，不顺带设计动画转码系统。
- EXIF 显示方向必须归一化；现有登记宽高不能无条件当成显示宽高。
- 浏览器 naturalWidth 是经像素密度修正的 CSS 固有尺寸。本轮 2880 文件可读出 naturalWidth=1440。验收必须解码响应字节，不能用 naturalWidth 或 URL width 参数替代真实物理像素。

### 2.3 品牌样本借鉴范围

上一轮隔离浏览器已观察梵克雅宝中国站：
- 首屏桌面 4000×2000 视频，手机切换独立 1126×1920 视频和备用图；
- picture/source 提供多宽度和 1x/2x/3x；
- 标题、说明和行动文字是 HTML；
- 一张编辑图桌面响应 5000×5000、约 4.65MB，手机响应 1050×1050、约 115KB。品牌站也可能过量下载，不照搬其档位数量和文件体积。

卡地亚上一轮浏览器观察到 picture 的屏幕宽度分支及 sw 图片转换参数。本轮 web 抓取该站返回 403，因此不将它作为新增可访问性或性能结论。

可借鉴：高分辨率母图、按显示需求派生、双端艺术构图、真实网页文字与成品图并存。公开前台不能证明品牌内部 CMS 的上传要求、母图压缩或审核流程。

## 3. 执行前基线与保护

2026-11-04 检查时 Node 22.23.2、已安装 sharp 0.35.5；已有 Playwright、TypeScript 和 Sharp，无需新依赖。工作树有大量已有修改；前后端 2400/2880 档、quality 86 和关联测试本身就是未提交修改。

Cursor 开始时：
1. 读 AGENTS.md、WORKFLOW.md、PROJECT_RULES.md §7 及本任务相关产品合同；检查简洁 status 和目标 diff。
2. 核对本方案符号、脚本、合同哈希与运行结果仍适用。行号是定位线索，以当前符号为准。
3. 先划清重叠目标文件，在用户已有修改上增量实施；不 restore/reset/clean，不整文件替换，不迁移历史数据。
4. 不接管人工 5173 页面、已登录浏览器或未保存 Puck 草稿。测试前端沿当前配置隔离，默认 development 5176、Mock 5177，端口冲突时用 PLAYWRIGHT_PORT 单独指定。
5. 默认不提交、不推送、不部署、不发布当前首页，不安装或升级依赖。若用户另行精确授权，再执行对应动作。

相关现行决定：
- D.46—D.49：双端几何、作者手机值优先、首屏媒体框、沿用及未保存会话保护。
- D.51：固定画幅按双端标准比例驱动，历史定义不静默迁移。
- D.52：成品图不因可选文字为空被拦，明确必填仍生效。
- 本计划不得恢复已退役页面角色或平行模板来源。

## 4. 批次 A：真实源尺寸、候选语义与缓存

### A1. 贯通元数据，但不建立第二份内容源

现有上传/素材列表 DTO 已有 width/height；SharedPageMediaPicker 和本地素材映射丢弃了它们。复用受控素材事实源和已有请求流程，提供显示方向归一化的 width、height、页数/动画标识、素材 revision 等运行元数据。EXIF 6/8 等旋转方向须交换显示宽高；动画取 pageHeight 或等价单帧显示高度，不把多帧叠加的总高度当画面高度。

建议目标：
- server/src/modules/upload/upload.service.ts：上传、素材列表、受控读取与派生缓存
- server/src/common/media/image-content-validation.ts：元数据语义
- client/src/services/api.ts：PageMediaAsset 兼容字段
- client/src/page-builder/fields/SharedPageMediaPicker.tsx、pageMediaLibrary.ts、MediaPickerField.tsx
- client/src/page-builder/config/mediaSlotContract.ts、DynamicTemplateRenderer.tsx

公开 Renderer 所需元数据须从已经经过公开资格过滤的媒体事实源/公开文档响应兼容传递。media-publication-manifest.ts 可作为追踪公开资格的入口，但它不是现成的前端元数据 API；不得直接把内部 manifest 行全部暴露。选择最小现有响应接线，不新建任意 URL 图片探测接口，不先下载完整母图才能选派生图。

显示元数据不写进 template 的推荐画布尺寸，不复制图片内容到另一份 Puck 状态。历史缺值可只读解析文件头并按源 revision 缓存；首批不要求数据库 schema/migration 或批量回填。无可用元数据时保守单 src，状态为“待检测”，不能凭空宣称高清足够。外链、blob、受控后台预览保持原边界，禁止服务端代抓任意外链。

### A2. 宽度参数作为上限，w 描述符标实际输出

保留“不放大小图”。推荐确定为：
- 派生目标宽度 = min(允许的请求档位, 归一化源图宽度)。
- 前端候选描述符 = 实际派生目标宽度，不直接照抄 URL 参数。
- 去重相同输出宽度：941 宽源图可有 480w、800w，末候选用允许的 width=1200 请求、标 941w；不继续列 1680/2400/2880 等重复结果。
- 200 宽源图只需一个标 200w 的有效候选，即使请求参数为 width=480。
- 这样无需开放任意宽度参数，也无需强迫末候选下载体积很大的原 PNG。
- 源图比最高档更大时，只输出策略上限内候选，不默认补一个超大原图候选。
- 明确区分源码像素与模板框比例，所有宽高使用同一 EXIF 显示方向语义。
- 元数据、候选 URL 和实际响应必须绑定同一源 revision。page-assets 内容哈希 URL 可复用这一身份；legacy 可变 URL 必须以源指纹/revision 使尺寸与候选同步失效，不能拿旧941宽元数据配新源文件。源版本缺失时保守回退，不能只加转码策略版本就认为一致。

服务端取消“转码后字节更多就返回不同几何原图”。可比较相同目标几何的编码结果，但成功候选不能换成另一宽度。若转换失败，要有明确可测试的错误/回退通道：客户端最多一次移除 srcset 回原 src，原 src 仍经过现有授权；不可无限重试，不把授权拒绝降级成公开访问。

动画 WebP/GIF 保持动画与授权路径，不列虚假的静态响应式候选；AVIF、SVG、视频不顺带扩大上传能力。

前后端宽度集合首批可以继续各自小数组，但必须增加真正读取两端定义的一致性测试，不能再与第二份硬编码数组比较。如果采用项目已有生成流程统一来源，只能在已核对的合同源增加最小策略，避免引入新配置系统。

### A3. 缓存版本覆盖服务端和浏览器 URL

- 将派生策略版本纳入内存 key、in-flight key、ETag、磁盘名称。
- 受控响应 ETag 应由实际源 revision、目标宽度、策略版本一致导出；条件请求覆盖 200/304。
- 对可能长期缓存的公开 URL，候选请求也带固定策略版本参数，由服务端验证为当前支持版本；不使用任意随机参数，不因版本错误创建无限缓存。
- 保留原 URL、现有引用和原文件；旧客户端仍可按既有兼容路径读取，不要求清理全部用户缓存。
- 缓存命中之前仍核对受控素材当前授权/撤销/完整性；缓存不得绕过业务资格。
- 策略升级不靠删除源图或批量清理未知文件完成。

通过条件：941 原图末候选标 941w、响应宽 941；1000 源请求 480 成功时响应宽 480；小图不放大；策略升级不复用旧派生内容；授权撤销后缓存不能继续公开。

## 5. 批次 B：按绘制几何选择清晰度，并补大屏

### B1. 一个小型共享几何函数

输入：源显示宽高 Ws/Hs、图片内容框 CSS 宽高 Bw/Bh、objectFit、作者图片缩放。输出：有效绘制宽度、原图可提供的像素密度、裁切程度和参考需求。

    R = Ws / Hs
    cover 绘制宽度 = max(Bw, Bh × R)
    contain 绘制宽度 = min(Bw, Bh × R)
    原图比例自然增高 = Bw
    参考所需源宽 = 有效绘制宽度 × 目标 DPR
    原图可提供密度 = Ws / 有效绘制宽度

作者设置的真实图片放大须只计算一次；编辑器 67% 画布缩放不得计入，公开布局本来包含的 transform 也不能重复相乘。

传给 sizes 的是有效 CSS 宽度，不能先乘 DPR；浏览器会结合设备 DPR 再选候选。允许 cover 下 sizes 大于框宽或 100vw，它表达整个图像的绘制宽度。

首轮优先使用可信源元数据和既有布局规则得到合理初值；必要时只读 ResizeObserver 细化。观察结果只更新选图参数，不回写模板、不改盒子高度、不触发 ResizeObserver 几何反馈。候选升级去重，避免抖动、重复下载和频繁降档。图片换源、双端切换和卸载必须清理旧观察和迟到响应。

### B2. 加入 3840 档，并保留流量约束

同步：
- client/src/utils/responsiveUploadsImage.ts
- server/src/modules/upload/responsive-public-media.ts
- client/src/page-builder/config/mediaSlotContract.ts
- DynamicTemplateRenderer.tsx 的 resolveTemplateImageSizes / ManagedTemplateSlotImage
- 两端参数白名单、一致性测试、单 URL helper 和缓存版本

3840 主要覆盖 1920 CSS 宽的 2 倍屏，以及已有高分辨率横图 cover 竖框的需求。手机竖图、半栏图仍应选合适小档。源图不足时不得 upscaling 假装修复。

首批沿用高档已有质量策略，先用实际珠宝细节与含字图核验，不同时大幅更改压缩质量。记录各视口下载字节，验证手机没有统一下载 3840 或原 PNG。

现有 in-flight 只对相同素材同档去重，不等于全局并发限制。对 1/2/4 个不同冷缓存任务记录延时、RSS/峰值及失败率，再按可核验部署资源决定是否增加小型有界转码队列；不能用 25MP 输入上限推断总内存安全，不在本任务迁移基础设施。没有部署资源证据时，只声明本地验收，不声明上线容量达标。

CSS background 的原图路径单独核对实际使用范围；不把普通 ImageSlot 全部改成 CSS 背景，不为一个中文名称做无依据的迁移。

通过条件：
- 足够的 3840 原图，在 1920 CSS 宽 DPR2 时可实际下载 3840 档；
- 390×约693、16:9 横图 cover 的可控场景，其 sizes 基于约1233 CSS 宽；足源时覆盖约3698像素需求；
- 独立竖图按竖图自身几何选图，源941不足时如实提示，不伪造1200w；
- 1440/390/767/768/1920 与重复切换均无尺寸振荡或状态串端。

## 6. 批次 C：让运营能独立判断

页面上分开呈现三个信息：
1. “画框比例 / 设计参考尺寸”：说明模板怎样排版，1440×810 不作为上传上限。
2. “原图实际像素”：使用媒体事实源的显示尺寸。
3. “清晰度与构图”：分别告诉运营像素是否足够、是否有裁切风险。

示例（文案随真实值变化）：
- 设计参考：1440×810，16:9。
- 原图：3840×2160。
- 高清参考：本框按1920宽2倍屏展示，建议源宽3840。
- 手机原图941×1672：适合当前构图；按390宽3倍屏检查，像素偏低，建议源宽约1171。
- 沿用横图：注明“沿用桌面图”，并按手机实际框重新检查；不要一律抑制清晰度与裁切提示。
- 像素够但裁切较多时，提示换手机专用图或在已允许的构图选项中调整，不能只显示“适合”。

后台默认使用项目既有参考视口和桌面2倍/手机3倍目标；不随运营电脑的DPR变化而反复改变判断。数字只作清晰度建议，不能保证摄影锐度或未裁掉文字；系统不声称可自动识别所有含字图的安全区。

MediaSpec 区分画框和像素建议，不把现有 recommendation 值盲乘2/3。普通低分辨率提示不扩大为保存/发布硬门禁；继承、恢复继承、清空和页面必填仍按现行合同。

“图片已含标题”提示按实际槽位必填/可选处理：可选可留空；模板明确承诺为必填时解释原因。不得把图片含标题开关偷偷用于改变几何。

通过条件：同一图片在不同框或两端得到可解释的不同提示；页面/模板双端切换、撤销、重开后读数一致；不留下空文字高度；不修改用户原内容。

## 7. 批次 D：成品图按原比例完整显示（待批准产品取舍）

### 7.1 建议决定的精确内容

建议用户批准以下范围，随后由 Cursor 在当时下一个可用稳定决策编号登记：
- 新增显式“按原图比例”模式，首次只用于可流式排版的单主图成品图区块，复用现有 sectionRole、ImageSlot、Repository、Puck 和 Renderer。
- 固定画幅继续执行 D.51；旧定义缺新字段保持现有行为，不全局放开任意固定比例。
- 成品图模式图片随容器宽度等比增高，桌面/手机分别读取当前生效素材的真实比例；缺手机图则沿用桌面图及其真实比例。
- 完整展示优先，成品图可高于一个视口；该模式不强制套手机9:16、不裁整节、不机械交换比例数字。超长图显示预计高度与人工检查提示，不自动切图。
- 可选文字为空按D.52收起；有图下文字时自然参与流式排版。首批不支持在任意原图比例上叠加自由定位文字。
- 由模板设计者启用；页面运营只消费模板允许的选项，不增加全局几何编辑权。
- 不自动把“图片已含标题”映射成此模式，不把换图变成改变母模板布局。
- 页头叠加、首个可见主舞台、h1、图片替代文本及真实链接继续按现行产品要求验收。

本轮未修改 DECISIONS 或合同。A—C 可先实施，D 在明确批准前保持为设计建议，不得把“交接计划已存在”解释成已批准规则。

### 7.2 批准后的落点与兼容链

先检查现有结构是否能无歧义表达该模式；不足时在 contracts/page-builder/template-definition.schema.json 增加最小兼容字段。字段缺省必须保留旧行为；不得直接手改 generated 文件。批准后最小同步 docs/page-builder/section-template-standard.md §6.0/6.4、template-creation-rules.md、store-decoration.md 对应条款及稳定决定：原图比例仅是此显式模式的运行时来源比例，不开放任意固定画幅，也不改变768px内容端点。

需要贯通：
- 生成器/母模板选项：只在满足单主图和流式前提时给出选项。
- 根、舞台、图片节点、槽位规则：原图模式不再被旧固定比例回填。
- renderPlan / templateDimensions / mobileWorkGrid / Renderer / CSS：识别明确模式，避免进入旧手机配对和强制主视觉框。
- 使用真实源宽高预留空间，img 使用 width:100%、height:auto；contain 放进固定框不等于原图模式。
- 页头、下一节位置、缺图和错误回退：无拉伸、无固定框残留、无空内容带，加载前后无明显位移。
- 保存序列化、服务端校验、版本采用与页面实例：新值可保存、回读、预览、公开渲染；丢字段不能被静默当成成功。
- 明确转换预览、取消零写入、确认一步撤销；不在打开或保存时自动重跑创建配方。
- 历史固定/hero-media-frame/缺省策略保持原貌。母模板新版本只按D.43/D.49沿用可保留的草稿；无法保留的整份草稿停留旧版，其他独立对象继续。已公开页仍等发布页面才变化，未保存会话不被刷新盖掉。

源元数据优先作为同一媒体事实的运行时派生，不把每张图像素复制进 PageDocument。确有必要持久化新选项时，必须同步源合同、生成器、两端类型、校验、序列化与采用兼容路径。

## 8. 批次 E：验收矩阵与交付标准

### 8.1 目标自动化

复用并补充以下入口，新增文件必须按当前 Playwright 配置登记边界：
- client/responsiveUploadsImage.spec.ts：描述符真宽、源尺寸截断去重、版本参数、query保留、真正跨端一致性。
- client/src/page-builder/config/mediaSlotContract.ts 对应测试：sizes 不重复乘DPR、元数据缺失、首图优先级、外链/blob回退。
- 建议新增图片几何纯函数测试：横图cover竖框、contain、半栏、作者缩放、独立手机图、继承图、源不足、EXIF归一化。
- server/src/modules/upload/public-uploads.gateway.spec.ts：3840白名单、非法/重复width、HEAD/304、撤销授权后不命中公开缓存。
- 建议新增 server/src/modules/upload/responsive-public-media.spec.ts：200源请求480、噪声JPEG回退案例、EXIF、alpha、动画绕过、成功输出真宽、失败恢复。
- 现有缓存测试按当前结构补：策略升级、同key去重、失败后重试、源revision变化。不要建立大范围缓存重构。
- 触D时复用 template-recipe-generator.spec.ts、template-recipe-renderer.spec.ts、template-media-history.unit.ts、template-native-responsive.admin.spec.ts、dynamic-template-page-instance.spec.ts 和服务端实例测试。
- hero-image-upload-frame.unit.ts 的“长边换比例”不能替代显示几何和高清需求测试。

浏览器关键场景：
1. 1440×1000 DPR2、1920×1080 DPR2：3840原图，核对 currentSrc、解码像素、字节和实际显示框。
2. 390×844 DPR3：足够竖图、941宽竖图、无手机图继承16:9横图分别验证；不能混为同一结果。
3. 767与768内容端点反复切换；1024平板、844×390矮横屏核对裁切与页头。
4. 半栏、卡片、Logo：小框不统一请求最大档；仅实施D时另验长图按原图比例无裁切/拉伸。
5. 慢加载、图片失败、元数据缺失、迟到请求：旧响应不覆盖后选图片，布局稳定，回退不泄露未授权素材。
6. 后台67%与100%缩放、桌面/手机切换：提示不受编辑器视觉缩放污染；连续几何读数稳定。
7. 若实施D：旧模板重开、取消转换、一步撤销、新模式保存回读、页面公开渲染、模板版本沿用和未保存会话保护。

每条图片断言至少保留：视口、DPR、实际src/currentSrc、源显示尺寸、响应解码尺寸、Content-Type、响应字节、CSS框、fit、sizes、截图。读响应字节用Playwright response.body加Sharp metadata或等价同源解码；naturalWidth不能替代。

### 8.2 真实链路

受控夹具验证确定性几何与失败态；另在已确认可丢弃的本地测试环境，使用中性自有测试素材走上传→素材库回读→模板/页面草稿保存→重开→测试页面发布→公开回读。图中的按钮须有真实可达链接，alt/h1遵守D.52。

确认数据库目标与隔离方式后才运行需要写入的闭环。不得用当前用户模板或真实首页当测试资产，不在未知常用库执行发布写入。没有可用隔离环境时，A—C的本地实现可交付，但真实持久化/发布验收必须标未完成。

本地浏览器 GET 来自 /api/page-modules/document/published 的已发布文档，本轮没有Mock路由拦截；它不证明生产、后台上传或真实MySQL写入。基线单测使用内存/response double，不是上述闭环。

### 8.3 本轮已跑基线与后续命令

本轮Node22.23.2实际执行：
- client目录：node --test responsiveUploadsImage.spec.ts，6/6通过。
- server目录：node --test -r ts-node/register src/modules/upload/public-uploads.gateway.spec.ts，9/9通过。
- 根目录：npm.cmd run contracts:check，通过；动态模板schema v3，19种节点、11种槽位，当前SHA前缀829234be9442。
- 纯内存诊断脚本已复核F2/EXIF，不写数据库或HTTP。脚本在临时目录，核心种子与步骤保留在伴随证据中。

这些绿色基线未覆盖F1—F7，不是修复通过。当前源码的客户端测试注释仍称Node25，实际本轮Node22.23.2已可运行该TS测试；不能据注释切换项目验证基线。

Cursor按实际修改运行：
- 根目录 npm.cmd run typecheck:client、npm.cmd run typecheck:server。
- server目录目标转码/网关/缓存测试；client目录候选与几何目标测试。
- 影响前端运行逻辑时跑客户端build，影响后端实现时跑server build。
- 修改源合同后先 npm.cmd run contracts:generate，再 npm.cmd run contracts:check；产品决定变化再跑 npm.cmd run test:decision-governance。
- 几何/模板变化用 admin-chromium 的上述目标用例，运行前核对文件仍被登记。公开端新增用例放入 public-chromium；不要仅按文件名猜project。
- 共享Renderer/Inspector或发布生命周期变更按WORKFLOW由未参与实现者只读复核。
- 最终git diff --check只针对本任务目标，不把既有失败或修改归入本次成果。

## 9. 回退与风险

- 不删除原图、不批量覆盖已发布模板，不做数据库迁移；派生策略可切回旧版本引用，旧字节不靠清空未知目录恢复。
- D采用缺省兼容和显式新模式；若发生兼容缺陷，停止新模式使用并保留已有页面版本，不能全库反向迁移。
- 当前941宽手机图的细节不能由代码重新创造。代码应准确选图和提示；若要求覆盖该框3倍屏，需重新导出或提供约1171宽、相同比例的真实高清素材，不能用插值放大假装达标。
- 不把无严格源图条件的“高清”当硬保证；摄影对焦、原始压缩、字大小、屏幕和网络也影响观感。
- 冷缓存资源、代理/CDN缓存、生产授权撤销效果和真实写入闭环本轮未验证，不外推上线状态。

## 10. 可直接交给 Cursor 的启动指令

以下是待用户发送的实施指令，不代表本轮已执行：

    请阅读 docs/plans/2026-11-04-image-quality-and-frame-cursor-plan.md，
    在保护当前未提交修改、未保存草稿的前提下，按A、B、C批次实施，
    并完成E中与这些批次相称的目标测试和浏览器验收。
    先复核实际源码与证据，避免只加3840或只改根auto。
    保留原图、既有模板画幅、手机独立图与继承语义、授权和发布边界。
    不提交、不推送、不部署，不发布当前真实首页，不对未知数据库写入。
    D批“按原图比例”是待批准的产品建议，本条不授权改变D.51等现行决定；
    不因D待定而停止A—C独立工作。
    验收必须读取响应实际像素，报告本地实现、真实联调与未完成项。

若用户决定同时实施D，另行明确发送：

    我批准本方案第7.1节的成品图模式取舍：
    保留固定画幅旧行为，新增显式按原图比例完整展示的单主图模式，
    桌面/手机按各自生效图片比例，允许完整图高于一屏；
    不自动迁移已有模板或公开页。
    请记录对应稳定产品决定，最小同步权威规则与源合同，
    然后完成D及E的兼容、保存回读和公开渲染验收。
    数据库目标、生产、当前真实首页发布及Git写入仍不在授权内。

## 11. 证据与官方参考

- 本轮脱敏结构证据：../research/image-quality-2026-11-04/evidence.json。
- 前轮浏览器采样：../../.codex-tmp/luxury-image-audit/browser-evidence.json、wide-screen-evidence.json。临时路径可清理，关键数字已转录本文件及本轮证据。
- 可重复纯内存反例：1000×500×3 RGB，seed=12345；每字节seed=(seed*1664525+1013904223)>>>0，取seed>>>24；Sharp jpeg quality5，再调用现有resizePublicImageBuffer请求480。当前返回19713字节原JPEG1000×500。
- [梵克雅宝中国站首页](https://www.vancleefarpels.cn/cn/zh/home.html)
- [卡地亚美国站首页](https://www.cartier.com/en-us/home)
- [MDN 响应式图片与艺术构图](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images)
- [MDN naturalWidth 的像素密度修正语义](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/naturalWidth)
- [MDN img 的 srcset/sizes 属性](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img)
- [Sharp resize/withoutEnlargement](https://sharp.pixelplumbing.com/api-resize/)
