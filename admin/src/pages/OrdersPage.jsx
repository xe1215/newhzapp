import React, { useEffect, useState } from "react";
import { getOrderDetail, listOrders } from "../lib/admin-api";
import { DetailList, FilterInput, FiltersBar } from "../components/admin-primitives";
import { buildOrderDetailItems } from "../components/detail-builders";
import { copyText, emptyInvestigationFilters, formatCurrency, formatTimestamp } from "../utils/admin-format";
import { RecordDetailSection, RecordTableSection, RecordWorkbenchLayout } from "../components/record-workbench";
import { useOperationalDataView } from "../hooks/useOperationalDataView";

export default function OrdersPage({ token }) {
  const {
    filters,
    setFilters,
    records: orders,
    selectedDetail,
    loading,
    detailLoading,
    errorText,
    setErrorText,
    successText,
    setSuccessText,
    loadData,
    loadSelectedDetail: handleSelect,
  } = useOperationalDataView({
    initialFilters: emptyInvestigationFilters({
      reportId: "",
      outTradeNo: "",
    }),
    loadList: (currentFilters) => listOrders(token, currentFilters),
    loadDetail: (orderId) => getOrderDetail(token, orderId),
    listErrorMessage: "无法加载订单记录。",
    detailErrorMessage: "无法加载订单详情。",
  });

  useEffect(() => {
    loadData();
  }, [
    token,
    filters.openid,
    filters.status,
    filters.reportId,
    filters.outTradeNo,
    filters.startDate,
    filters.endDate,
  ]);

  async function handleCopyOpenid() {
    const ok = await copyText(selectedDetail?.openid || "");
    setSuccessText(ok ? "openid 已复制。" : "复制失败，请手动复制。");
  }

  return (
    <section className="module-panel">
      <header className="module-header overview-header">
        <div>
          <p className="module-eyebrow">订单与退款</p>
          <h2>订单与退款</h2>
          <p className="module-copy">集中处理支付状态、退款跟进和订单备注，方便运营快速闭环异常订单。</p>
        </div>
      </header>

      <FiltersBar>
        <FilterInput label="openid" value={filters.openid} onChange={(event) => setFilters((current) => ({ ...current, openid: event.target.value }))} placeholder="输入 openid" />
        <FilterInput label="订单状态" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} placeholder="如 paid" />
        <FilterInput label="报告 ID" value={filters.reportId} onChange={(event) => setFilters((current) => ({ ...current, reportId: event.target.value }))} placeholder="输入报告 ID" />
        <FilterInput label="商户单号" value={filters.outTradeNo} onChange={(event) => setFilters((current) => ({ ...current, outTradeNo: event.target.value }))} placeholder="输入商户单号" />
      </FiltersBar>

      {loading ? <p className="module-copy">正在加载订单记录...</p> : null}
      {errorText ? <p className="error-text">{errorText}</p> : null}
      {successText ? <p className="success-text">{successText}</p> : null}

      <RecordWorkbenchLayout
        left={
          <RecordTableSection title="订单列表">
          <div className="table-shell">
            <table className="record-table">
              <thead>
                <tr>
                  <th>订单 ID</th>
                  <th>openid</th>
                  <th>状态</th>
                  <th>金额</th>
                  <th>订单时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((item) => (
                  <tr key={item.orderId}>
                    <td>{item.orderId}</td>
                    <td>{item.openidMasked || "-"}</td>
                    <td>{item.status || "-"}</td>
                    <td>{formatCurrency(item.amountCents)}</td>
                    <td>{formatTimestamp(item.createdAt || item.paidAt)}</td>
                    <td className="row-actions">
                      <button type="button" className="ghost-button light-ghost" onClick={() => handleSelect(item.orderId)}>
                        查看详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </RecordTableSection>
        }
        right={
          <RecordDetailSection
            title="订单详情"
            loading={detailLoading}
            hasSelection={Boolean(selectedDetail)}
            emptyText="选择一条订单后可在这里查看支付和报告解锁状态。"
            actions={
              selectedDetail ? (
                <button type="button" className="ghost-button light-ghost" onClick={handleCopyOpenid}>
                  复制 openid
                </button>
              ) : null
            }
          >
            <DetailList items={buildOrderDetailItems(selectedDetail)} />
          </RecordDetailSection>
        }
      />
    </section>
  );
}
