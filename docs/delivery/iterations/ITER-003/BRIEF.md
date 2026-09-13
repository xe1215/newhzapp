# ITER-003 Brief：UAPD 工作流激活

## Lifecycle / Execution Mode / Task Type / Risk Level

- Lifecycle：持续产品迭代
- Execution Mode：局部修改（内部治理）
- Task Type：工作流配置
- Risk Level：Level 1

## Problem / Evidence

项目已有六个角色和交付文档，但 `.agents/skills/product-delivery-workflow/SKILL.md` 仍包含 TODO 占位符。技能可被目录发现，却没有可执行的编排说明、调用元数据或项目路径约束。

## Goal / Success Metrics

- `$product-delivery-workflow` 具备明确的发现描述和完整执行规则。
- 生命周期、执行模式、任务类型、Level 0-3 风险、角色路由、阶段闸门、Handoff、结果与复盘均可追溯。
- Skill 通过本地结构校验，README 提供直接调用方式。

## Scope / Out of Scope

- Scope：工作流 Skill、调用元数据、模板、README 与交付状态文档。
- Out of Scope：业务代码、测试基线修复、生产部署、生产数据和高风险角色实现。

## Acceptance Criteria

- Skill 不含占位文本并通过 `quick_validate.py`。
- `agents/openai.yaml` 可解析且默认 Prompt 显式引用技能名。
- 调用示例使用项目真实的 `docs/delivery/` 路径与角色名称。
- 原测试恢复工作保留为独立后续迭代。

## Rollback Trigger

Skill 校验失败、路径指向不存在位置，或编排规则越过用户授权时撤销本轮配置并恢复文档入口。
