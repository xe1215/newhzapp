# 积分购买基础契约（Issue #31）

状态：仅开发 Mock；不开放真实支付。

## 数据模型

- `credit_products`：`_id`、`status`、`mode`、`amountCents`、`currency`、`credits`、`bonusCredits`。开发 Mock 只接受四档固定套餐：1 积分 / ¥1、20 积分 / ¥16、40 积分 / ¥28、60 积分 / ¥36；均无赠送积分。服务端会拒绝价格、积分或赠送数量不符的记录。
- `credit_orders`：除订单号、OPENID、套餐与支付快照外，保存 `unitPriceCents`（分别为 100/80/70/60 分）、`remainingCredits`、`purchaseSequence`、`expiresAt: null`。订单创建时固定快照，付款确认后才增加可用积分；积分永久有效。客户端传入的金额/积分无效。
- `credit_accounts` / `credit_ledger`：沿用 Issue #30 的账户与流水；可信支付结算在事务中增加余额和一笔 `credit_purchase` 流水。单支试色按付款顺序 FIFO 扣对应订单的 `remainingCredits`，失败或超时退回原订单。既有无订单归属的开发 Mock 余额仍可用于试色，但不算作任何订单的可退款积分。

## 接口和信任边界

- 默认 `listCreditProducts` 返回 `coming_soon`；默认 `createCreditOrder` 返回 `CREDIT_PRODUCTS_UNCONFIRMED`。
- 显式开发环境 `CREDIT_PURCHASE_MODE=mock` 可查询有效 Mock 套餐、创建订单和按 OPENID 查询本人订单；不会返回真实微信支付参数。
- `confirmCreditOrder` 不接受客户端宣称的支付成功；旧 `createReportOrder`、`confirmPayment`、`requestRefund` action 已退出支付云函数运行入口。
- `getCreditRefundQuote` 只允许订单本人查询已支付 Mock 订单，按该订单当前未使用积分 × 购买时单价返回人民币分金额。例如 20 积分 ¥16，已用 1 积分，报价为 19 × ¥0.8 = ¥15.2。它只报价，不扣积分、不打款；退款执行及回调尚未接入。正式退款必须在服务端重新核算并原子收回剩余积分，不能直接使用此前查询的报价。
- 只有服务端在验证微信支付通知的签名/解密后，才可调用内部 `settleVerifiedCreditOrder`。结算再次核对订单号、金额、币种、付款人 OPENID、成功状态和交易号；同一交易只能入账一次。当前没有接入集成中心生成的真实回调函数，不能把 Mock 验证标记视为生产签名验证。

## 上线闸门

1. 四档金额、无赠送和永久有效已确认；上线前把四条对应 `credit_products` 记录写入目标环境并复核，仍不得仅凭套餐确认就开启真实支付。
2. 在真实 CloudBase 环境创建集合及必要索引，并禁止客户端直接写 `credit_products`、`credit_orders`、`credit_accounts`、`credit_ledger`。
3. 确认小程序 AppID、商户绑定及实际集成中心支付函数名称；由服务端创建微信支付订单，接入真实签名验证回调和订单查询，不以 `wx.requestPayment` 的前端成功回调作为入账凭据。
4. 实现可信退款申请、微信退款与退款回调/查询、按原订单未用积分原子收回及对账；处理退款与正在运行的试色并发。完成真机、沙箱或低额支付与重复回调/金额不符/退款对账验收后，才能评估开启正式支付模式。

旧 `tests/issue7.test.js`、`tests/issue9.test.js` 仍断言报告支付/解锁/退款行为；这些断言与 Issue #31 明确要求退役的 action 相冲突，不能作为新支付契约的通过条件。新流程以 `tests/issue31.test.js` 和 Issue #22–#31 回归为准，旧测试迁移随最终旧业务清理任务处理。
