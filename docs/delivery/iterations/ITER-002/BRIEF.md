# ITER-002 Brief：现状文档校准

## Lifecycle / Execution Mode / Task Type / Risk Level

- Lifecycle：持续产品迭代
- Execution Mode：局部修改（内部治理）
- Task Type：产品与技术文档校准
- Risk Level：Level 2

## Problem / Evidence

仓库经过多轮产品、后台和架构迭代，但 `PRD.md`、`TECH.md` 与 `docs/admin-plan.md` 仍把已经存在的页面、云函数、支付状态机、分享、清理和后台模块列为未实现或未来计划。

## Goal

以 2026-09-12 当前源码、CodeGraph、Git 历史和已采集测试/构建基线为依据，重建产品、技术、领域语言和后台文档；明确生产缺口，不修改业务代码。

## Scope

- `PRD.md`、`TECH.md`、`CONTEXT.md`、`docs/admin-plan.md`
- `AGENT1.md` 历史入口收敛
- `docs/delivery/**` 状态、任务、决策、backlog、指标和本迭代资料

## Out of Scope

- 修复测试、支付、审核或生产配置
- 部署与生产数据查询
- 改变任何接口、数据或用户体验

## Success Metrics

- 主文档不再把当前已有能力写为未实现。
- mock/调用方信号/未部署能力明确标为受限或待验证。
- 页面、action、集合和后台模块清单与代码一致。
- 文档变更不包含业务源码。
