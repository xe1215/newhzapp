# 口红试色小程序技术开发文档

## 1. 文档状态

本文档已按当前微信开发者工具配置和仓库代码基线更新。

当前已确认配置：

- `miniprogramRoot`: `miniprogram/`
- `cloudfunctionRoot`: `cloudfunctions/`
- `compileType`: `miniprogram`
- `appid`: `wx4dd9d0c434997a0f`
- `projectname`: 公共配置为 `quickstart-wx-cloud`，私有配置覆盖为 `newhzapp`
- `libVersion`: `3.16.1`
- 代码风格：微信小程序原生 JavaScript / WXML / WXSS
- 编辑器缩进：2 spaces

当前代码仍是微信云开发 QuickStart：

- `miniprogram/app.js` 已调用 `wx.cloud.init`，但 `globalData.env` 为空
- `miniprogram/envList.js` 的 `envList` 为空
- `miniprogram/app.json` 只注册 `pages/index/index` 和 `pages/example/index`
- 云函数只有 `cloudfunctions/quickstartFunctions`
- `quickstartFunctions` 当前操作示例 `sales` 集合，尚无口红试色业务集合

## 2. 技术栈选择

| 模块 | 第一版技术 |
| --- | --- |
| 小程序前端 | 微信小程序原生开发，JavaScript、WXML、WXSS |
| 后端逻辑 | 微信云开发 CloudBase 云函数 |
| 数据库 | CloudBase 云数据库 |
| 文件存储 | CloudBase 云存储 |
| 图像服务 | 云函数或云托管封装外部图像模型 API |
| 支付 | 微信支付 |
| 运营后台 | 微信公众平台、微信支付商户平台、CloudBase 控制台 |

说明：

- 当前项目没有 TypeScript 编译配置，第一版先沿用 JavaScript，降低从 QuickStart 改造的成本。
- 如果后续引入 TypeScript，需要同步补充构建配置、类型声明和云函数编译流程。
- 图像模型优先选择中国大陆可稳定访问的供应商，例如阿里云百炼/通义万相、腾讯云混元、火山引擎等。GPT Image / image2 不作为国内生产主链路。

## 3. 最小架构原则

- 小程序前端只负责展示和交互，不直接操作核心业务集合。
- 业务状态、支付、权限、推荐、报告解锁放在云函数中。
- 图像服务只负责调用外部图像模型生成无水印正式试色图；带水印预览图由云函数在本地基于无水印正式图后处理生成。
- 第一版不建设独立 Web 管理后台，运营通过微信平台和 CloudBase 控制台完成。
- 第一版不引入复杂微服务，不单独建设 `preview_groups` 集合，用 `reports` 表达每一组预览。
- 先替换 QuickStart 样板页面和样板云函数，再逐步拆分业务模块。

## 4. 当前工程结构

```text
newhzapp/
  project.config.json
  project.private.config.json
  miniprogram/
    app.js
    app.json
    app.wxss
    envList.js
    sitemap.json
    pages/
      index/
      example/
    components/
      cloudTipModal/
    images/
  cloudfunctions/
    quickstartFunctions/
      config.json
      index.js
      package.json
```

当前结构中的 `pages/index`、`pages/example` 和 `quickstartFunctions` 属于云开发样板。后续业务实现时，应逐步替换或迁移，避免用户侧继续看到 QuickStart 内容。

## 5. 目标工程结构

第一版建议在当前结构上演进为：

```text
newhzapp/
  miniprogram/
    app.js
    app.json
    app.wxss
    envList.js
    pages/
      home/
      upload/
      preferences/
      generating/
      preview/
      payment-result/
      report/
      my-reports/
      share/
      privacy/
      refund-help/
    components/
      tryon-preview/
      result-card-canvas/
      locked-section/
    services/
      auth.js
      test.js
      report.js
      payment.js
      share.js
    utils/
      constants.js
      errors.js

  cloudfunctions/
    user/
    test/
    report/
    payment/
    share/
    cleanupExpiredData/
```

演进策略：

- 第一步：把 `pages/index` 替换为产品首页，保留 `pages/example` 仅供开发期参考或直接删除。
- 第二步：新增业务云函数，避免继续把业务逻辑塞进 `quickstartFunctions`。
- 第三步：确认业务稳定后删除 QuickStart 示例代码和示例图片。

## 6. 云环境配置

必须先完成：

1. 在微信开发者工具中确认 CloudBase 环境 ID。
2. 将环境 ID 写入 `miniprogram/app.js` 的 `globalData.env`，或通过 `envList.js` 提供可选环境。
3. 确认云函数使用 `cloud.DYNAMIC_CURRENT_ENV`，让云端调用绑定当前部署环境。
4. 在 CloudBase 控制台配置后续所需环境变量，例如图像模型 API Key、支付相关密钥、回调验证配置。

当前风险：

- `globalData.env` 为空时，前端点击非跳过环境检查的 QuickStart 项会弹出“请在 miniprogram/app.js 中正确配置 env 参数”。
- `envList` 为空时，页面无法提供环境选择。

## 7. 数据模型

### users

```text
_id
openid
createdAt
lastSeenAt
```

### try_on_tests

一次用户测试，记录自拍、偏好、生成状态、换组次数和当前激活报告。

```text
_id
openid
status
selfieFileId
preferences
safetyStatus
qualityStatus
generationStatus
generationRetryCount
previewRegenerateCount
maxPreviewRegenerateCount
activeReportId
sourceShareId
createdAt
updatedAt
expiresAt
```

关键规则：

- `previewRegenerateCount` 初始为 `0`。
- `maxPreviewRegenerateCount` 固定为 `3`。
- `activeReportId` 指向当前可支付解锁的 report。

### reports

一组预览和其付费报告。第一版用 report 表达多组预览，不额外建 `preview_groups`。

```text
_id
openid
testId
version
status
snapshot
previewImages
paidImages
shareCardImages
replacedByReportId
unlockedAt
expiresAt
deletedAt
createdAt
```

`status`：

```text
active
replaced
unlocked
deleted
expired
```

关键规则：

- 初始 report 的 `version=1`。
- 每次成功换组新建 report，`version` 递增。
- 旧 report 标记为 `replaced`。
- 支付只能解锁 `try_on_tests.activeReportId` 指向的 report。
- report 保存推荐快照，口红库后续修改不影响历史报告。
- `paidImages` 保存图像模型生成的 3 张无水印正式试色图，文件名建议包含 `clean`。
- `previewImages` 保存云函数本地加水印后生成的 3 张免费预览图，文件名建议包含 `watermark`。
- `previewImages[index]` 必须由 `paidImages[index]` 派生，二者一一对应同一个推荐口红。

### orders

```text
_id
openid
testId
reportId
amount
currency
paymentStatus
refundStatus
wxTransactionId
merchantOrderNo
wxPrepayId
paidAt
unlockedAt
refundReason
createdAt
updatedAt
```

关键规则：

- `amount=599`，单位为分。
- 一个订单只绑定一个 `reportId`。
- 支付回调必须幂等。
- 支付成功只解锁订单绑定的 report。
- 支付成功但报告不可查看时，标记为可退款。

### lipsticks

```text
_id
brand
shadeName
shadeCode
colorHex
swatchImageFileId
texture
undertone
skinToneTags
budgetRange
sceneTags
styleTags
baseScore
manualBoost
recommendationReason
cautionNote
substitute
searchKeywords
status
createdAt
updatedAt
```

第一版维护 50-70 个精品色号即可。运营人员直接在 CloudBase 云数据库控制台维护。

### share_entries

```text
_id
sharerOpenid
reportId
recommendationIndex
cardPreviewFileId
sharePath
visitCount
uniqueVisitorCount
newTestCount
paidOrderCount
createdAt
updatedAt
```

### provider_runs

记录图像模型调用，方便排障和成本统计。

```text
_id
testId
reportId
openid
provider
status
durationMs
retryIndex
errorCode
errorMessage
cleanImageFileIds
watermarkedImageFileIds
createdAt
```

### events

只记录漏斗和关键行为，不替代业务表。

```text
_id
openid
eventName
testId
reportId
orderId
shareId
properties
createdAt
```

核心事件：

```text
upload_selfie_success
preference_submit
generation_success
generation_fail
preview_view
preview_regenerate_success
preview_regenerate_fail
preview_regenerate_limit_reached
payment_success
report_view
share_visit
refund_request
```

## 8. 云函数设计

建议从 QuickStart 的单函数 switch 演进为业务函数分组。

| 云函数 | 职责 |
| --- | --- |
| `user` | 获取 openid、创建或更新用户 |
| `test` | 创建测试、上传后记录、提交偏好、生成预览、换组 |
| `report` | 查询预览、查询已解锁报告、隐藏报告 |
| `payment` | 创建支付订单、处理支付回调、标记解锁、退款辅助 |
| `share` | 生成分享卡片记录、读取分享落地页数据、统计分享访问 |
| `cleanupExpiredData` | 清理 24 小时过期自拍和未支付草稿 |

当前 `quickstartFunctions` 可作为学习参考，不建议承载正式业务逻辑。

## 9. 关键技术点

### 9.1 换组状态

成功换组时按顺序执行：

1. 校验 `previewRegenerateCount < 3`。
2. 排除本次测试已推荐过的色号，重新推荐 Top 3。
3. 调用图像服务生成新 report 的 3 张图。
4. 新建 report，`version + 1`，状态为 `active`。
5. 旧 report 标记为 `replaced`。
6. 更新 `activeReportId`。
7. `previewRegenerateCount + 1`。

如果图像生成失败，不创建新 report，不增加换组次数。

### 9.2 试色图生成

输入：

```text
selfieFileId
targetLipsticks
testId
reportId
```

输出：

```text
cleanImages              # 图像模型生成的无水印正式试色图，写入 reports.paidImages
watermarkedImages        # 云函数本地加水印后的免费预览图，写入 reports.previewImages
provider
durationMs
errorCode
```

要求：

- 保留用户身份特征。
- 只改变嘴唇颜色。
- 不污染牙齿、鼻子、皮肤。
- 每组输入必须包含 3 个不同品牌、不同颜色的推荐口红；不足 3 个时返回明确错误，不进入图像生成。
- 外部图像模型一次只负责生成 3 张无水印正式试色图，不要求模型生成水印图。
- 云函数下载或读取无水印正式图后，在本地添加可见水印并上传为预览图。
- 水印预览图不得覆盖无水印正式图；两类图片必须使用不同云存储路径或文件名。
- 失败要返回明确错误码，用于重试或退款判断。

### 9.3 推荐规则

第一版不用 AI 决定推荐结果，使用可解释规则：

```text
肤色匹配 -> 预算过滤 -> 场景加分 -> 风格加分 -> 人工权重排序 -> 去重品牌和颜色 -> Top 3
```

换组时优先排除本次测试已出现过的色号。每组 Top 3 应尽量保证品牌不同、颜色值不同；如果无法凑够 3 个有效推荐，则返回推荐不足错误，不生成试色图。

### 9.4 支付解锁

- 创建支付订单时读取 `activeReportId`。
- 订单绑定固定 `reportId`。
- 支付回调只解锁订单绑定的 report。
- 如果用户在支付前换组，旧 report 不可再被支付。
- 支付成功但报告不可查看，进入退款处理。

### 9.5 分享

- 结果卡片用小程序 Canvas 生成。
- 保存到相册可在本地完成。
- 分享时上传单张卡片到云存储，并创建 `share_entries`。
- 分享落地页只读取卡片和统计数据，不读取完整报告。

### 9.6 权限和生命周期

权限：

- 自拍原图不公开。
- 免费水印图只允许本人访问。
- 无水印图只允许已支付用户访问。
- 分享卡片只允许通过有效 `shareId` 访问。
- 色卡图可公开读，运营人员通过 CloudBase 控制台写。
- API Key 和支付密钥只放云函数、云托管环境变量或微信支付平台配置中。

生命周期：

- 自拍原图 24 小时后自动删除。
- 未支付 report 24 小时后自动清理。
- 已支付 report 保留在“我的报告”。
- 用户删除自拍不删除报告。
- 用户隐藏报告不删除订单。

## 10. 云存储路径

```text
selfies/{openid}/{testId}/original.jpg
tryon-results/{reportId}/1-{lipstickId}-clean.jpg
tryon-results/{reportId}/1-{lipstickId}-watermark.jpg
share_cards/{openid}/{reportId}/{recommendationIndex}.jpg
swatches/{lipstickId}.jpg
```

`reportId` 用于区分最多 4 组预览，避免图片覆盖。`clean` 文件是无水印正式图，写入 `reports.paidImages`；`watermark` 文件是本地加水印预览图，写入 `reports.previewImages`。

## 11. 平台后台使用方式

第一版不开发自建后台，按下面方式运营：

| 需求 | 使用位置 |
| --- | --- |
| 小程序版本发布、类目、隐私协议 | 微信公众平台 / 微信开发者工具 |
| 支付交易、退款、商户对账 | 微信支付商户平台 |
| 云函数日志、环境变量、定时任务 | CloudBase 控制台 |
| 口红库维护 | CloudBase 云数据库 `lipsticks` 集合 |
| 订单与报告排查 | CloudBase 云数据库 `orders`、`try_on_tests`、`reports` |
| 图像供应商排查 | CloudBase 云数据库 `provider_runs` 和云函数日志 |
| 漏斗统计 | CloudBase 云数据库 `events` 集合查询/导出 |
| 图片文件排查 | CloudBase 云存储 |

平台后台限制：

- 不提供面向运营的定制化仪表盘。
- 不提供多管理员角色和细粒度操作日志。
- 数据维护依赖 CloudBase 控制台权限，请限制控制台成员范围。
- 复杂统计、批量导入、可视化图表后续再建设独立后台。

## 12. 代码风格和架构模式

- 第一版沿用 JavaScript；业务状态用明确常量表达。
- 前端页面只处理展示和交互，业务判断放到 service 或云函数。
- 云函数按业务域拆分，不把支付、报告、分享混在一个入口里。
- 外部图像模型使用 provider adapter，统一输入输出和错误码。
- 所有支付回调、换组、报告解锁逻辑必须幂等。
- 第一版不实现自建后台权限系统。

## 13. 实施里程碑

### M0 配置收敛

- 确认 CloudBase 环境 ID 并写入配置。
- 确认微信支付商户号、API 证书和回调域名准备情况。
- 删除或隐藏 QuickStart 用户入口。

### M1 产品骨架

- 替换首页。
- 增加上传、偏好、生成中、预览、报告、我的报告页面。
- 增加前端 service 层。

### M2 业务数据闭环

- 创建 `users`、`try_on_tests`、`reports`、`lipsticks`、`events` 集合。
- 实现 openid 登录、测试创建、偏好提交、规则推荐。

### M3 图像与预览

- 接入内容安全和质量检查。
- 接入图像服务。
- 实现预览图生成、换组和失败重试。

### M4 支付与报告

- 实现创建订单、微信支付、支付回调、报告解锁。
- 实现我的报告和报告隐藏。
- 补齐退款异常标记。

### M5 分享与清理

- 实现结果卡片保存和分享落地页。
- 实现关键事件统计。
- 实现 24 小时清理任务。

## 14. 验收重点

- 小程序启动后进入口红试色产品首页，而不是云开发 QuickStart。
- `globalData.env` 或环境选择配置有效，云函数调用不再提示环境缺失。
- 上传、偏好、生成、换组、预览、支付、报告闭环可跑通。
- 同一组推荐必须产出 3 个不同品牌、不同颜色的口红快照。
- 外部图像模型只生成 3 张无水印正式试色图，并写入 `reports.paidImages`。
- 云函数本地从无水印正式图派生 3 张带水印预览图，并写入 `reports.previewImages`。
- 每次测试最多免费换 3 次，失败不消耗次数。
- 支付只能解锁当前激活 report。
- 支付回调重复到达不会重复解锁或重复记账。
- 图像生成失败可重试，已支付但交付失败可退款。
- CloudBase 控制台可查询订单、测试记录、事件、分享数据、供应商调用记录。
- 自拍原图和未支付 report 可按 24 小时规则清理。
