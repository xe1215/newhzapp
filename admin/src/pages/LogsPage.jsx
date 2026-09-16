import React, { useEffect, useState } from "react";
import { exportEventsCsv, getEventDetail, getProviderRunDetail, listEvents, listProviderRuns } from "../lib/admin-api";
import { DetailList, FilterInput, FiltersBar } from "../components/admin-primitives";
import { buildEventDetailItems, buildRunDetailItems } from "../components/detail-builders";
import { emptyInvestigationFilters, formatTimestamp } from "../utils/admin-format";
import { downloadTextFile } from "../utils/download-file";
import { RecordDetailSection, RecordTableSection, RecordWorkbenchLayout } from "../components/record-workbench";

export default function LogsPage({ token }) {
  const [runFilters, setRunFilters] = useState(emptyInvestigationFilters({ provider: "", testId: "", reportId: "" }));
  const [eventFilters, setEventFilters] = useState(
    emptyInvestigationFilters({ eventName: "", testId: "", reportId: "", orderId: "", shareId: "" })
  );
  const [runs, setRuns] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  async function loadData() {
    setLoading(true);
    setErrorText("");

    try {
      const [runData, eventData] = await Promise.all([
        listProviderRuns(token, runFilters),
        listEvents(token, eventFilters),
      ]);
      setRuns(Array.isArray(runData.items) ? runData.items : []);
      setEvents(Array.isArray(eventData.items) ? eventData.items : []);
    } catch (error) {
      setErrorText(error.message || "\u65e0\u6cd5\u52a0\u8f7d\u65e5\u5fd7\u6570\u636e\u3002");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [
    token,
    runFilters.openid,
    runFilters.status,
    runFilters.provider,
    runFilters.testId,
    runFilters.reportId,
    runFilters.startDate,
    runFilters.endDate,
    eventFilters.openid,
    eventFilters.status,
    eventFilters.eventName,
    eventFilters.testId,
    eventFilters.reportId,
    eventFilters.orderId,
    eventFilters.shareId,
    eventFilters.startDate,
    eventFilters.endDate,
  ]);

  async function handleSelectRun(runId) {
    setDetailLoading(true);
    setErrorText("");
    setSuccessText("");

    try {
      const detail = await getProviderRunDetail(token, runId);
      setSelectedRun(detail);
    } catch (error) {
      setErrorText(error.message || "\u65e0\u6cd5\u52a0\u8f7d\u751f\u6210\u8be6\u60c5\u3002");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSelectEvent(eventId) {
    setDetailLoading(true);
    setErrorText("");
    setSuccessText("");

    try {
      const detail = await getEventDetail(token, eventId);
      setSelectedEvent(detail);
    } catch (error) {
      setErrorText(error.message || "\u65e0\u6cd5\u52a0\u8f7d\u4e8b\u4ef6\u8be6\u60c5\u3002");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleExportEvents() {
    setErrorText("");
    setSuccessText("");

    try {
      const data = await exportEventsCsv(token, eventFilters);
      downloadTextFile(data.csvText, data.fileName || "events.csv", "text/csv;charset=utf-8");
      setSuccessText("\u4e8b\u4ef6 CSV \u5df2\u5bfc\u51fa\u3002");
    } catch (error) {
      setErrorText(error.message || "\u5bfc\u51fa\u4e8b\u4ef6 CSV \u5931\u8d25\u3002");
    }
  }

  return (
    <section className="module-panel">
      <header className="module-header overview-header">
        <div>
          <p className="module-eyebrow">{"\u751f\u6210\u4e0e\u4e8b\u4ef6\u65e5\u5fd7"}</p>
          <h2>{"\u751f\u6210\u4e0e\u4e8b\u4ef6\u65e5\u5fd7"}</h2>
          <p className="module-copy">
            {"\u540c\u65f6\u67e5\u770b\u751f\u6210\u8fd0\u884c\u8bb0\u5f55\u548c\u524d\u53f0\u4e8b\u4ef6\u65e5\u5fd7\uff0c\u4fbf\u4e8e\u6392\u67e5\u5931\u8d25\u94fe\u8def\u4e0e\u884c\u4e3a\u6765\u6e90\u3002"}
          </p>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="ghost-button light-ghost" onClick={handleExportEvents}>
            {"\u5bfc\u51fa\u4e8b\u4ef6 CSV"}
          </button>
        </div>
      </header>

      <FiltersBar>
        <FilterInput
          label={"\u670d\u52a1\u5546"}
          value={runFilters.provider}
          onChange={(event) => setRunFilters((current) => ({ ...current, provider: event.target.value }))}
          placeholder="aliyun"
        />
        <FilterInput
          label={"\u8fd0\u884c\u72b6\u6001"}
          value={runFilters.status}
          onChange={(event) => setRunFilters((current) => ({ ...current, status: event.target.value }))}
          placeholder="failed"
        />
        <FilterInput
          label={"\u4e8b\u4ef6\u540d"}
          value={eventFilters.eventName}
          onChange={(event) => setEventFilters((current) => ({ ...current, eventName: event.target.value }))}
          placeholder="report_view"
        />
        <FilterInput
          label={"\u6d4b\u8bd5 ID"}
          value={eventFilters.testId}
          onChange={(event) => setEventFilters((current) => ({ ...current, testId: event.target.value }))}
          placeholder={"\u8f93\u5165\u6d4b\u8bd5 ID"}
        />
        <FilterInput
          label={"\u8ba2\u5355 ID"}
          value={eventFilters.orderId}
          onChange={(event) => setEventFilters((current) => ({ ...current, orderId: event.target.value }))}
          placeholder={"\u8f93\u5165\u8ba2\u5355 ID"}
        />
      </FiltersBar>

      {loading ? <p className="module-copy">{"\u6b63\u5728\u52a0\u8f7d\u65e5\u5fd7\u6570\u636e..."}</p> : null}
      {errorText ? <p className="error-text">{errorText}</p> : null}
      {successText ? <p className="success-text">{successText}</p> : null}

      <RecordWorkbenchLayout
        left={
          <RecordTableSection title={"\u751f\u6210\u8fd0\u884c\u8bb0\u5f55"}>
            <div className="table-shell">
              <table className="record-table">
                <thead>
                  <tr>
                    <th>{"\u8fd0\u884c ID"}</th>
                    <th>{"\u670d\u52a1\u5546"}</th>
                    <th>{"\u72b6\u6001"}</th>
                    <th>{"\u9519\u8bef\u7801"}</th>
                    <th>{"\u8017\u65f6"}</th>
                    <th>{"\u521b\u5efa\u65f6\u95f4"}</th>
                    <th>{"\u64cd\u4f5c"}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((item) => (
                    <tr key={item.runId}>
                      <td>{item.runId}</td>
                      <td>{item.provider || "-"}</td>
                      <td>{item.status || "-"}</td>
                      <td>{item.errorCode || "-"}</td>
                      <td>{item.durationMs ? `${item.durationMs}ms` : "-"}</td>
                      <td>{formatTimestamp(item.createdAt || item.updatedAt)}</td>
                      <td className="row-actions">
                        <button type="button" className="ghost-button light-ghost" onClick={() => handleSelectRun(item.runId)}>
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
          <RecordTableSection title={"\u4e8b\u4ef6\u65e5\u5fd7"}>
            <div className="table-shell">
              <table className="record-table">
                <thead>
                  <tr>
                    <th>{"\u4e8b\u4ef6 ID"}</th>
                    <th>{"\u4e8b\u4ef6\u540d"}</th>
                    <th>openid</th>
                    <th>{"\u5173\u8054\u5bf9\u8c61"}</th>
                    <th>{"\u521b\u5efa\u65f6\u95f4"}</th>
                    <th>{"\u64cd\u4f5c"}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((item) => (
                    <tr key={item.eventId}>
                      <td>{item.eventId}</td>
                      <td>{item.eventName || "-"}</td>
                      <td>{item.openidMasked || "-"}</td>
                      <td>{item.testId || item.reportId || item.orderId || item.shareId || "-"}</td>
                      <td>{formatTimestamp(item.createdAt)}</td>
                      <td className="row-actions">
                        <button type="button" className="ghost-button light-ghost" onClick={() => handleSelectEvent(item.eventId)}>
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
      />

      <RecordWorkbenchLayout
        left={
          <RecordDetailSection
            title={"\u751f\u6210\u8be6\u60c5"}
            loading={detailLoading}
            hasSelection={Boolean(selectedRun)}
            emptyText={"\u9009\u62e9\u4e00\u6761\u751f\u6210\u8bb0\u5f55\u540e\u5728\u8fd9\u91cc\u67e5\u770b\u5b8c\u6574\u4fe1\u606f\u3002"}
          >
            <DetailList items={buildRunDetailItems(selectedRun)} />
          </RecordDetailSection>
        }
        right={
          <RecordDetailSection
            title={"\u4e8b\u4ef6\u8be6\u60c5"}
            loading={detailLoading}
            hasSelection={Boolean(selectedEvent)}
            emptyText={"\u9009\u62e9\u4e00\u6761\u4e8b\u4ef6\u540e\u53ef\u67e5\u770b\u5b8c\u6574\u5143\u6570\u636e\u3002"}
          >
            {selectedEvent ? (
              <>
                <DetailList items={buildEventDetailItems(selectedEvent)} />
                <pre className="csv-textarea">{JSON.stringify(selectedEvent?.metadata || {}, null, 2)}</pre>
              </>
            ) : null}
          </RecordDetailSection>
        }
      />
    </section>
  );
}
