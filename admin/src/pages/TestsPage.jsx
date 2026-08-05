import React, { useEffect } from "react";
import { getTestDetail, listTests } from "../lib/admin-api";
import { DetailList, FilterInput, FiltersBar } from "../components/admin-primitives";
import { buildTestDetailItems } from "../components/detail-builders";
import { copyText, emptyInvestigationFilters } from "../utils/admin-format";
import { RecordDetailSection, RecordTableSection, RecordWorkbenchLayout } from "../components/record-workbench";
import { useOperationalDataView } from "../hooks/useOperationalDataView";

export default function TestsPage({ token }) {
  const {
    filters,
    setFilters,
    records: tests,
    selectedDetail,
    loading,
    detailLoading,
    errorText,
    successText,
    setSuccessText,
    loadData,
    loadSelectedDetail: handleSelect,
  } = useOperationalDataView({
    initialFilters: emptyInvestigationFilters(),
    loadList: (currentFilters) => listTests(token, currentFilters),
    loadDetail: (testId) => getTestDetail(token, testId),
    listErrorMessage: "无法加载测试记录。",
    detailErrorMessage: "无法加载测试详情。",
  });

  useEffect(() => {
    loadData();
  }, [token, filters.openid, filters.status, filters.startDate, filters.endDate]);

  async function handleCopyOpenid() {
    const ok = await copyText(selectedDetail?.openid || "");
    setSuccessText(ok ? "openid 已复制。" : "复制失败，请手动复制。");
  }

  return (
    <section className="module-panel">
      <header className="module-header overview-header">
        <div>
          <p className="module-eyebrow">测试记录</p>
          <h2>测试记录</h2>
          <p className="module-copy">查看试色流程的生成状态、偏好信息和生命周期，快速定位用户卡点。</p>
        </div>
      </header>

      <FiltersBar>
        <FilterInput label="openid" value={filters.openid} onChange={(event) => setFilters((current) => ({ ...current, openid: event.target.value }))} placeholder="输入 openid" />
        <FilterInput label="状态" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} placeholder="如 success / failed" />
        <FilterInput label="开始日期" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} placeholder="YYYY-MM-DD" />
        <FilterInput label="结束日期" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} placeholder="YYYY-MM-DD" />
      </FiltersBar>

      {loading ? <p className="module-copy">正在加载测试记录...</p> : null}
      {errorText ? <p className="error-text">{errorText}</p> : null}
      {successText ? <p className="success-text">{successText}</p> : null}

      <RecordWorkbenchLayout
        left={
          <RecordTableSection title="测试列表">
          <div className="table-shell">
            <table className="record-table">
              <thead>
                <tr>
                  <th>测试 ID</th>
                  <th>openid</th>
                  <th>状态</th>
                  <th>生成状态</th>
                  <th>当前报告</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((item) => (
                  <tr key={item.testId}>
                    <td>{item.testId}</td>
                    <td>{item.openidMasked || "-"}</td>
                    <td>{item.status || "-"}</td>
                    <td>{item.generationStatus || "-"}</td>
                    <td>{item.currentReportId || "-"}</td>
                    <td className="row-actions">
                      <button type="button" className="ghost-button light-ghost" onClick={() => handleSelect(item.testId)}>
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
            title="测试详情"
            loading={detailLoading}
            hasSelection={Boolean(selectedDetail)}
            emptyText="选择一条记录后在这里查看完整详情。"
            actions={
              selectedDetail ? (
                <button type="button" className="ghost-button light-ghost" onClick={handleCopyOpenid}>
                  复制 openid
                </button>
              ) : null
            }
          >
            <DetailList items={buildTestDetailItems(selectedDetail)} />
          </RecordDetailSection>
        }
      />
    </section>
  );
}
