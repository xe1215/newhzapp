import React, { useEffect, useState } from "react";
import { Pagination } from "antd";
import { DetailList, FilterInput, FiltersBar } from "./admin-primitives";
import { RecordDetailSection, RecordTableSection, RecordWorkbenchLayout } from "./record-workbench";

export default function OperationalResourcePage({ token, title, description, filters: filterFields, columns, detailFields, idField, list, detail }) {
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ total: 0 });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSelected(null);
    list(token, filters, page, pageSize).then((result) => {
      if (!active) return;
      setItems(Array.isArray(result.items) ? result.items : []);
      setPagination(result.pagination || { total: 0 });
    }).catch((reason) => {
      if (active) setError(reason.message || `无法加载${title}。`);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token, filters, page, pageSize, list, title]);

  async function selectRecord(id) {
    setDetailLoading(true);
    setError("");
    try {
      setSelected(await detail(token, id));
    } catch (reason) {
      setError(reason.message || "无法加载详情。");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <section className="module-panel">
      <header className="module-header overview-header">
        <div><p className="module-eyebrow">{title}</p><h2>{title}</h2><p className="module-copy">{description}</p></div>
      </header>
      <FiltersBar>
        {filterFields.map((field) => <FilterInput key={field.key} label={field.label} value={filters[field.key] || ""}
          onChange={(event) => { setFilters((current) => ({ ...current, [field.key]: event.target.value })); setPage(1); }}
          placeholder={field.placeholder || `输入${field.label}`} />)}
      </FiltersBar>
      {loading ? <p className="module-copy">正在加载{title}...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      <RecordWorkbenchLayout
        left={<RecordTableSection title={`${title}列表`}>
          <div className="table-shell"><table className="record-table"><thead><tr>
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>操作</th>
          </tr></thead><tbody>
            {items.map((item) => <tr key={item[idField]}>
              {columns.map((column) => <td key={column.key}>{column.format ? column.format(item[column.key], item) : item[column.key] ?? "-"}</td>)}
              <td className="row-actions"><button type="button" className="ghost-button light-ghost" onClick={() => selectRecord(item[idField])}>查看详情</button></td>
            </tr>)}
          </tbody></table></div>
          <Pagination current={page} pageSize={pageSize} total={pagination.total || 0} showSizeChanger
            onChange={(nextPage, nextSize) => { setPage(nextSize === pageSize ? nextPage : 1); setPageSize(nextSize); }} />
        </RecordTableSection>}
        right={<RecordDetailSection title={`${title}详情`} loading={detailLoading} hasSelection={Boolean(selected)} emptyText="选择一条记录查看详情。">
          {selected ? <DetailList items={detailFields.map((field) => ({ label: field.label, value: field.format ? field.format(selected[field.key], selected) : selected[field.key] ?? "-" }))} /> : null}
        </RecordDetailSection>}
      />
    </section>
  );
}
