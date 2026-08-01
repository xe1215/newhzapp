import React from "react";

export function MetricCard({ label, value, hint }) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <strong className="metric-value">{value}</strong>
      {hint ? <span className="metric-hint">{hint}</span> : null}
    </article>
  );
}

export function DetailList({ items }) {
  return (
    <div className="detail-stack">
      {items.map((item) => (
        <p key={item.label}>
          <strong>{item.label}:</strong> {item.value}
        </p>
      ))}
    </div>
  );
}

export function buildDetailItem(label, value) {
  return {
    label,
    value: value === undefined || value === null || value === "" ? "-" : value,
  };
}

export function FiltersBar({ children }) {
  return <div className="filters-grid">{children}</div>;
}

export function FilterInput({ label, value, onChange, placeholder }) {
  return (
    <label className="field-stack">
      <span>{label}</span>
      <input className="field-input" value={value} onChange={onChange} placeholder={placeholder} />
    </label>
  );
}

export function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="field-stack">
      <span>{label}</span>
      <select className="field-input" value={value} onChange={onChange}>
        <option value="">全部</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StatusPill({ text, tone }) {
  return <span className={tone ? `panel-badge ${tone}` : "panel-badge"}>{text || "-"}</span>;
}

export function OverviewSection({ title, kicker, badge, children, className }) {
  return (
    <section className={className ? `subpanel ${className}` : "subpanel"}>
      <div className="panel-heading">
        <div>
          {kicker ? <p className="panel-kicker">{kicker}</p> : null}
          <h3>{title}</h3>
        </div>
        {badge ? badge : null}
      </div>
      {children}
    </section>
  );
}
