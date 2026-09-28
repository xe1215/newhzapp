# NewHz 技术架构与开发文档

> 文档版本：2.0
>
> 现状基线：2026-09-12 当前仓库代码
>
> 原则：描述真实实现；生产配置与运行状态需单独验证

## 1. 系统概览

```text
微信小程序
  pages -> services/cloud.js -> CloudBase 业务云函数
                                  |
                                  +-> CloudBase 文档数据库
                                  +-> CloudBase 云存储
                                  +-> 即梦图像 API

开发者后台 React/Vite
  admin-api.js -> CloudBase Web SDK -> cloudfunctions/admin
                                      |
                                      +-> 运营查询 / 有限写操作 / 会话 / 审计
```

运行时业务与协作文档分离：业务代码位于 `miniprogram/`、`cloudfunctions/`、`admin/`；UAPD 资料位于 `docs/delivery/`，角色配置位于 `.codex/agents/`。

## 2. 技术栈与配置

| 层 | 当前实现 |
|---|---|
| 小程序 | 原生 JavaScript、WXML、WXSS，基础库 3.16.1 |
| 后端 | CloudBase Node.js 云函数，CommonJS |
| 数据 | CloudBase 文档数据库与云存储 |
| 图像生成 | mock provider + 火山引擎即梦异步适配器 |
| 水印 | 云函数下载正式图后通过 Sharp 后处理 |
| 支付 | 订单/解锁状态机已实现；真实微信支付网关未接入 |
| 后台 | React 18、React Router、Ant Design 6、Vite 5 |
| 测试 | `tests/*.test.js`、`tests/*.test.mjs` Node 脚本 |

微信项目配置：AppID `wx4dd9d0c434997a0f`，小程序根目录 `miniprogram/`，云函数根目录 `cloudfunctions/`。小程序环境 ID 当前硬编码于 `miniprogram/utils/constants.js`，切换环境必须同步检查后台变量和部署目标。

## 3. 代码结构

```text
miniprogram/
  pages/                 13 个注册页面
  services/              auth、test、report、payment、share、cloud
  utils/                 常量、错误、媒体 URL、业务响应、卡片手势
  images/                小程序视觉资源

cloudfunctions/
  _shared/               用户侧业务云函数公共 runtime/响应工具
  user/                  微信静默登录
  test/                  上传、偏好、推荐、生成、换组、删除自拍
  report/                预览、完整报告、报告列表、隐藏
  payment/               订单、支付确认、退款申请
  share/                 分享创建、读取与访问统计
  cleanupExpiredData/    每小时生命周期清理
  admin/                 后台 API、会话、运营查询和审计
  quickstartFunctions/   历史 QuickStart 参考，不属于业务主链路

admin/
  src/pages/             仪表盘、口红、测试、报告、订单、日志、登录
  src/components/        Shell、表格详情工作台、公共控件
  src/hooks/             运营数据列表/详情状态复用
  src/lib/admin-api.js   CloudBase 调用、预览数据和响应适配
```

小程序注册页：`home`、`upload`、`preferences`、`generating`、`preview`、`payment-result`、`report`、`my-reports`、`report-history`、`my`、`share`、`privacy`、`refund-help`。其中 `preferences` 是兼容路由，当前会跳回合并了偏好选择的 upload 页面。

## 4. 前端边界

- 页面负责交互、展示、临时状态和导航，不直接访问核心业务集合。
- `services/cloud.js` 统一调用 `{ name, action, data }` 形式的业务云函数。
- `utils/business.js` 统一解包云函数结果并隐藏不适合用户展示的底层错误。
- `utils/media.js` 将 CloudBase file ID 批量解析为临时 URL。
- 首页使用本地 `newhzLatestPreview` 支持续看未付预览；发现已解锁报告后清除该缓存。
- 预览与报告卡片手势使用公共 card-deck 流程，需保持触控阈值与布局稳定。

## 5. 云函数 API

统一成功形态为 `code: 0`；业务失败使用稳定字符串错误码。用户侧操作从微信上下文读取 openid，并在资源级校验所有权。

| 云函数 | Action | 主要职责 |
|---|---|---|
| `user` | `silentLogin` | 创建/更新用户并返回 openid、appid、unionid |
| `test` | `createTest` | 兼容入口，仅返回 draft，不创建完整记录 |
| `test` | `uploadSelfie` | 校验检查结果、移动自拍、创建测试、记录上传事件 |
| `test` | `submitPreferences` | 校验偏好、生成三支推荐快照、创建 v1 report |
| `test` | `generateTryOnImages` | 创建或续查图像生成任务、写入图片与 provider/event 记录 |
| `test` | `regeneratePreview` | 排除历史推荐，创建/续查新一组并在成功后切换 active report |
| `test` | `deleteSelfie` | 删除本人测试原图，不删除生成报告 |
| `report` | `getPreview` | 返回水印图、生成状态和剩余换组次数，不返回推荐内容 |
| `report` | `getReport` | 仅向已解锁报告所有者返回正式图、推荐与展示内容 |
| `report` | `listMyReports` | 返回本人已解锁、未隐藏报告 |
| `report` | `hideReport` | 软隐藏本人已解锁报告 |
| `payment` | `createReportOrder` | 为当前 active report 创建 599 分订单 |
| `payment` | `confirmPayment` | 幂等确认订单、解锁 report、设置原图保留和异常退款状态 |
| `payment` | `requestRefund` | 记录已付但不可查看报告的退款请求 |
| `share` | `createShareEntry` | 上传单支分享卡并创建公开分享记录 |
| `share` | `getShareEntry` | 返回单支公开推荐内容 |
| `share` | `trackShareVisit` | 统计访问与独立访客 |
| `share` | `loadShareLanding` | 一次读取落地内容并记录访问 |
| `cleanupExpiredData` | timer main | 每小时清理到期未付自拍和 report 资产 |

后台 `admin` 使用 action map，当前包含：`login`、`logout`、`getShell`、`getOverview`、口红列表/保存/状态/CSV、推荐规则列表/保存、测试/报告/订单/provider run/event 列表与详情、事件 CSV，以及 `flagReport`。

## 6. 核心数据集合

CloudBase 无仓库内 schema migration，以下是代码实际依赖的逻辑契约。

### `users`

`_id`、`openid`、`appid`、`unionid`、`createdAt`、`lastSeenAt`。openid 是小程序用户资源隔离主键。

### `try_on_tests`

核心字段：`_id`、`openid`、`status`、`selfieFileId`、`preferences`、`safetyStatus`、`qualityStatus`、`generationStatus`、`previewRegenerateCount`、`maxPreviewRegenerateCount`、`activeReportId`、`expiresAt`、原图保留字段及时间戳。

状态会经历 `selfie_uploaded`、`preferences_submitted`、生成/换组相关状态；部分前端常量仍保留更抽象的 draft/generating/preview_ready/paid/failed，修改状态时必须核对服务端真实值。

### `reports`

一份 report 表示一组预览和对应完整报告：`openid`、`testId`、`version`、`status`、`snapshot`、`previewImages`、`paidImages`、`shareCardImages`、`replacedByReportId`、`unlockedAt`、`expiresAt`、`deletedAt`、`generationStatus`、provider job/诊断及时间戳。

`snapshot` 保存 preferences、三支 recommendations、共享建议和生成时间。状态包括 active、regenerating、replaced、deleted、expired；解锁事实以 `unlockedAt` 为主。

### `orders`

核心字段：`openid`、`testId`、`reportId`、`amountCents`、`currency`、`status`、`refundStatus`、`refundReason`、`canViewReport`、自拍保留同意字段、`wechatPayment` 和时间戳。当前 `wechatPayment.prepayId` 与确认 transaction id 为 mock 值，不能作为真实支付凭证。

### `lipsticks`

当前后台主字段为 `_id`、`brand`、`productName`、`shadeCode`、`texture`、`productImage`、`colorHex`、`budget`、`status`。推荐逻辑兼容历史的 `shadeName`、`budgetRange`、`priceRange`、标签、`manualBoost`、推荐理由、注意项、平替与搜索关键词字段。

### `recommendation_rules`

按 `skinTone`、`faceShape`、`budget` 匹配，保存三个 `lipstickIds` 以及 `whySuitable`、`applicationAdvice`、`makeupColorAdvice`。集合不存在时推荐流程会回退到打分算法。

### 运行与运营集合

- `provider_runs`：供应商、模型、状态、时长、错误、生成文件和诊断。
- `events`：上传、偏好、生成、换组、支付、报告查看、分享、退款等关键事件。历史代码同时存在 `type` 与 `eventName` 字段，聚合层兼容两者。
- `share_entries`：分享者、report、推荐索引、卡片、访问/独立访客统计。
- `admin_sessions`：开发者 token、角色、签发/过期/撤销时间和摘要。
- `admin_actions`：后台写操作的前后快照。

## 7. 推荐与图像生成

### 推荐顺序

1. 读取 active 口红。
2. 尝试匹配 recommendation rule；规则中的三支口红必须仍为 active。
3. 无有效规则时按预算过滤并评分。
4. 按分数降序、ID 稳定排序，依次选择不同品牌和不同颜色。
5. 换组额外排除该测试历史 report 已出现的 lipstick ID。

### Provider

- `IMAGE_PROVIDER=mock`：生成可预测 file ID，仅供开发测试。
- `IMAGE_PROVIDER=jimeng`：使用火山引擎签名调用，默认模型 key `jimeng_seedream46_cvtob`。
- 即梦流程逐支维护异步 job，支持任务提交、结果查询、HTTP 重试、轮询、陈旧任务判断和诊断裁剪。
- 所有三张正式图完成后再完成 report；水印图由程序后处理生成。

主要环境变量：`IMAGE_PROVIDER`、`IMAGE_PROVIDER_MODEL`、`IMAGE_PROVIDER_TIMEOUT_MS`、`IMAGE_PROVIDER_REFERENCE_STRENGTH`、`JIMENG_ACCESS_KEY_ID`、`JIMENG_SECRET_ACCESS_KEY`、可选 session token/API host/region/action/轮询与重试配置、`TRYON_PROMPT*`。

## 8. 权限、安全与生命周期

- 用户 API 不信任客户端提供的 openid，以微信上下文为准。
- report、test、order 的读取或修改必须同时校验所有者与关联 ID。
- 免费预览响应不包含推荐快照；完整报告要求 `unlockedAt`。
- 自拍路径包含 openid/testId；分享卡只通过 shareId 暴露经过裁剪的数据。
- 清理任务每小时执行，遍历测试、报告与订单后清理到期未付资产。当前实现是全量读取后循环，数据增长后需改为分页/索引查询。
- 后台默认需要 session。`ADMIN_AUTH_DISABLED` 是高风险开发开关，生产不得启用。
- 所有服务端密钥只允许存在于云函数环境变量；后台浏览器可发布访问凭据必须与管理密钥区分。

## 9. 支付现状与目标架构

当前实现已经验证订单绑定、解锁、幂等和退款状态机，但尚未完成真实支付：

```text
当前：创建 mock prepay -> 客户端直接 confirmPayment(mock transaction) -> 解锁
目标：服务端统一下单 -> wx.requestPayment -> 微信服务端回调验签
     -> 以商户单号幂等确认 -> 解锁绑定 report -> 客户端只轮询结果
```

生产接入必须校验金额、商户单号、支付状态、签名和回调重放；客户端不能直接把订单标为 paid。

## 10. 开发者后台架构

- 前端通过 `@cloudbase/js-sdk` 调用 `admin` 云函数；缺少环境 ID 或浏览器访问凭据时显示明确错误。
- 可选 preview 模式提供本地演示数据，只允许开发/展示，不代表 CloudBase 连通。
- 认证由 `ADMIN_USERNAME`、`ADMIN_PASSWORD_HASH`（`sha256$...`）、`ADMIN_SESSION_SECRET` 和可选 TTL 驱动。
- 列表/详情公共逻辑已经收敛到 hooks、record workbench、detail builders 和后端 record adapters。
- Vite 构建已支持运行时注入浏览器可发布访问 key；部署前必须确认该凭据权限最小化。
- 当前构建通过，但存在大 chunk 警告；先测量加载体验再优化拆包。

## 11. 构建、测试与部署

后台：

```powershell
cd admin
npm install
npm run build
```

小程序通过微信开发者工具编译，云函数按目录上传到同一 CloudBase 环境。`cleanupExpiredData/trigger.config.json` 声明每小时 timer；需在目标环境确认触发器实际创建。

测试为独立 Node 脚本。2026-09-12 基线：34 个测试文件中 16 个退出成功、18 个失败；详情见 `docs/delivery/iterations/ITER-001/RESULTS.md`。在测试漂移与真实回归分类完成前，全量测试不能作为“已通过”证据。

## 12. 已知技术债与下一步

- 接入真实服务端自拍审核和质量检测。
- 用真实微信支付与可信回调替换 mock 支付确认。
- 恢复全量测试绿线并建立根目录统一 test 命令。
- 统一 `events.type` / `eventName`、`activeReportId` / 历史 `currentReportId` 等字段口径。
- 校验 CloudBase 索引、集合权限、定时任务和生产环境变量。
- 数据增长后将清理与后台聚合改为分页/聚合查询。
- 评估移除 `quickstartFunctions` 和兼容 preferences 页面。
