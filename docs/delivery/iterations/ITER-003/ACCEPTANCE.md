# ITER-003 Acceptance

| 验收项 | 验证方式 | 结论 |
|---|---|---|
| Skill 不含占位文本且结构有效 | `PYTHONUTF8=1 quick_validate.py ...` | PASS：`Skill is valid!` |
| UI 元数据有效且默认 Prompt 引用 `$product-delivery-workflow` | PyYAML 解析和断言 | PASS |
| 六个角色配置仍可解析和发现 | Python `tomllib` 解析 `.codex/config.toml` 与六个角色 TOML | PASS：7 个文件 |
| 工作流引用的关键项目路径存在 | PowerShell `Test-Path` 检查 11 个入口文件 | PASS |
| README 给出直接调用方式 | 占位符与入口文本检查 | PASS |
| 不影响业务运行 | Git 状态与本轮文件边界检查 | PASS：本轮未修改业务源码 |

## Environment Note

Windows 默认 Python 编码为 GBK 时，校验器首次读取 UTF-8 中文 Skill 报 `UnicodeDecodeError`；启用 `PYTHONUTF8=1` 后同一校验器通过。这是校验器读取环境差异，不是 Skill 结构失败。
