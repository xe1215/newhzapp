import React, { useEffect } from "react";
import { flagReport, getReportDetail, listReports } from "../lib/admin-api";
import { DetailList, FilterInput, FiltersBar } from "../components/admin-primitives";
import { buildReportDetailItems } from "../components/detail-builders";
import { emptyInvestigationFilters } from "../utils/admin-format";
import { RecordDetailSection, RecordTableSection, RecordWorkbenchLayout } from "../components/record-workbench";
import { useOperationalDataView } from "../hooks/useOperationalDataView";

export default function ReportsPage({ token }) {
  const {
    filters,
    setFilters,
    records: reports,
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
    initialFilters: emptyInvestigationFilters({ testId: "" }),
    loadList: (currentFilters) => listReports(token, currentFilters),
    loadDetail: (reportId) => getReportDetail(token, reportId),
    listErrorMessage: "\u65e0\u6cd5\u52a0\u8f7d\u62a5\u544a\u8bb0\u5f55\u3002",
    detailErrorMessage: "\u65e0\u6cd5\u52a0\u8f7d\u62a5\u544a\u8be6\u60c5\u3002",
  });

  useEffect(() => {
    loadData();
  }, [token, filters.openid, filters.status, filters.testId, filters.startDate, filters.endDate]);

  async function handleFlag(operation) {
    if (!selectedDetail?.reportId) {
      return;
    }

    const actionLabel = operation === "hide" ? "\u9690\u85cf" : "\u6807\u8bb0";
    const reason = window.prompt(`\u8bf7\u8f93\u5165${actionLabel}\u539f\u56e0`, "");
    if (reason === null) {
      return;
    }

    setErrorText("");
    setSuccessText("");

    try {
      await flagReport(token, selectedDetail.reportId, operation, reason);
      setSuccessText(
        operation === "hide" ? "\u62a5\u544a\u5df2\u9690\u85cf\u3002" : "\u62a5\u544a\u5df2\u6807\u8bb0\u5f02\u5e38\u3002"
      );
      await handleSelect(selectedDetail.reportId);
      await loadData();
    } catch (error) {
      setErrorText(error.message || "\u5904\u7406\u62a5\u544a\u72b6\u6001\u5931\u8d25\u3002");
    }
  }

  return (
    <section className="module-panel">
      <header className="module-header overview-header">
        <div>
          <p className="module-eyebrow">{"\u62a5\u544a\u8bb0\u5f55"}</p>
          <h2>{"\u62a5\u544a\u8bb0\u5f55"}</h2>
          <p className="module-copy">
            {"\u67e5\u770b\u62a5\u544a\u8d44\u4ea7\u3001\u63a8\u8350\u5feb\u7167\u4e0e\u5ba1\u6838\u72b6\u6001\uff0c\u652f\u6301\u540e\u53f0\u9690\u85cf\u548c\u5f02\u5e38\u6807\u8bb0\u3002"}
          </p>
        </div>
      </header>

      <FiltersBar>
        <FilterInput
          label="openid"
          value={filters.openid}
          onChange={(event) => setFilters((current) => ({ ...current, openid: event.target.value }))}
          placeholder={"\u8f93\u5165 openid"}
        />
        <FilterInput
          label={"\u72b6\u6001"}
          value={filters.status}
          onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          placeholder="ready / hidden"
        />
        <FilterInput
          label={"\u6d4b\u8bd5 ID"}
          value={filters.testId}
          onChange={(event) => setFilters((current) => ({ ...current, testId: event.target.value }))}
          placeholder={"\u8f93\u5165\u6d4b\u8bd5 ID"}
        />
        <FilterInput
          label={"\u5f00\u59cb\u65e5\u671f"}
          value={filters.startDate}
          onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
          placeholder="YYYY-MM-DD"
        />
        <FilterInput
          label={"\u7ed3\u675f\u65e5\u671f"}
          value={filters.endDate}
          onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
          placeholder="YYYY-MM-DD"
        />
      </FiltersBar>

      {loading ? <p className="module-copy">{"\u6b63\u5728\u52a0\u8f7d\u62a5\u544a\u8bb0\u5f55..."}</p> : null}
      {errorText ? <p className="error-text">{errorText}</p> : null}
      {successText ? <p className="success-text">{successText}</p> : null}

      <RecordWorkbenchLayout
        left={
          <RecordTableSection title={"\u62a5\u544a\u5217\u8868"}>
            <div className="table-shell">
              <table className="record-table">
                <thead>
                  <tr>
                    <th>{"\u62a5\u544a ID"}</th>
                    <th>{"\u6d4b\u8bd5 ID"}</th>
                    <th>openid</th>
                    <th>{"\u72b6\u6001"}</th>
                    <th>{"\u5f02\u5e38\u6807\u8bb0"}</th>
                    <th>{"\u64cd\u4f5c"}</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((item) => (
                    <tr key={item.reportId}>
                      <td>{item.reportId}</td>
                      <td>{item.testId || "-"}</td>
                      <td>{item.openidMasked || "-"}</td>
                      <td>{item.status || "-"}</td>
                      <td>{item.flaggedAt || "-"}</td>
                      <td className="row-actions">
                        <button type="button" className="ghost-button light-ghost" onClick={() => handleSelect(item.reportId)}>
                          {"\u67e5\u770b\u8be6\u60c5"}
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
            title={"\u62a5\u544a\u8be6\u60c5"}
            loading={detailLoading}
            hasSelection={Boolean(selectedDetail)}
            emptyText={"\u9009\u62e9\u4e00\u6761\u62a5\u544a\u540e\u53ef\u67e5\u770b\u5b8c\u6574\u8d44\u4ea7\u548c\u5ba1\u6838\u4fe1\u606f\u3002"}
            actions={
              selectedDetail ? (
                <div className="row-actions">
                  <button type="button" className="ghost-button light-ghost" onClick={() => handleFlag("hide")}>
                    {"\u9690\u85cf\u62a5\u544a"}
                  </button>
                  <button type="button" className="ghost-button light-ghost" onClick={() => handleFlag("flag")}>
                    {"\u6807\u8bb0\u5f02\u5e38"}
                  </button>
                </div>
              ) : null
            }
          >
            {selectedDetail ? (
              <>
                <DetailList items={buildReportDetailItems(selectedDetail)} />
                <pre className="csv-textarea">{JSON.stringify(selectedDetail?.snapshot || {}, null, 2)}</pre>
              </>
            ) : null}
          </RecordDetailSection>
        }
      />
    </section>
  );
}
