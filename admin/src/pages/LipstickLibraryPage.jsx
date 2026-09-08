import React, { useEffect, useState } from "react";
import { Tabs } from "antd";
import {
  exportLipsticksCsv,
  importLipsticksCsv,
  listLipsticks,
  saveLipstick,
  setLipstickStatus,
  uploadLipstickImage,
} from "../lib/admin-api";
import { EMPTY_LIPSTICK_FORM } from "../constants/admin-shell";
import { FilterInput, FiltersBar, FilterSelect } from "../components/admin-primitives";
import { formatCount } from "../utils/admin-format";
import { downloadTextFile } from "../utils/download-file";
import RecommendationRulesPanel from "./RecommendationRulesPanel";

export default function LipstickLibraryPage({ token }) {
  const [filters, setFilters] = useState({
    brand: "",
    budget: "",
    status: "",
  });
  const [records, setRecords] = useState([]);
  const [availableFilters, setAvailableFilters] = useState({
    brands: [],
    statuses: ["active", "inactive"],
  });
  const [form, setForm] = useState(EMPTY_LIPSTICK_FORM);
  const [csvText, setCsvText] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [activeTab, setActiveTab] = useState("lipsticks");

  function resetForm() {
    setForm(EMPTY_LIPSTICK_FORM);
    setImagePreview("");
  }

  function getRecordId(record) {
    const rawId = record && (record._id || record.id || record.lipstickId || record.productId);
    return rawId && typeof rawId === "object" ? rawId.$oid || "" : rawId || "";
  }

  function applyRecordToForm(record) {
    setForm({
      _id: getRecordId(record),
      brand: record.brand || "",
      productName: record.productName || record.shadeName || "",
      shadeCode: record.shadeCode || "",
      texture: record.texture || "",
      productImage: record.productImage || "",
      colorHex: record.colorHex || "",
      budget: record.budget || "",
      status: record.status || "active",
    });
    setImagePreview(record.productImageUrl || "");
  }

  async function loadData(preferredRecord) {
    setLoading(true);
    setErrorText("");

    try {
      const data = await listLipsticks(token, filters);
      const nextRecords = Array.isArray(data.records) ? data.records : data.items || [];
      if (preferredRecord && preferredRecord._id) {
        const exists = nextRecords.some((item) => item._id === preferredRecord._id);
        setRecords(
          exists
            ? nextRecords.map((item) => (item._id === preferredRecord._id ? { ...item, ...preferredRecord } : item))
            : [preferredRecord, ...nextRecords]
        );
      } else {
        setRecords(nextRecords);
      }
      setAvailableFilters(
        data.availableFilters || {
          brands: [],
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
  }, [token, filters.brand, filters.budget, filters.status]);

  async function handleSave(event) {
    event.preventDefault();
    setErrorText("");
    setSuccessText("");

    try {
      const result = await saveLipstick(token, form);
      setSuccessText("口红记录已保存。");
      if (result?.record?._id) {
        setRecords((current) => {
          const exists = current.some((item) => item._id === result.record._id);
          return exists
            ? current.map((item) => (item._id === result.record._id ? { ...item, ...result.record } : item))
            : [result.record, ...current];
        });
      }
      resetForm();
      await loadData(result.record);
    } catch (error) {
      setErrorText(error.message || "保存口红记录失败。");
    }
  }

  async function handleImageUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    setErrorText("");
    try {
      const result = await uploadLipstickImage(token, file);
      setForm((current) => ({ ...current, productImage: result.fileID || "" }));
      setImagePreview(result.tempFileURL || "");
      setSuccessText("商品图片已上传。");
    } catch (error) {
      setErrorText(error.message || "上传商品图片失败。");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
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
          <p className="module-copy">维护品牌、色号和预算区间，支撑推荐结果和后台筛选。</p>
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

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "lipsticks",
            label: "口红商品",
            children: <>
      <FiltersBar>
        <FilterSelect
          label="品牌"
          value={filters.brand}
          onChange={(event) => setFilters((current) => ({ ...current, brand: event.target.value }))}
          options={(availableFilters.brands || []).map((item) => ({ value: item, label: item }))}
        />
        <FilterSelect label="预算" value={filters.budget} onChange={(event) => setFilters((current) => ({ ...current, budget: event.target.value }))} options={["100以内", "100-300", "300+"].map((value) => ({ value, label: value }))} />
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
                  <th>产品名称</th>
                  <th>色号</th>
                  <th>质地</th>
                  <th>主图</th>
                  <th>预算区间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {records.map((item) => (
                  <tr key={item._id}>
                    <td>{item.brand || "-"}</td>
                    <td>{item.productName || item.shadeName || "-"}</td>
                    <td>{item.shadeCode || "-"}</td>
                    <td>{item.texture || "-"}</td>
                    <td>{item.productImageUrl ? <img className="product-image-thumb" src={item.productImageUrl} alt="商品" /> : item.productImage ? "已配置" : "-"}</td>
                    <td>
                      {item.budget || "-"}
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
              <span>产品名称</span>
              <input className="field-input" value={form.productName} onChange={(event) => setForm((current) => ({ ...current, productName: event.target.value }))} />
            </label>
            <label className="field-stack">
              <span>色号</span>
              <input className="field-input" value={form.shadeCode} onChange={(event) => setForm((current) => ({ ...current, shadeCode: event.target.value }))} />
            </label>
            <label className="field-stack">
              <span>质地</span>
              <input className="field-input" value={form.texture} onChange={(event) => setForm((current) => ({ ...current, texture: event.target.value }))} />
            </label>
            <label className="field-stack">
              <span>上传商品图片</span>
              <input className="field-input" type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />
              {imagePreview ? <img className="product-image-preview" src={imagePreview} alt="商品预览" /> : form.productImage ? <small>已配置图片</small> : null}
            </label>
            <label className="field-stack">
              <span>颜色 HEX 值</span>
              <input className="field-input color-hex-input" value={form.colorHex} onChange={(event) => setForm((current) => ({ ...current, colorHex: event.target.value }))} placeholder="#CC6677" />
            </label>
            <label className="field-stack">
              <span>预算</span>
              <select className="field-input" value={form.budget} onChange={(event) => setForm((current) => ({ ...current, budget: event.target.value }))}>
                <option value="">请选择预算</option>
                <option value="100以内">100以内</option>
                <option value="100-300">100-300</option>
                <option value="300+">300+</option>
              </select>
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
            placeholder="brand,productName,shadeCode,texture,productImage,colorHex,budget,status"
          />
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="button" className="primary-button slim-button" onClick={handleImportCsv}>
              导入 CSV
            </button>
          </div>
        </section>
      </div>
            </>,
          },
          {
            key: "recommendations",
            label: "推荐内容",
            children: <RecommendationRulesPanel token={token} />,
          },
        ]}
      />
    </section>
  );
}
