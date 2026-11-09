# Cursor 图片质量改动独立验收

日期：2026-11-04。结论：REWORK / 需返工，A—C尚未闭环。
范围：当前工作树代码、纯函数/网关测试、隔离浏览器公开GET、实际MediaPickerField组件夹具。没有修改业务实现，没有上传、保存、发布或数据库写入。D批未获批准，不将它未实施列为缺陷。

## 1. P1：图片元数据未接到实际公开接口

定位：
- server/src/modules/page-modules/page-modules.controller.ts:62
- server/src/modules/page-modules/page-modules.service.ts:1160、:2226
- client/src/utils/responsiveUploadsImage.ts:36

公开 document/published 无论是否传locale都调用getLocalizedPublishedPageDocument；该方法成功响应没有mediaFacts。新增readPublishedImageFacts只挂在另一getPublishedPageDocument方法。客户端缺facts就不生成srcset，因此实际公开页面退回原图。

真实GET与DOM证据：
- 默认locale与显式zh-CN的公开响应均无mediaFacts。
- 1920宽DPR2首图srcset为空，实际下载3840×2160原PNG，9041795字节。
- 390宽DPR3首图srcset为空，实际下载941×1672原PNG，2232719字节。
- 独立Playwright再测1440、390、767、768均观察到缺srcset、直出原PNG；页面有多图，自动选中的具体图片可不同，不将不同文件字节混为同图比较。
- 此前同一首图派生WebP为415454字节，手机同图派生为116966字节。当前直出原图分别约为此前21.8倍、19.1倍。不同像素档位比较不代表视觉质量相同，但明确证明分发回退。

建议：将同一个受控事实解析接到真正公开的本地化读取成功路径，保留发布资格、素材授权及撤销检查，补默认locale与显式locale入口回归。不能只重启服务或只测helper。

## 2. P2：模板设计的手机默认图按桌面规则计算

定位：
- client/src/page-builder/template-editor/TemplateDefaultContentControls.tsx:114
- client/src/page-builder/fields/MediaPickerField.tsx:107、:157

手机默认图片分支没有传device；MediaPickerField默认shared，清晰度计算将其映射为desktop。

实际组件夹具（原组件、合成媒体元数据和中性图，无后端写入）：
- 同一941×1672图、810×1440设计规格、9:16框，漏device显示“810宽、2倍屏，建议源宽约1621”。
- 传mobile显示“390宽、3倍屏，建议源宽约1171”。

建议：从真实当前编辑端传递device，覆盖手机独立图和继承图；测试模板设计调用入口，不只测试手动传mobile的纯函数。

## 3. P2：半栏图片会低估需求并误报像素够用

定位：
- client/src/page-builder/config/imageDeliveryGeometry.ts:42
- client/src/page-builder/template-creation/generateTemplateFromRecipe.ts:206

referenceDeliveryFrame将小于1200的设计推荐宽直接当作目标CSS宽。50%图片在1440设计画布的推荐宽是720；对应1920参考页面实际应为960，2倍屏需约1920源宽。当前仍按720×2=1440判断。

组件夹具已复现：1600×900源图、720×405设计规格、16:9框，被标成“建议源宽1440，当前像素够用”。

建议：显式区分设计尺寸、相对槽位占比和参考视口下的真实框，不能加另一个阈值猜测；补1440设计→1920参考视口的半栏集成用例。上述1920参考需求是本轮方案既定目标，不能用另一目标宽度证明它足够。

## 4. P3：无本地元数据缓存时，现有图片可一直待检测

定位：
- client/src/page-builder/fields/MediaPickerField.tsx:42、:148
- client/src/page-builder/fields/SharedPageMediaPicker.tsx:84、:106

当前字段只读localStorage素材缓存，没有自动获取所选素材事实的任务。共享素材库仅打开时才列表回填。

组件夹具中图像已加载成功，但无缓存元数据的字段仍为loading，显示“原图像素待检测”。这没有伪报够用，但新浏览器、旧缓存和历史已选图片的提示未闭环。

建议：当前选中图片经受控只读路径获取元数据；成功、失败、未知状态均明确可恢复，不能要求运营先打开素材库才完成所谓检测。缓存只作初值，不能充当长期唯一事实源。

## 5. 运行版本尚未通过验收

隔离浏览器当前服务：
- width=480&rv=2：200；
- width=480&rv=999：仍200；
- width=3840&rv=2：404。

当前源码明确拒绝非法rv且允许3840。运行版本或代理链与源码不一致，需核对启动产物/进程/代理；本轮未擅自重启用户服务，不能据此把运行时404归因为源码3840白名单遗漏。

即使加载新后端，第1项本地化接口漏接仍然存在，重启不能代替修复。

## 6. 已通过部分

- 客户端候选与几何纯测试：9/9，Node22.23.2，退出0。
- 服务端转码与网关目标测试：16/16，退出0。
- 主任务新鲜复跑两端typecheck：均退出0。
- 主任务新鲜复跑contracts:check：通过，schema v3，合同SHA前缀829234be9442。
- 底层已修不放大小图、成功输出真宽、噪声JPEG不回不同几何原图、EXIF方向、动画拒绝静态派生、3840档和rv解析、缓存策略版本。
- 没有发现本轮把缓存置于授权检查之前；此结论来自代码和目标测试，不是生产撤销验证。
- D.52文案已区分明确必填与可选标题；未发现擅自实施D批原图模式。

单元测试使用内存/response double，组件夹具只验证真实组件计算与状态，均不能替代登录后台、真实上传、持久化或页面发布。

## 7. 未通过/未覆盖的验收

- 实际公开路径未用上新的响应式分发，故不能验收3840实际选中、941末候选真实生效或完整cover选图。
- 767/768做了公开GET抽样，但没有把它们算成编辑器连续几何稳定性通过。
- 未在用户编辑器中操作；没有验证67%画布缩放、未保存会话与交互状态。
- 未进行上传→素材库→保存→重开→测试发布→公开回读的真实闭环，未确认可丢弃数据库。
- 未重跑完整生产构建；本轮已有明确功能失败，不用重复构建掩盖它。
- 未验证冷缓存并发资源、代理/CDN、生产资格撤销或上线状态。

## 8. 给Cursor的返工指令

    请以本报告为验收结论，继续原A—C任务，不重做整个方案：
    1. 修复实际本地化公开接口的mediaFacts接线，补默认locale与显式locale入口测试。
    2. 修复模板设计手机图片device传递，以及半栏设计尺寸到参考显示框的换算。
    3. 补齐现有图片无本地缓存时的受控元数据检测。
    4. 核对隔离验收环境实际加载的新后端与代理，验证3840和非法rv响应。
    5. 用真实公开DOM和响应解码证明srcset、实际像素与下载体积；补缺失回归。
    保留已有未提交修改，不扩做D，不发布当前真实首页，不写未知数据库。
    交付区分本地实现、真实联调和未完成验收，不以typecheck或构建替代闭环。

## 9. 证据

结构证据见cursor-acceptance-evidence.json。原始诊断和截图在：
- .codex-tmp/image-quality-acceptance-20261104/browser-observations.json（从仓库根看）
- .codex-tmp/image-quality-acceptance-20261104/public-1440-dpr2.jpg
- .codex-tmp/image-quality-acceptance-20261104/public-390-dpr3.jpg

组件夹具为原组件+中性SVG路由及合成元数据，不是后台真实联调；只使用它的DOM文本/状态证据，不将夹具无样式的排版用于产品视觉评价。
