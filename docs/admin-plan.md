# NewHz 开发者后台现状与演进计划

> 更新日期：2026-09-12
>
> 原六个实施切片均已有代码落地；本文从“待建设计划”更新为“现状、限制与下一阶段”。

## 1. 定位

开发者后台是 `admin/` 下独立的 React + Vite 桌面应用，后端为 `cloudfunctions/admin`。服务对象是唯一开发者，目标是运营观察、口红与推荐规则维护、记录排障和有限异常标记。

明确不做：多管理员、RBAC、直接微信退款、任意数据库编辑、复杂 BI、批量用户图片下载和移动端专项适配。

## 2. 已完成能力

| 原切片 | 当前结果 | 状态 |
|---|---|---|
| App Shell | 登录页、左侧导航、懒加载路由、公共 Shell 和错误/加载态 | 已实现 |
| Admin Cloud Function | action 分发、统一响应、CloudBase runtime、session 与鉴权 | 已实现 |
| 运营仪表盘 | 四个时间范围、指标、漏斗、趋势、订单/失败/异常摘要 | 已实现 |
| 口红库 | 列表筛选、保存、上下架、全量校验 CSV 导入导出 | 已实现 |
| 排障模块 | 测试、报告、订单、生成与事件列表/详情、事件导出、报告标记 | 已实现 |
| 部署加固 | Vite 生产构建、CloudBase 浏览器调用与运行时 key 注入 | 部分完成，待目标环境验收 |

后续迭代还增加了 `RecommendationRulesPanel`：开发者可以按肤色、脸型和预算维护三支固定推荐及共享建议。

## 3. 当前页面与 API

### 前端路由

- `/login`
- `/overview`
- `/lipsticks`
- `/tests`
- `/reports`
- `/orders`
- `/logs`

### 云函数 action

`login`、`logout`、`getShell`、`getOverview`、`listLipsticks`、`saveLipstick`、`setLipstickStatus`、`importLipsticksCsv`、`exportLipsticksCsv`、`listRecommendationRules`、`saveRecommendationRule`、`listTests`、`getTestDetail`、`listReports`、`getReportDetail`、`flagReport`、`listOrders`、`getOrderDetail`、`listProviderRuns`、`getProviderRunDetail`、`listEvents`、`getEventDetail`、`exportEventsCsv`。

实际退款处理 action 已不在当前 action map 中，页面只承担查看和排障；不要依据旧计划重新暴露任意订单写接口。

## 4. 数据和写操作边界

- 可写：口红记录、口红状态、推荐规则、报告异常标记。
- 只读：测试、订单、provider runs、events 的业务事实。
- 所有受支持的后台写操作应追加 `admin_actions` 前后快照。
- openid 在列表中脱敏；完整值仅用于详情、明确复制和主动 CSV 导出。
- 用户图片只在报告详情按需查看，不建立媒体库或批量下载。

## 5. 认证与运行模式

### CloudBase 实际模式

- 前端需要 `VITE_CLOUDBASE_ENV_ID`、区域和浏览器可发布访问凭据。
- 后台用户名密码由云函数环境变量验证：`ADMIN_USERNAME`、`ADMIN_PASSWORD_HASH`、`ADMIN_SESSION_SECRET`。
- session 默认两小时，可用 `ADMIN_SESSION_TTL_SECONDS` 调整；logout 通过 `revokedAt` 失效。

### Preview 模式

`VITE_ADMIN_ENABLE_PREVIEW=true` 可启用前端预览数据，用于本地演示。它不验证 CloudBase 数据、权限或云函数部署，不得作为生产验收证据。

### 高风险开关

`ADMIN_AUTH_DISABLED=true` 会绕过后台 session，仅可用于隔离开发环境。生产部署必须确认其未启用，并用未登录请求验证 `UNAUTHORIZED`。

## 6. 运营指标现状

`getOverview` 实时查询 `events`、`orders`、`try_on_tests`、`reports` 和 `provider_runs`，输出访问、测试、报告、生成成功/失败、支付订单、收入、报告查看、分享访问、转化率、漏斗和日趋势。

当前注意事项：

- `visits` 总计当前使用时间范围内全部 events 数量，而趋势中的 visits 只统计 `page_view`，口径不完全一致。
- 小程序代码中尚未发现 `page_view` 事件写入，访问指标可能为零或依赖外部数据。
- 聚合是实时范围查询；索引建议见 `docs/admin-overview-indexes.json`。
- 数据量增长后应使用数据库聚合或预计算，避免拉取整段记录到云函数内存。

## 7. 当前质量与风险

- 2026-09-12 `npm run build` 通过，但有大于 500 kB 的 chunk 警告。
- 多个旧后台测试仍按重构前组件结构和英文文案断言，当前全量测试基线不是绿线。
- `admin-api.js` 顶层直接读取 `import.meta.env`，纯 Node 导入测试会异常。
- 浏览器可发布访问凭据通过运行时配置注入；部署前需要确认其确为最小权限 publishable credential，而不是管理密钥。
- 后台会自动尝试补建部分集合，生产账号权限和失败行为需验证。

## 8. 下一阶段

1. 分类并修复后台相关失败测试，保留行为契约测试，减少对源码字符串结构的脆弱断言。
2. 修复纯 Node 环境导入兼容，建立统一 `npm test` 或仓库级测试入口。
3. 在目标 CloudBase 环境完成登录、未授权访问、各模块读写和审计记录验收。
4. 统一运营访问指标口径并补齐可信 `page_view` 埋点。
5. 对大 bundle 做真实加载测量后再决定 vendor 拆包。
6. 形成部署、回滚和密钥轮换说明；未完成前不把“构建通过”等同于“可生产发布”。
