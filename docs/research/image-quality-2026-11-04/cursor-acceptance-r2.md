# 图片质量改动：第二轮独立复验

日期：2026-11-04。结论：REWORK，尚不能整体验收通过。
本轮只读核对当前代码、目标测试、公开GET与隔离组件夹具；没有改业务代码、重启服务、上传、保存、发布或写数据库。D批仍不在范围内。

## 1. 上轮问题逐项结论

- 原P1：公开locale接口漏接mediaFacts——当前源码与入口目标测试已修复；运行中的页面尚未验证生效。
- 原P2：手机图片提示——device已补传，但实际用户结果仍错误，见本报告R2-1。
- 原P2：半栏需求低估——标准1440设计基准路径已修复，并由实际组件夹具复核。
- 原P3：无缓存一直等待——正常补读及失败重试已接通并由组件夹具复核；未知元数据仍被误判，见R2-2。
- 运行版本——仍阻断真实公开页面验收，见第4节。

## 2. R2-1 / P2：手机素材规格仍被当成显示几何

定位：
- client/src/page-builder/template-editor/TemplateDefaultContentControls.tsx:116、:123
- client/src/page-builder/fields/MediaPickerField.tsx:265
- client/src/page-builder/config/imageDeliveryGeometry.ts:54
- 页面装修对应的DynamicTemplateInstanceInspector.tsx:725也需同步核对

这轮确实补传了device=mobile，但父组件仍用mediaSpecMatchingFrame(1440,810,'9:16')产生810×1440规格。MediaPickerField把spec.width直接传给designWidth，新参考换算在手机上计算810/390×390=810，继而乘3倍屏。

真实原组件夹具结果：
- 按真实父组件转换得到的810×1440规格：941×1672图显示“按810宽、3倍屏检查，建议源宽约2431”。
- 同图在正确390宽参考下：建议约1171。
- 两项事实状态均为ready，差异来自尺寸语义，不是图片加载或设备漏传。

应修复：明确区分上传推荐像素、模板设计基准、实际画框几何和参考显示视口，不能继续拿长边换算后的素材规格当手机CSS宽。模板设计和页面装修同时接同一计算语义，按实际框计算cover需求。
不要用一律截到390来掩盖问题：半栏、作者缩放、横图cover竖框仍需各自真实几何。

必要新增回归：从真实父组件调用产生810×1440输入，最终仍按390宽3倍屏检查；不要只在纯函数测试中手工传入designWidth=390。还应覆盖手机继承与页面装修入口。

## 3. R2-2 / P2：未知元数据被旧数据库宽高覆盖成“当前像素够用”

定位：
- client/src/page-builder/fields/MediaPickerField.tsx:108-124
- client/src/page-builder/fields/SharedPageMediaPicker.tsx 的元数据映射
- server/src/modules/upload/upload.service.ts:969-980、素材项width/height返回

补读目前采用displayWidth ?? width、displayHeight ?? height，只要有值便进入ready并缓存。它没有先确认metadataStatus为measured。服务端文件头读取失败会返回保留旧数据库width/height的基础素材项，不能保证这些宽高已经按EXIF显示方向归一化。

组件夹具的by-url GET返回：
    { url: 已选本站素材, width:3840, height:2160, metadataStatus:'unknown' }

实际结果：
- factsState=ready；
- quality=good；
- 原图像素显示3840×2160；
- 提示“当前像素够用”。

此结果已在实际MediaPickerField组件中复现。API响应是明确标注的route-Mock，未声称真实服务此时发生了文件头失败；真实失败路径的存在由当前服务端代码确认。

应修复：unknown、缺少可信展示尺寸或展示元数据读取失败时，保持未知/失败和可恢复状态，不用旧width/height冒充已经检测的displayWidth/Height。上传、素材库映射、本地缓存和当前选中素材补读统一这一语义，避免把unknown写入缓存后长期当measured使用。正确的measured兼容路径保留。
新增回归覆盖unknown+旧尺寸、无尺寸、EXIF、检测失败重试与缓存再次读取。

## 4. 运行中服务仍未通过

本轮隔离浏览器通过当前127.0.0.1:5173代理实际GET：
- 默认locale及显式zh-CN的公开首页响应仍无mediaFacts；
- 首页首图srcset和sizes仍为空，currentSrc仍为原PNG；
- width=3840&rv=2返回404；
- 非法width=480&rv=999返回200。

当前源码已挂接mediaFacts，也明确支持3840和拒绝非法rv。因此应将这项记为运行产物/服务/代理尚未验证一致，不能继续把已修复的源码接线错误重复列为未修，也不能用源代码与测试通过宣称现有页面已经生效。

本轮没有擅自停止或重启用户正在使用的服务。下一次交付必须在明确隔离的运行环境实际加载新后端，并使用默认/显式locale的真实GET、DOM srcset和响应解码验证。仅再次修改代码或构建，不足以关闭这一阻断。

## 5. 本轮通过项与证据层级

代码与目标测试：
- 真正getLocalizedPublishedPageDocument成功路径已调用事实解析并附mediaFacts（service:1161、1174）。
- 新locale入口测试走真实Controller到真实Service分支；数据库和私有事实helper仍为stub。
- 服务端localization、responsive、gateway目标组合35/35通过。
- 客户端responsiveUploadsImage、imageDeliveryGeometry、publicMediaWidth三个文件12/12通过。
- 主任务复跑两端typecheck，均退出0；contracts:check通过，schema v3、SHA前缀829234be9442。
- 新media/by-url的守卫、角色、受控本站路径解析和no-store边界已静态复核，未发现本轮授权扩大；没有把这等同于真实HTTP鉴权验收。
- 未发现擅自实施D批原图比例模式。

组件浏览器夹具：
- 半栏720/1440×1920=960，1600宽源正确提示约需1920，不再误报足够。
- 无缓存自动发起by-url GET并回填事实，无需先打开素材库。
- 模拟首次503显示失败和重试，点击重试后读取成功，事实状态ready；该素材共请求两次。
- 以上使用真实组件、合成元数据和中性图，且只模拟自有GET，不是已登录后台或真实数据库联调。

没有把“readPublishedImageFacts异常返回空对象”单独认定为缺陷：现行方案允许元数据不可用时保守退单src；不应为了通过验收改成编造元数据或扩大授权。

## 6. 尚未验收

- 当前服务上的3840实际分发、941末候选、横图cover选图、策略缓存与元数据联动。
- 新by-url端点真实HTTP鉴权、授权角色、缺失/归档素材等直接回归。
- 登录后台中的双端切换、67%缩放、未保存状态和完整控件链。
- 隔离真实上传→素材库→保存→重开→测试发布→公开回读。
- 冷缓存并发资源、代理/CDN及生产状态。

缺少真实登录或可丢弃数据库，不自动否定已验证的纯计算修复；但不能将这些未验收项写成已闭环。

## 7. 下一次给Cursor的精确范围

    继续原A—C任务，只处理本报告R2-1、R2-2及运行验收：
    1. 从真实父组件接线修正手机810素材规格被当显示宽度的问题，
       同时覆盖模板设计与页面装修，不仅修改纯函数测试。
    2. 保留metadataStatus语义，unknown/未测量不可降级使用旧宽高并标为够用，
       统一补读、素材库和缓存入口。
    3. 在确认隔离的运行环境实际加载本次后端，
       用真实公开GET、DOM、响应解码证明mediaFacts、srcset、3840及非法rv已生效。
    已关闭的locale源码接线和标准半栏换算不推倒重做。
    补真实入口和失败态回归；保护现有修改和草稿，不扩做D，
    不发布真实首页，不写未知或真实数据库，不提交推送部署。
    交付必须分别报告代码修复、实际运行生效和仍缺的真实联调。

证据见cursor-acceptance-r2-evidence.json。
临时组件诊断与截图位于仓库根下.codex-tmp/image-quality-acceptance-r2-20261104/。
