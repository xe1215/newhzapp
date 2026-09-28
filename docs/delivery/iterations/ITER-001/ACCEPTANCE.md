# ITER-001 Acceptance

| 验收项 | 验证方式 | 结论 |
|---|---|---|
| 六个核心文件存在 | 文件清单检查 | 通过 |
| 治理资料与业务源码分离 | 路径检查 | 通过：集中于 `docs/delivery/` |
| 六个角色已配置 | TOML 解析 + `codex doctor` 加载项目配置 | 通过；严格字段模式受用户级旧配置阻塞 |
| backlog、iterations、metrics、results 存在 | 文件清单和链接检查 | 通过 |
| 不改变业务行为 | Git diff 与未跟踪文件范围检查 | 通过：仅 README、治理文档、Agent 配置和 `.gitignore` |
| 后台仍可生产构建 | `cd admin; npm run build` | 通过 |
| 当前测试状态被如实记录 | 全量测试文件执行 | 通过：34 个中 18 个失败，已记录为基线风险 |

## 发布判断

本轮是内部治理迭代，不涉及生产发布。治理产物可在最终解析与 diff 检查通过后验收；现有业务版本因全量测试失败不满足发布准入。

## 验证限制

`codex --strict-config` 会先因用户级 `C:\Users\20021\.codex\config.toml` 中的旧字段 `disable_response_storage` 失败，无法隔离为本项目执行严格字段检查。本轮未修改该全局文件；项目配置已被普通诊断加载，7 个 TOML 文件均通过标准语法解析。
