import React, { useEffect, useState } from "react";
import {
  exportLipsticksCsv,
  importLipsticksCsv,
  listLipsticks,
  saveLipstick,
  setLipstickStatus,
} from "../lib/admin-api";
import { EMPTY_LIPSTICK_FORM } from "../constants/admin-shell";
import { FilterInput, FiltersBar, FilterSelect } from "../components/admin-primitives";
import { formatCount } from "../utils/admin-format";
import { downloadTextFile } from "../utils/download-file";

export default function LipstickLibraryPage({ token }) {
  const [filters, setFilters] = useState({
    brand: "",
    skinToneTag: "",
    budgetMin: "",
    budgetMax: "",
    status: "",
  });
  const [records, setRecords] = useState([]);
  const [availableFilters, setAvailableFilters] = useState({
    brands: [],
    skinToneTags: [],
    statuses: ["active", "inactive"],
  });
  const [form, setForm] = useState(EMPTY_LIPSTICK_FORM);
  const [csvText, setCsvText] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  function resetForm() {
    setForm(EMPTY_LIPSTICK_FORM);
  }

  function applyRecordToForm(record) {
    setForm({
      _id: record._id || "",
      brand: record.brand || "",
      shadeName: record.shadeName || "",
      shadeCode: record.shadeCode || "",
      colorHex: record.colorHex || "",
      skinToneTags: Array.isArray(record.skinToneTags) ? record.skinToneTags.join("|") : "",
      budgetMin: record.budgetMin ?? "",
      budgetMax: record.budgetMax ?? "",
      status: record.status || "active",
    });
  }

  async function loadData() {
    setLoading(true);
    setErrorText("");

    try {
      const data = await listLipsticks(token, filters);
      setRecords(Array.isArray(data.records) ? data.records : data.items || []);
      setAvailableFilters(
        data.availableFilters || {
          brands: [],
          skinToneTags: [],
          statuses: ["active", "inactive"],
        }
      );
    } catch (error) {
      setErrorText(error.message || "无法加载口红库。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [token, filters.brand, filters.skinToneTag, filters.budgetMin, filters.budgetMax, filters.status]);

  async function handleSave(event) {
    event.preventDefault();
    setErrorText("");
    setSuccessText("");

    try {
      await saveLipstick(token, form);
      setSuccessText("口红记录已保存。");
      resetForm();
      await loadData();
    } catch (error) {
      setErrorText(error.message || "保存口红记录失败。");
    }
  }

  async function handleStatusChange(record, status) {
    setErrorText("");
    setSuccessText("");

    try {
      await setLipstickStatus(token, record._id, status);
      setSuccessText(`已将 ${record.shadeName || record.shadeCode || record._id} 设为 ${status}。`);
      await loadData();
    } catch (error) {
      setErrorText(error.message || "更新口红状态失败。");
    }
  }

  async function handleImportCsv() {
    setErrorText("");
    setSuccessText("");

    try {
      const result = await importLipsticksCsv(token, csvText);
      setSuccessText(`CSV 导入完成，共 ${formatCount(result.importedCount)} 条。`);
      setCsvText("");
      await loadData();
    } catch (error) {
      setErrorText(error.message || "导入口红 CSV 失败。");
    }
  }

  async function handleExportCsv() {
    setErrorText("");
    setSuccessText("");

    try {
      const data = await exportLipsticksCsv(token);
      downloadTextFile(data.csvText, data.fileName || "lipsticks.csv", "text/csv;charset=utf-8");
      setSuccessText("口红 CSV 已导出。");
    } catch (error) {
      setErrorText(error.message || "导出口红 CSV 失败。");
    }
  }

  return (
    <section className="module-panel">
      <header className="module-header overview-header">
        <div>
          <p className="module-eyebrow">口红库维护</p>
          <h2>口红库维护</h2>
          <p className="module-copy">维护品牌、色号、预算区间和适配肤色标签，支撑推荐结果和后台筛选。</p>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="ghost-button light-ghost" onClick={resetForm}>
            新建记录
          </button>
          <button type="button" className="ghost-button light-ghost" onClick={handleExportCsv}>
            导出 CSV
          </button>
        </div>
      </header>

      <FiltersBar>
        <FilterSelect
          label="品牌"
          value={filters.brand}
          onChange={(event) => setFilters((current) => ({ ...current, brand: event.target.value }))}
          options={(availableFilters.brands || []).map((item) => ({ value: item, label: item }))}
        />
        <FilterSelect
          label="肤色标签"
          value={filters.skinToneTag}
          onChange={(event) => setFilters((current) => ({ ...current, skinToneTag: event.target.value }))}
          options={(availableFilters.skinToneTags || []).map((item) => ({ value: item, label: item }))}
        />
        <FilterInput
          label="最低预算"
          value={filters.budgetMin}
          onChange={(event) => setFilters((current) => ({ ...current, budgetMin: event.target.value }))}
          placeholder="例如 99"
        />
        <FilterInput
          label="最高预算"
          value={filters.budgetMax}
          onChange={(event) => setFilters((current) => ({ ...current, budgetMax: event.target.value }))}
          placeholder="例如 399"
        />
        <FilterSelect
          label="状态"
          value={filters.status}
          onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          options={(availableFilters.statuses || ["active", "inactive"]).map((item) => ({ value: item, label: item }))}
        />
      </FiltersBar>

      {loading ? <p className="module-copy">正在加载口红库...</p> : null}
      {errorText ? <p className="error-text">{errorText}</p> : null}
      {successText ? <p className="success-text">{successText}</p> : null}

      <div className="library-layout">
        <section className="subpanel">
          <h3>口红列表</h3>
          <div className="table-shell">
            <table className="record-table">
              <thead>
                <tr>
                  <th>品牌</th>
                  <th>色号名</th>
                  <th>色号编码</th>
                  <th>颜色</th>
                  <th>预算区间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {records.map((item) => (
                  <tr key={item._id}>
                    <td>{item.brand || "-"}</td>
                    <td>{item.shadeName || "-"}</td>
                    <td>{item.shadeCode || "-"}</td>
                    <td>{item.colorHex || "-"}</td>
                    <td>
                      {item.budgetMin ?? "-"} - {item.budgetMax ?? "-"}
                    </td>
                    <td>{item.status || "-"}</td>
                    <td className="row-actions">
                      <button type="button" className="ghost-button light-ghost" onClick={() => applyRecordToForm(item)}>
                        编辑
                      </button>
                      <button
                        type="button"
                        className="ghost-button light-ghost"
                        onClick={() => handleStatusChange(item, item.status === "active" ? "inactive" : "active")}
                      >
                        {item.status === "active" ? "停用" : "启用"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="subpanel">
          <h3>{form._id ? "编辑口红" : "新增口红"}</h3>
          <form className="editor-form" onSubmit={handleSave}>
            <label className="field-stack">
              <span>品牌</span>
              <input className="field-input" value={form.brand} onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))} />
            </label>
            <label className="field-stack">
              <span>色号名</span>
              <input className="field-input" value={form.shadeName} onChange={(event) => setForm((current) => ({ ...current, shadeName: event.target.value }))} />
            </label>
            <label className="field-stack">
              <span>色号编码</span>
              <input className="field-input" value={form.shadeCode} onChange={(event) => setForm((current) => ({ ...current, shadeCode: event.target.value }))} />
            </label>
            <label className="field-stack">
              <span>颜色 HEX</span>
              <input className="field-input" value={form.colorHex} onChange={(event) => setForm((current) => ({ ...current, colorHex: event.target.value }))} />
            </label>
            <label className="field-stack">
              <span>肤色标签</span>
              <input className="field-input" value={form.skinToneTags} onChange={(event) => setForm((current) => ({ ...current, skinToneTags: event.target.value }))} placeholder="用 | 分隔多个标签" />
            </label>
            <label className="field-stack">
              <span>最低预算</span>
              <input className="field-input" value={form.budgetMin} onChange={(event) => setForm((current) => ({ ...current, budgetMin: event.target.value }))} />
            </label>
            <label className="field-stack">
              <span>最高预算</span>
              <input className="field-input" value={form.budgetMax} onChange={(event) => setForm((current) => ({ ...current, budgetMax: event.target.value }))} />
            </label>
            <label className="field-stack">
              <span>状态</span>
              <select className="field-input" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
            <div className="form-actions">
              <button type="submit" className="primary-button slim-button">
                保存记录
              </button>
              <button type="button" className="ghost-button light-ghost" onClick={resetForm}>
                清空表单
              </button>
            </div>
          </form>

          <h3 style={{ marginTop: 24 }}>CSV 导入</h3>
          <textarea
            className="csv-textarea"
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder="brand,shadeName,shadeCode,colorHex,skinToneTags,budgetMin,budgetMax,status"
          />
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="button" className="primary-button slim-button" onClick={handleImportCsv}>
              导入 CSV
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
