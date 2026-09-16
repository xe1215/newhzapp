# 当前交接

## Handoff Contract：账号初始化函数单包依赖修复

- Contract ID：`HANDOFF-ITER-005-003`
- 状态：已部署，待首页回归
- 目标：让 `user` 云函数单独部署时自包含运行时，消除首页误显示“正在准备账号”。
- 证据：`cloudfunctions/user/index.js` 改为引用包内 `./business-runtime`，并新增同目录运行时文件；`tests/issue1.test.js` 已覆盖。
- 部署证据：CLI 部署成功；函数详情 `Active/Available`，`CodeResult: success`，更新时间 `2026-09-13 15:07:01`。
- 下一步：在微信开发者工具重新打开首页，确认静默登录成功且点击“开始试色”进入上传页。

## Handoff Contract：报告函数线上启动修复

- Contract ID：`HANDOFF-ITER-005-002`
- 状态：待报告页回归
- 目标：修复 `report` 云函数单函数部署包缺少共享运行时导致的 `MODULE_NOT_FOUND`。
- 证据：`report-core.js` 已改用函数包内 `./business-runtime`；`report` 已部署到 `newhzapp-d4g8fk4yiaa3fa679`，函数详情为 `Active/Available`。
- 下一步：重新打开报告页，确认报告内容、图片和查看事件恢复。

## Handoff Contract：其余函数单包依赖修复

- Contract ID：`HANDOFF-ITER-005-004`
- 状态：已部署，待小程序链路回归
- 目标：消除 `payment`、`share`、`cleanupExpiredData` 对包外 `../_shared/business-runtime` 的依赖。
- 证据：三个函数均新增包内 `business-runtime.js` 并改用 `./business-runtime`；payment/share 线上详情为 `Active/Available` 且代码结果成功，cleanupExpiredData 已上传并处于更新完成流程。
- 下一步：微信开发者工具重新编译后，依次验证首页登录、预览加载、解锁支付和分享入口。

## Handoff Contract：报告入口精简

- Contract ID：`HANDOFF-ITER-005-005`
- 状态：已完成，待微信开发者工具回归
- 目标：移除付费报告顶部返回/分享按钮与报告首页底部分享/隐藏按钮，避免支付链路返回时停留在中间页面。
- 证据：对应 WXML 节点已删除；支付结果进入报告详情增加 `returnToReports=1`，报告返回逻辑按标记重定向到报告列表。
- 下一步：重新编译后验证支付完成、查看报告和系统返回行为。

## Handoff Contract：主协调 -> 主协调 / QA

### Contract ID / Lifecycle / Execution Mode / Task Type / Stage / Status

- Contract ID：`HANDOFF-ITER-004-001`
- Lifecycle：持续产品迭代
- Execution Mode：局部修改
- Task Type：测试基线恢复
- Stage：UAPD 工作流已激活，准备质量恢复迭代
- Status：Active

### From / To / Objective

- From：ITER-004 主协调
- To：ITER-005 主协调 / QA
- Objective：使用 `$product-delivery-workflow` 建立 ITER-005，分类当前 18 个失败测试文件并恢复可信发布闸门。

### Scope / Out of Scope

- Scope：测试失败分类、预期行为确认、必要的最小测试或业务修复、全量回归。
- Out of Scope：真实微信支付、服务端自拍审核、生产部署和生产数据写入；这些内容分别建立 Level 3 迭代。

### Completed / Required Reading

已完成：

- 校准 `PRD.md`、`TECH.md`、`CONTEXT.md` 与 `docs/admin-plan.md`。
- 补齐并验证 UAPD Skill、调用元数据、模板和 README 调用入口。
- 保留 34 个测试文件中 18 个失败的真实基线，没有把它描述为通过。

必读：

- `AGENTS.md`
- `PRD.md`
- `TECH.md`
- `CONTEXT.md`
- `docs/delivery/current.md`
- `docs/delivery/backlog.md`
- `docs/delivery/iterations/ITER-001/RESULTS.md`
- `docs/delivery/iterations/ITER-003/RESULTS.md`
- `.agents/skills/product-delivery-workflow/SKILL.md`
- `docs/delivery/iterations/ITER-004/RESULTS.md`

### Next Tasks / Expected Outputs / Acceptance Criteria

Next Tasks：

1. 创建 ITER-005 及测试失败分类表。
2. 将每个失败归类为真实行为回归、过期结构断言、环境兼容或测试基础设施问题。
3. 证明预期行为后实施最小修复并重新运行全量测试。

Expected Outputs：ITER-005 的 Brief、Impact、Plan、Acceptance、Results、Retro，更新后的 tasks、current、handoff，以及必要的测试/源码修复。

Acceptance Criteria：18 个失败全部有分类、证据、负责人和阻塞判断；修复后全量测试通过，或每个剩余失败都有主协调/QA 批准的例外；不得删除有价值的行为断言制造绿线。

### File Boundaries / File Owner / Decision Authority

- 初始允许：`tests/**`、测试入口、`docs/delivery/**`。
- 业务代码仅在失败被证明为真实缺陷后按模块开放。
- 禁止：生产部署、生产数据写入、真实支付配置、本地密钥文件。
- File Owner：前端子 Agent 负责客户端代码与前端测试；后端子 Agent 负责云函数、服务和后端测试；QA 负责分类和验收证据；主协调负责治理文档。
- Decision Authority：QA 决定失败分类与发布阻塞；实现决定局部修复；架构处理公共契约争议；产品处理预期行为争议。

### Compatibility Requirements / Assumptions / Open Questions

- Compatibility：保持现有小程序、CloudBase action、集合和后台契约；任何预期行为变化先更新产品/架构决策。
- Assumption：ITER-001 记录的 34/18 基线在目标工作区仍可复现。
- Open Questions：18 个失败中真实回归与断言漂移各占多少，需在 ITER-005 重新运行后确定。

### Risks / Validation Evidence

- Risk：把重构后的新行为误判为回归，或通过删除断言掩盖真实缺陷。
- Evidence：ITER-003 Skill 校验、YAML、TOML、路径和占位符检查全部通过；未执行生产操作。

### Release And Rollback Notes

ITER-005 在测试基线恢复前不满足业务发布准入。若修复改变公共契约或高风险路径，暂停并升级到架构/产品评审；代码回滚与数据回滚必须分别说明。

### Recommended Next Prompt

```text
$product-delivery-workflow

生命周期：持续产品迭代
执行模式：局部修改
任务类型：测试基线恢复
本轮问题：现有全量测试 34 个文件中 18 个失败，无法作为可信发布闸门。
目标：建立 ITER-005，分类并修复当前测试基线。
成功标准：先证明每个失败的预期行为，再决定修改测试还是业务代码；全量通过或每个剩余失败有批准例外。
范围限制：不接入真实支付，不实现自拍审核，不执行生产操作。
```
