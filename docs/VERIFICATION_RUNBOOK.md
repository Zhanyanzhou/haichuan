# 验证 Runbook — 2026-08-15 批次 A（验证还债批）

> 适用范围：2026-08-14/15 全部静态完成批次的首次运行验证。
> 覆盖：OR-1/OR-2/支付框架/营销生效/收藏/评价/物流轨迹/SMS/合规/清扫 + 模板重构 R0-R5 + 本轮批次 B（ContentSlot 清退）/ C（客户管理+备份状态）/ D（ProductList 服务端搜索）。
> 约束：服务端勿用 `nest dev`（本机 hang），一律 production 产物；admin 端点回归需 admin 密码。
> 顺序即依赖顺序，请自上而下执行；任一步失败，将命令与完整报错回传给 AI 会话修复后重试。

---

## 一、静态门禁（必须先过，否则后续验证无意义）

```powershell
# 1. Prisma client（未 generate 前 @prisma/client 整体报错会掩盖真问题，必须最先做）
cd server
npx prisma generate
npx prisma validate          # schema 语法 + 迁移影子检查（ContentSlot 删除后应通过）

# 2. 服务端编译
npm run build

# 3. 前端编译（含 tsc）
cd ..\client
npm run build

# 4. 契约测试（交易域状态机/并发 + page-builder）
cd ..\server
npm run test:contracts
```

**预期**：4 项全绿。任何 TS 报错优先怀疑本会话三批改动（CustomerManage / ProductList / useProductData / Home / customers 模块 / settings 备份段 / content-slots 墓碑）。

## 二、数据库迁移（首次确认生产库 drift）

```powershell
cd server
npx prisma migrate status
```

- 若显示 "Database schema is up to date" → 直接进入第三节
- 若有未应用迁移（20260813~20260815 一批）→ `npx prisma migrate deploy`，观察 `20260815100000_drop_content_slots` 执行成功（幂等 DROP，无数据损失——表本来为空/死）
- 若报 drift（库与迁移历史不一致）→ **停止**，把 status 输出回传，不要自行 resolve

## 三、编排与备份链路（OR-1 + 批次 C-2）

```powershell
docker compose config          # 应无错误（server 新增 ./backups:/backups:ro 挂载）
docker compose up -d --build
docker compose ps              # 五容器 healthy：mysql/server/client/backup/uptime-kuma
docker logs jewelry-backup     # 首轮备份日志，无 ERROR
dir ..\backups                 # 应出现 *.sql.gz + *.tar.gz
```

**恢复演练（最重要，未演练不应视为"备份可用"）**：取最新 .sql.gz 恢复到本地测试库，核对表数与抽样数据一致；解压 tar.gz 核对媒体文件结构。

## 四、后台功能回归（需 admin 登录）

| 页面 | 验证点 | 对应批次 |
|---|---|---|
| /admin/customers（新） | 列表+分页+状态筛选；搜索框**回车**才查询；点"查看档案"抽屉展示档案/消费聚合/最近订单/收藏；EDITOR 角色应无此菜单、客服可见 | C-1 |
| /admin/settings（重写） | 进入即显示备份状态（容器部署后应显示最近备份时间+产物列表；本地裸跑显示"目录未挂载"属预期）；"刷新备份状态"按钮工作 | C-2 |
| /admin/products 等内容页 | EODITOR 角色登录正常（落地 /admin/products 不再 403） | GB-2 |
| 各角色落地页 | 仓储→库存、客服→线索、销售→报价、财务→概览 | GB-2 |
| /admin/ai-classify | 无 KIMI_API_KEY 时 503 提示（不 400）；有 key 时上传→识别→确认/驳回语义正确 | GB-1 |
| /admin/orders 建单 | 人工建单弹窗：合计变化重拉可用券、券下拉、下单成功 | 营销生效批 |
| /admin/reviews | 列表+审核回复 | 评价批 |
| /admin/editor/home | 模板库按 Brand 模式过滤、23 模板、三档预览、发布校验、导入导出 | 模板重构 |

## 五、前台功能回归

| 页面 | 验证点 | 对应批次 |
|---|---|---|
| `/`（无发布文档） | FallbackHome 正常渲染、HERO 区静态图展示（ContentSlot 清退后行为不变） | 批次 B |
| `/`（有发布文档） | Puck 渲染 + 发布流刷新 | 历史基线 |
| /products（重写） | 首屏仅拉 24 条（Network 面板确认 pageSize=24）；FilterPanel 关键词/材质/排序生效；"共 N 件"；触底持续加载；筛选空态文案；`?categoryId=<子分类ID>` 有结果；SSE 改价后列表回第一页刷新 | 批次 D |
| /catalog、/search | 行为与之前完全一致（仍全量本地筛选——有意决策：联想/托盘依赖全量索引） | 批次 D |
| /products/:id | 收藏心形（登录态）、相似作品区、评价 Tab | 收藏/推荐/评价批 |
| /customer | 登录/注册（SMS 开关默认关）、忘记/重置密码、订单进度条+查看轨迹（快递100 未配置时 503 提示属预期）、心愿单、数据导出/注销 | OR-2/SMS/合规批 |

## 六、Playwright 冒烟

```powershell
cd client
npx playwright test tests
```

含 public-access（公开访问+交易冻结）、responsive、privacy-trust 等既有用例。

## 七、收尾清单

- [ ] `git rm` 六个墓碑文件（client useContentSlots.ts / contentSlot.ts；server content-slots/ 三文件）
- [ ] uptime-kuma 初始化（127.0.0.1:3001 添加 server/client 两个监控项 + 通知渠道）
- [ ] 外部凭据接入（批次 E，可并行）：SMTP → 快递100 → 阿里云短信 → 支付宝/微信商户号（签约周期长，尽早启动）
- [ ] 正式域名确认（解锁 robots/sitemap/og/支付回调）

## 常见预期行为（不是 bug）

- 本地裸跑 server（非容器）时设置页显示"备份目录未挂载"——诚实降级
- 快递100/短信/SMTP 未配置时对应功能 503 + 明确提示——诚实降级
- CUSTOMER_COMMERCE_ENABLED=false：加购/结算按钮不渲染、/cart /checkout 重定向咨询页——三层冻结
- ProductList SSE 商品变更后回到第一页——服务端分页模式的既定行为
