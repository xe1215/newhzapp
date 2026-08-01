import React, { useEffect, useState } from "react";
import { getOrderDetail, listOrders, updateOrderRefundHandling } from "../lib/admin-api";
import { DetailList, FilterInput, FiltersBar } from "../components/admin-primitives";
import { buildOrderDetailItems } from "../components/detail-builders";
import { copyText, emptyInvestigationFilters, formatCurrency } from "../utils/admin-format";
import { RecordDetailSection, RecordTableSection, RecordWorkbenchLayout } from "../components/record-workbench";

export default function OrdersPage({ token }) {
  const [filters, setFilters] = useState(
    emptyInvestigationFilters({
      refundStatus: "",
      reportId: "",
      outTradeNo: "",
    })
  );
  const [orders, setOrders] = useState([]);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [refundForm, setRefundForm] = useState({
    refundStatus: "pending",
    refundReason: "",
    adminNote: "",
  });
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  async function loadData() {
    setLoading(true);
    setErrorText("");

    try {
      const data = await listOrders(token, filters);
      setOrders(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      setErrorText(error.message || "无法加载订单记录。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [
    token,
    filters.openid,
    filters.status,
    filters.refundStatus,
    filters.reportId,
    filters.outTradeNo,
    filters.startDate,
    filters.endDate,
  ]);

  async function handleSelect(orderId) {
    setDetailLoading(true);
    setErrorText("");
    setSuccessText("");

    try {
      const detail = await getOrderDetail(token, orderId);
      setSelectedDetail(detail);
      setRefundForm({
        refundStatus: detail.refundStatus || "pending",
        refundReason: detail.refundReason || "",
        adminNote: detail.adminNote || "",
      });
    } catch (error) {
      setErrorText(error.message || "无法加载订单详情。");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSaveRefund(event) {
    event.preventDefault();
    if (!selectedDetail?.orderId) {
      return;
    }

    setErrorText("");
    setSuccessText("");

    try {
      await updateOrderRefundHandling(token, selectedDetail.orderId, refundForm);
      setSuccessText("退款处理信息已更新。");
      await handleSelect(selectedDetail.orderId);
      await loadData();
    } catch (error) {
      setErrorText(error.message || "更新退款处理失败。");
    }
  }

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
        <FilterInput label="退款状态" value={filters.refundStatus} onChange={(event) => setFilters((current) => ({ ...current, refundStatus: event.target.value }))} placeholder="如 pending" />
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
                  <th>退款状态</th>
                  <th>金额</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((item) => (
                  <tr key={item.orderId}>
                    <td>{item.orderId}</td>
                    <td>{item.openidMasked || "-"}</td>
                    <td>{item.status || "-"}</td>
                    <td>{item.refundStatus || "-"}</td>
                    <td>{formatCurrency(item.amountCents)}</td>
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
            emptyText="选择一条订单后可在这里查看并处理退款。"
            actions={
              selectedDetail ? (
                <button type="button" className="ghost-button light-ghost" onClick={handleCopyOpenid}>
                  复制 openid
                </button>
              ) : null
            }
          >
            <>
              <DetailList items={buildOrderDetailItems(selectedDetail)} />
              <form className="editor-form" onSubmit={handleSaveRefund}>
                <label className="field-stack">
                  <span>退款状态</span>
                  <select className="field-input" value={refundForm.refundStatus} onChange={(event) => setRefundForm((current) => ({ ...current, refundStatus: event.target.value }))}>
                    <option value="pending">pending</option>
                    <option value="refunded">refunded</option>
                    <option value="rejected">rejected</option>
                  </select>
                </label>
                <label className="field-stack">
                  <span>退款原因</span>
                  <input className="field-input" value={refundForm.refundReason} onChange={(event) => setRefundForm((current) => ({ ...current, refundReason: event.target.value }))} />
                </label>
                <label className="field-stack" style={{ gridColumn: "1 / -1" }}>
                  <span>后台备注</span>
                  <textarea className="csv-textarea" value={refundForm.adminNote} onChange={(event) => setRefundForm((current) => ({ ...current, adminNote: event.target.value }))} />
                </label>
                <div className="form-actions">
                  <button type="submit" className="primary-button slim-button">
                    保存退款处理
                  </button>
                </div>
              </form>
            </>
          </RecordDetailSection>
        }
      />
    </section>
  );
}
