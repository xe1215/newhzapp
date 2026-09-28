# ITER-005 新业务契约与设计基线

状态：已冻结（对应 GitHub issue #22）  
设计基准：`D:/index_embed.html`  
实施范围：第一阶段前端 UI 与 mock；暂不接入新后端。

## 信息架构

底部导航固定为：**首页 ｜ 适合我 ｜ 我的**。

九个页面标识固定为：

1. `discover`：产品发现、搜索、分类和双列商品流。
2. `fit`：上传自拍或拍照分析入口。
3. `mine`：我的试色、画像和账户/隐私管理。
4. `analyzing`：AI 美妆画像分析状态。
5. `beauty-profile`：AI 分析结果与确认画像。
6. `edit-profile`：用户修改画像。
7. `product-detail`：单个口红的基本信息和 AI 试色入口。
8. `recommend`：固定展示三个推荐角色，不提前生成图片。
9. `single-tryon`：针对一个 `productId` 进行单支试色，生成 1 张试色图，展示 Before/After。

## 核心业务规则

- 推荐页最多展示 3 个不重复商品，角色为“AI 首选 / 日常通勤 / 风格尝试”。
- 推荐页点击商品后才进入单支试色；一次任务只处理一个商品并返回一张结果图。
- 三个推荐商品分别试色时，是三次独立任务，不组成报告。
- AI 分析结果必须允许用户修改；原始 AI 输出和用户覆盖值分开保存。
- 第一阶段所有页面从 mock adapter 获取数据，不调用旧报告、支付、分享或三图生成服务。

## ViewModel 最小字段

### ProductCardVM

`id`, `brand`, `productName`, `shadeCode`, `shadeName`, `color`, `finish`, `scenes`, `image`, `isActive`。

### BeautyProfileVM

`id`, `schemaVersion`, `aiOutput`, `userOverrides`, `confirmedProfile`, `updatedAt`。

`confirmedProfile` 使用受控值：肤色、冷暖、脸型、整体风格、使用场景和适合色系。

### RecommendationCardVM

`productId`, `role`, `roleLabel`, `matchScore`, `reason`, `product`。

### TryOnJobVM

`id`, `productId`, `selfieId`, `status`, `source`, `resultImage`, `beforeImage`, `createdAt`, `error`。

### TryOnHistoryItemVM

`id`, `productId`, `product`, `resultImage`, `createdAt`, `status`, `deletedAt`。

## 商品标签字典

商品标签必须由服务端白名单校验，字段包括：

- 色系
- 冷暖
- 明度
- 饱和度
- 妆感
- 场景
- 风格

标签缺失或商品状态为 inactive 时，不得进入推荐候选。

## 积分边界

- 单支试色预留 `singleTryOnCostCredits` 配置项，但具体数值待产品确认。
- 积分套餐价格、赠送积分和过期规则待产品确认；未确认前只能展示“积分功能即将开放”或使用开发环境 mock。
- 客户端不得直接修改余额；正式接入时由服务端使用幂等键完成扣减与失败返还。

## 设计稿旧业务清理清单

以下内容不属于新业务，不得出现在设计基线或小程序运行路径中：

- “我的报告”及报告数量/报告历史入口
- “退款说明”及退款入口
- “AI试色 · 效果示意”这一会误导为已生成结果的推荐卡文案
- “查看完整报告”按钮
- 报告解锁、报告分享、三图批量生成和报告支付语义

上述清理不改变 HTML 的布局、颜色、字号、尺寸、比例或动效。
