import React, { useState } from "react";
import { Tabs } from "antd";
import OperationalResourcePage from "../components/OperationalResourcePage";
import { getCreditAccountDetail, getCreditLedgerDetail, listCreditAccounts, listCreditLedger } from "../lib/admin-api";
import { formatTimestamp } from "../utils/admin-format";

const accounts = {
  title: "积分账户", description: "查看用户的可用积分和运行中任务数。",
  filters: [{ key: "openid", label: "openid" }], idField: "accountId",
  columns: [
    { key: "accountId", label: "账户 ID" }, { key: "openidMasked", label: "openid" },
    { key: "balance", label: "余额" }, { key: "activeCount", label: "运行中任务" },
    { key: "updatedAt", label: "更新时间", format: formatTimestamp },
  ],
  list: listCreditAccounts, detail: getCreditAccountDetail,
};
accounts.detailFields = accounts.columns;

const ledger = {
  title: "积分流水", description: "查看积分购买、扣减和返还记录。",
  filters: [{ key: "openid", label: "openid" }, { key: "type", label: "类型" },
    { key: "orderId", label: "订单 ID" }, { key: "jobId", label: "任务 ID" }],
  idField: "ledgerId",
  columns: [
    { key: "ledgerId", label: "流水 ID" }, { key: "openidMasked", label: "openid" },
    { key: "type", label: "类型" }, { key: "amount", label: "积分变动" },
    { key: "createdAt", label: "发生时间", format: formatTimestamp },
  ],
  list: listCreditLedger, detail: getCreditLedgerDetail,
};
ledger.detailFields = [...ledger.columns, { key: "orderId", label: "订单 ID" }, { key: "jobId", label: "任务 ID" }];

export default function CreditsPage({ token }) {
  const [active, setActive] = useState("accounts");
  return <Tabs activeKey={active} onChange={setActive} items={[
    { key: "accounts", label: "积分账户", children: <OperationalResourcePage token={token} {...accounts} /> },
    { key: "ledger", label: "积分流水", children: <OperationalResourcePage token={token} {...ledger} /> },
  ]} />;
}
