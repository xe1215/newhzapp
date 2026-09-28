# ITER-001 Impact Analysis

| 维度 | 影响 |
|---|---|
| User | 无用户可见功能变化 |
| Product | 建立范围、指标、结果和 backlog 的事实源 |
| UX/UI | 无界面变化；新增 UX/UI 角色约束 |
| Code | 不修改业务源码；替换 README，新增治理和角色配置 |
| API | 无变化 |
| Data | 无数据库读写或模型变化 |
| Security | 不接触密钥或生产数据；文档强化敏感信息边界 |
| Operations | 不部署；记录现有构建和测试基线 |
| Test | 运行现有全量测试，记录但不修复历史失败 |
| Rollback | 文档和 TOML 可独立删除；README/.gitignore 可恢复 |

## Compatibility

不改变 `project.config.json`、小程序路由、CloudBase 云函数目录、admin 依赖或构建脚本。`.codex/` 中既有技能继续保持忽略，仅显式跟踪项目配置和角色文件。
