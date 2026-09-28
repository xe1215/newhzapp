# ITER-003 Retro

## What Worked

- 角色职责、项目事实源和治理目录已经存在，工作流只需补上编排层即可闭环。
- 将详细模板和调用示例放入 `references/`，避免每次加载 Skill 时占用不必要上下文。

## What Was Missing

- 初始 Skill 是生成器 TODO 模板，说明此前“创建了 Skill 目录”却没有真正实现工作流。
- 初始迭代包没有 `RETRO.md`，当前 handoff 也未覆盖统一契约的全部字段。
- README 没有用户可直接执行的调用语法。

## Improvement

- 新建或大幅修改 Skill 后必须运行 `quick_validate.py` 并扫描 scaffold 占位符。
- Windows 中文 Skill 校验统一启用 UTF-8 模式。
- 后续每个持续迭代必须同时创建 RESULTS 和 RETRO，不能用代码完成替代发布观察结论。

## Remaining Work

- ITER-005 恢复当前测试基线。
- 安全、数据库、DevOps 和发布角色在实际 Level 3 任务启动前按需配置，不在本轮机械扩充。
