# Backlog

> 优先级：P0 阻塞质量或交付；P1 高价值/高风险；P2 常规改进；P3 观察项。

| ID | 类型 | 优先级 | 事项 | 证据 | 建议角色 | 状态 |
|---|---|---|---|---|---|---|
| BL-001 | 质量 | P0 | 分类并修复全量测试基线失败 | 2026-09-12：34 个测试文件中 18 个失败 | 前端 / 后端 / QA | Ready |
| BL-002 | 文档债 | P1 | 校准 PRD、TECH 与当前代码状态 | ITER-002 已完成源码对照和文档重写 | 产品 / 架构 | Done |
| BL-003 | 指标 | P1 | 建立生产漏斗与质量指标基线 | 尚无生产查询证据 | 产品 | Blocked: 数据访问 |
| BL-004 | 安全 | P1 | 审查开发者后台认证开关与生产配置 | 测试中存在“login validation disabled”场景 | 架构 / 安全 / QA | Needs triage |
| BL-005 | 兼容 | P1 | 修复后台模块在纯 Node 环境读取 `import.meta.env` 的异常 | `admin-cloudbase-default-mode.test.mjs` 抛出 TypeError | 前端 / QA | Ready |
| BL-006 | 性能 | P2 | 测量并按需拆分后台大体积 bundle | Vite 构建提示两个 chunk 超过 500 kB | 架构 / 前端 | Candidate |
| BL-007 | 维护 | P2 | 评估并移除 QuickStart 参考目录和陈旧入口 | `cloudfunctions/quickstartFunctions/` 仍存在 | 架构 / 后端 | Candidate |
| BL-008 | 测试基础设施 | P2 | 建立单一、可聚合退出码的全量测试命令 | 根目录无 package.json，当前需 PowerShell 循环 | 前端 / 后端 / QA | Ready |
| BL-009 | 支付 | P0 | 接入真实微信支付下单、拉起支付和可信回调 | 当前 `mock-prepay-*` 且客户端传 mock transaction id | 架构 / 前端 / 后端 / QA | Ready for discovery |
| BL-010 | 安全/隐私 | P0 | 接入服务端自拍安全与质量审核 | `uploadSelfie` 接收调用方 checks，小程序未提供真实检查信号 | 产品 / 架构 / 前端 / 后端 / QA | Ready for discovery |
| BL-011 | 数据口径 | P1 | 统一 event 的 `type`/`eventName` 和访问指标 | 后台总 visits 与趋势 visits 口径不同，未发现 `page_view` 写入 | 产品 / 架构 / 后端 / 前端 | Ready |
| BL-012 | 数据模型 | P2 | 统一 active/current report 与状态常量命名 | 代码存在 `activeReportId`、历史 `currentReportId` 和多套状态词 | 架构 / 后端 / 前端 / QA | Candidate |
| BL-013 | 容量 | P2 | 清理任务与后台聚合改为分页/聚合查询 | 当前实现会读取时间范围或集合内全部记录 | 架构 / 后端 / 前端 | Candidate |

## 收录规则

- 记录问题与证据，不在 backlog 中预先承诺方案。
- 进入迭代前补齐目标、范围、验收、指标、依赖和负责人。
- 已完成项移入对应迭代 `RESULTS.md`，不直接删除历史。
