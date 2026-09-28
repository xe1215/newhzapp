import React from "react";
import OperationalResourcePage from "../components/OperationalResourcePage";
import { getCreditOrderDetail, listCreditOrders } from "../lib/admin-api";
import { formatCurrency, formatTimestamp } from "../utils/admin-format";

const filters = [
  { key: "openid", label: "openid" }, { key: "status", label: "订单状态" },
  { key: "productId", label: "套餐 ID" }, { key: "outTradeNo", label: "商户单号" },
  { key: "startDate", label: "开始日期", placeholder: "YYYY-MM-DD" },
  { key: "endDate", label: "结束日期", placeholder: "YYYY-MM-DD" },
];
const columns = [
  { key: "orderId", label: "订单 ID" }, { key: "openidMasked", label: "openid" },
  { key: "status", label: "状态" }, { key: "credits", label: "购买积分" },
  { key: "remainingCredits", label: "剩余积分" },
  { key: "amountCents", label: "金额", format: formatCurrency },
  { key: "createdAt", label: "创建时间", format: formatTimestamp },
];
const detailFields = [
  ...columns, { key: "productId", label: "套餐 ID" },
  { key: "outTradeNo", label: "商户单号" },
  { key: "paidAt", label: "支付时间", format: formatTimestamp },
];

export default function CreditOrdersPage({ token }) {
  return <OperationalResourcePage token={token} title="积分订单" description="查看积分套餐订单、支付状态及剩余积分。"
    filters={filters} columns={columns} detailFields={detailFields} idField="orderId"
    list={listCreditOrders} detail={getCreditOrderDetail} />;
}
