# NewHz 智能口红试色

NewHz 是一个微信小程序产品：用户上传自拍、填写偏好，获得三支口红的 AI 试色预览，支付后解锁完整报告，并可保存或分享结果。仓库还包含一个供单一开发者使用的桌面端运营后台。

## 仓库结构

```text
miniprogram/          微信小程序页面、服务层和公共工具
cloudfunctions/       CloudBase 用户、测试、报告、支付、分享、清理和后台云函数
admin/                React + Vite 开发者后台
tests/                Node.js 契约与回归测试
docs/                 既有产品/技术资料
docs/delivery/        UAPD 协作、迭代、指标、结果和交接资料
.codex/agents/        项目角色配置
.agents/skills/       项目工作流 Skill
```

业务代码与 UAPD 治理资料分离；除根目录 `AGENTS.md`、`README.md` 和 `.codex/agents/` 外，协作资料均位于 `docs/delivery/`。

## 技术栈

- 微信小程序原生 JavaScript、WXML、WXSS
- 腾讯云开发 CloudBase 与 `wx-server-sdk`
- React 18、Vite 5、Ant Design 6（开发者后台）
- Node.js 脚本式测试
- 即梦图像服务适配器与微信支付接口

## 本地开发

### 微信小程序

1. 用微信开发者工具导入仓库根目录的 `project.config.json`。
2. 确认 `miniprogram/utils/constants.js` 中的 CloudBase 环境与目标环境一致。
3. 在开发者工具中编译小程序，并按需上传 `cloudfunctions/` 下的业务云函数。

云函数密钥、支付配置和后台凭据必须通过环境变量或平台配置注入，不得提交到仓库。

### 开发者后台

```powershell
cd admin
npm install
npm run dev
```

生产构建验证：

```powershell
cd admin
npm run build
```

后台运行所需变量以 `admin/.env.example` 和 CloudBase 环境配置为准。

## 测试

运行单个测试：

```powershell
node tests/issue1.test.js
```

运行全部脚本式测试：

```powershell
Get-ChildItem tests\*.test.js,tests\*.test.mjs | ForEach-Object { node $_.FullName }
```

当前测试基线和已知失败见 `docs/delivery/iterations/ITER-001/RESULTS.md`。不要把历史失败描述为本次修改引入的回归。

## 项目资料

- 产品语境与术语：`CONTEXT.md`
- 产品需求：`PRD.md`
- 技术设计：`TECH.md`
- 当前交付状态：`docs/delivery/current.md`
- 当前任务：`docs/delivery/tasks.md`
- 决策记录：`docs/delivery/decisions.md`
- 产品指标：`docs/delivery/metrics.md`
- 迭代索引：`docs/delivery/iterations/INDEX.md`

## 调用 UAPD 工作流

在 Codex 输入框输入 `$product-delivery-workflow` 即可调用。建议同时给出生命周期、执行模式、任务类型、问题或目标、证据、成功标准、范围和限制；风险等级由主协调评估。完整示例见 `.agents/skills/product-delivery-workflow/references/invocation-examples.md`。

项目没有统一的实现子 Agent。工作流会按影响严格路由：小程序或运营后台界面交给 `frontend`，CloudBase 云函数、API、权限和服务端规则交给 `backend`；跨端需求同时调用两者，但必须先由架构角色冻结 API/数据契约，并为两侧建立互不重叠的文件边界和独立交接。QA 始终独立验收。

如果刚更新 Skill 后列表中尚未出现，请新建线程或重载项目。角色配置定义职责，工作流 Skill 才负责选择角色、推进阶段闸门并维护交接和结果。

开始任何 Agent 工作前，请先阅读 `AGENTS.md`。
