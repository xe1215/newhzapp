import React, { useEffect, useState } from "react";
import { listLipsticks, listRecommendationRules, saveRecommendationRule } from "../lib/admin-api";

const EMPTY_RULE = {
  _id: "",
  skinTone: "",
  faceShape: "",
  budget: "",
  lipstickIds: ["", "", ""],
  whySuitable: "",
  applicationAdvice: "",
  makeupColorAdvice: "",
};

const RULE_OPTIONS = {
  skinTone: ["冷白皮", "冷黄皮", "暖黄皮", "黄黑皮"],
  faceShape: ["鹅蛋脸", "菱形脸", "方脸", "圆脸"],
  budget: ["100以内", "100-300", "300+"],
};

export default function RecommendationRulesPanel({ token }) {
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(EMPTY_RULE);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");
  const [lipsticks, setLipsticks] = useState([]);

  async function loadData() {
    setLoading(true);
    setErrorText("");
    const [rulesResult, lipsticksResult] = await Promise.allSettled([
      listRecommendationRules(token),
      listLipsticks(token),
    ]);

    const errors = [];
    if (rulesResult.status === "fulfilled") {
      setRecords(Array.isArray(rulesResult.value.records) ? rulesResult.value.records : []);
    } else {
      errors.push(rulesResult.reason?.message || "无法加载推荐内容。");
    }
    if (lipsticksResult.status === "fulfilled") {
      setLipsticks((lipsticksResult.value.records || []).filter((item) => item.status === "active"));
    } else {
      errors.push(lipsticksResult.reason?.message || "无法加载口红商品。");
    }
    setErrorText(errors.join(" "));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [token]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setLipstickId(index, value) {
    setForm((current) => ({
      ...current,
      lipstickIds: current.lipstickIds.map((id, currentIndex) => (currentIndex === index ? value : id)),
    }));
  }

  async function handleSave(event) {
    event.preventDefault();
    setErrorText("");
    setSuccessText("");
    if (form.lipstickIds.length !== 3 || form.lipstickIds.some((id) => !id) || new Set(form.lipstickIds).size !== 3) {
      setErrorText("请选择三支不同的口红。");
      return;
    }
    try {
      await saveRecommendationRule(token, form);
      setSuccessText("推荐内容已保存。");
      setForm(EMPTY_RULE);
      await loadData();
    } catch (error) {
      setErrorText(error.message || "保存推荐内容失败。");
    }
  }

  return (
    <div className="library-layout recommendation-rules-layout">
      <section className="subpanel">
        <h3>推荐内容列表</h3>
        {loading ? <p className="module-copy">正在加载推荐内容...</p> : null}
        <div className="table-shell">
          <table className="record-table">
            <thead>
              <tr>
                <th>肤色</th>
                <th>脸型</th>
                <th>价位</th>
                <th>共用内容</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((item) => (
                <tr key={item._id}>
                  <td>{item.skinTone || "-"}</td>
                  <td>{item.faceShape || "-"}</td>
                  <td>{item.budget || "-"}</td>
                  <td>已配置三项</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="ghost-button light-ghost"
                      onClick={() => setForm({ ...EMPTY_RULE, ...item, lipstickIds: item.lipstickIds && item.lipstickIds.length === 3 ? item.lipstickIds : ["", "", ""] })}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !records.length ? <p className="module-copy">暂无推荐内容。</p> : null}
      </section>

      <section className="subpanel">
        <h3>{form._id ? "编辑推荐内容" : "新增推荐内容"}</h3>
        {errorText ? <p className="error-text">{errorText}</p> : null}
        {successText ? <p className="success-text">{successText}</p> : null}
        <form className="editor-form" onSubmit={handleSave}>
          {[
            ["skinTone", "肤色"],
            ["faceShape", "脸型"],
            ["budget", "价位"],
          ].map(([field, label]) => (
            <label className="field-stack" key={field}>
              <span>{label}</span>
              <select
                className="field-input"
                value={form[field]}
                onChange={(event) => setField(field, event.target.value)}
              >
                <option value="">请选择{label}</option>
                {RULE_OPTIONS[field].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          ))}
          {form.lipstickIds.map((lipstickId, index) => (
            <label className="field-stack" key={`lipstick-${index}`}>
              <span>推荐口红 {index + 1}</span>
              <select className="field-input" value={lipstickId} onChange={(event) => setLipstickId(index, event.target.value)}>
                <option value="">请选择口红</option>
                {lipsticks.map((item) => (
                  <option key={item._id} value={item._id}>
                    {[item.brand, item.productName || item.shadeName, item.shadeCode].filter(Boolean).join(" ")}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {[
            ["whySuitable", "色号选择"],
            ["applicationAdvice", "唇妆画法"],
            ["makeupColorAdvice", "质地搭配"],
          ].map(([field, label]) => (
            <label className="field-stack" key={field}>
              <span>{label}</span>
              <textarea className="csv-textarea" value={form[field]} onChange={(event) => setField(field, event.target.value)} />
            </label>
          ))}
          <div className="form-actions">
            <button type="submit" className="primary-button slim-button">保存推荐内容</button>
            <button type="button" className="ghost-button light-ghost" onClick={() => setForm(EMPTY_RULE)}>清空表单</button>
          </div>
        </form>
      </section>
    </div>
  );
}
