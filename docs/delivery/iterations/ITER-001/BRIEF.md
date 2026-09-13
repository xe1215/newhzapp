# ITER-001 Brief：UAPD 协作基线初始化

## ID / Lifecycle / Execution Mode / Task Type / Risk Level

- ID：ITER-001
- Lifecycle：持续产品迭代
- Execution Mode：局部修改（内部治理）
- Task Type：协作体系初始化
- Risk Level：Level 1

## Problem

仓库已有小程序、云函数、开发者后台和测试，但缺少统一的 Agent 规则、当前状态、任务、决策、交接、迭代和指标事实源；根 README 仍是 QuickStart 占位内容。

## Evidence

- 根目录不存在 `AGENTS.md`。
- 原 README 仅介绍云开发 QuickStart，未描述 NewHz。
- `docs/` 仅有后台计划与索引文件，没有当前状态和交接体系。
- `.codex/agents/` 尚不存在。

## Goal / Success Metrics

- 建立六个核心文件且内容对应当前仓库。
- 配置六个必要角色并通过 TOML/项目配置解析检查。
- 建立 backlog、iterations、metrics 和本轮 results。
- 不修改业务源码，不改变小程序、云函数或后台运行行为。

## Scope

- `AGENTS.md`、`README.md`
- `docs/delivery/**`
- `.codex/config.toml`、`.codex/agents/*.toml`
- `.gitignore` 中仅为上述项目配置增加跟踪例外

## Out of Scope

- 修复既有业务测试失败
- 修改产品功能、API、数据结构或界面
- 部署及生产数据访问

## Acceptance Criteria

见 `ACCEPTANCE.md`。

## Rollback Trigger

若新增配置无法解析、覆盖用户已有配置，或影响现有构建/运行路径，则回滚对应配置；文档可独立保留。
