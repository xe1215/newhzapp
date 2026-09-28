# ITER-004 Brief：UAPD 1.4 对齐

## Lifecycle / Execution Mode / Task Type / Risk Level

- Lifecycle：持续产品迭代
- Execution Mode：局部修改（内部治理）
- Task Type：工作流配置迁移
- Risk Level：Level 1

## Problem / Evidence

通用 UAPD 方法论升级到 1.4 后，项目工作流仍使用单一 Mode 字段混合表达生命周期、局部修改和 Bug；ITER-001、ITER-002 的复盘也没有独立文件。

## Goal / Success Metrics

- 当前入口统一使用 Lifecycle、Execution Mode、Task Type 和 Risk Level。
- ITER-001 至 ITER-004 均具备完整六文件迭代包。
- Skill、元数据和角色配置继续通过解析与结构校验。

## Scope / Out of Scope

- Scope：UAPD Skill、模板、调用示例、主协调配置、共享规则、README 和 `docs/delivery/**`。
- Out of Scope：业务源码、测试失败修复、生产发布和生产数据。

## Acceptance Criteria

见 `ACCEPTANCE.md`。

## Rollback Trigger

Skill 解析失败、当前调用入口丢失或迁移改变业务运行路径时回滚本轮治理配置。
