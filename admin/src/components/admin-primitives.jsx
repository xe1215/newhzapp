import React from "react";
import { Card, Descriptions, Input, Select, Space, Statistic, Tag } from "antd";

export function MetricCard({ label, value, hint }) {
  return <Card size="small" className="metric-card"><Statistic title={label} value={value} /><span className="metric-hint">{hint || " "}</span></Card>;
}

export function DetailList({ items }) {
  return (
    <Descriptions column={1} size="small" bordered items={items.map((item) => ({ key: item.label, label: item.label, children: item.value }))} />
  );
}

export function buildDetailItem(label, value) {
  return {
    label,
    value: value === undefined || value === null || value === "" ? "-" : value,
  };
}

export function FiltersBar({ children }) {
  return <Space wrap className="filters-grid" align="end">{children}</Space>;
}

export function FilterInput({ label, value, onChange, placeholder }) {
  return (
    <label className="field-stack"><span>{label}</span><Input value={value} onChange={onChange} placeholder={placeholder} /></label>
  );
}

export function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="field-stack"><span>{label}</span><Select style={{ minWidth: 140 }} value={value || undefined} placeholder="全部" options={options} allowClear onChange={(nextValue) => onChange({ target: { value: nextValue || "" } })} /></label>
  );
}

export function StatusPill({ text, tone }) {
  return <Tag className={tone ? `panel-badge ${tone}` : "panel-badge"}>{text || "-"}</Tag>;
}

export function OverviewSection({ title, kicker, badge, children, className }) {
  return (
    <Card size="small" className={className ? `subpanel ${className}` : "subpanel"}>
      <div className="panel-heading">
        <div>
          {kicker ? <p className="panel-kicker">{kicker}</p> : null}
          <h3>{title}</h3>
        </div>
        {badge ? badge : null}
      </div>
      {children}
    </Card>
  );
}
