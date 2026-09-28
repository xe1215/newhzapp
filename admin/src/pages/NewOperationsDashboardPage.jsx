import React, { useEffect, useState } from "react";
import { getOperationsSummary } from "../lib/admin-api";
import { OVERVIEW_RANGES } from "../constants/admin-shell";
import { MetricCard, OverviewSection } from "../components/admin-primitives";
import { formatCount, formatCurrency, formatTimestamp } from "../utils/admin-format";

const series = [
  { key: "recommendationSets", label: "推荐集", color: "#9a6b30" },
  { key: "singleTryOns", label: "单支任务", color: "#3d7891" },
  { key: "tryOnSuccess", label: "试色成功", color: "#6a8f54" },
  { key: "paidCreditOrders", label: "积分订单", color: "#b35c45" },
];

export default function NewOperationsDashboardPage({ token }) {
  const [rangeKey, setRangeKey] = useState("last7Days");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorText("");
    getOperationsSummary(token, rangeKey).then((result) => {
      if (active) setSummary(result);
    }).catch((error) => {
      if (active) setErrorText(error.message || "无法加载运营数据。");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token, rangeKey]);

  const metrics = summary?.metrics || {};
  const trend = summary?.trend || [];
  const orders = summary?.recentCreditOrders || [];
  const failures = summary?.recentTryOnFailures || [];
  const max = Math.max(1, ...trend.flatMap((point) => series.map((item) => Number(point[item.key] || 0))));
  const points = (key) => trend.map((point, index) => {
    const x = trend.length === 1 ? 50 : index / (trend.length - 1) * 100;
    return `${x},${38 - Number(point[key] || 0) / max * 34}`;
  }).join(" ");
  const kpis = [
    { label: "推荐集", value: formatCount(metrics.recommendationSets), hint: "本周期创建的推荐集" },
    { label: "单支任务", value: formatCount(metrics.singleTryOns), hint: "本周期发起的任务" },
    { label: "试色成功", value: formatCount(metrics.tryOnSuccess), hint: "已完成单图生成" },
    { label: "试色失败", value: formatCount(metrics.tryOnFailures), hint: "失败或超时任务" },
    { label: "已支付积分订单", value: formatCount(metrics.paidCreditOrders), hint: "积分套餐订单" },
    { label: "积分订单金额", value: formatCurrency(metrics.creditRevenueCents), hint: "已支付订单金额" },
  ];

  return <section className="module-panel operations-dashboard">
    <header className="module-header overview-header dashboard-header">
      <div><p className="module-eyebrow">运营总览</p><h2>运营仪表盘</h2>
        <p className="module-copy">查看推荐集、单支试色和积分订单的运行情况。</p></div>
      <div className="range-switcher">{OVERVIEW_RANGES.map((range) => <button key={range.key} type="button"
        className={range.key === rangeKey ? "range-chip active" : "range-chip"}
        onClick={() => setRangeKey(range.key)}>{range.label}</button>)}</div>
    </header>
    {loading ? <p className="module-copy">正在加载运营数据...</p> : null}
    {errorText ? <p className="error-text">{errorText}</p> : null}
    {!loading && summary ? <>
      <div className="overview-kpis">{kpis.map((item) => <MetricCard key={item.label} {...item} />)}</div>
      <div className="dashboard-charts">
        <OverviewSection title="运营趋势" kicker="按日数据">
          <div className="line-chart" role="img" aria-label="运营趋势折线图"><svg viewBox="0 0 100 42" preserveAspectRatio="none">
            {[4, 21, 38].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} />)}
            {series.map((item) => <polyline key={item.key} points={points(item.key)} style={{ stroke: item.color }} />)}
          </svg><div className="line-chart-axis">{trend.map((point) => <span key={point.date}>{point.date.slice(5)}</span>)}</div>
          <div className="line-chart-legend">{series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div></div>
        </OverviewSection>
        <OverviewSection title="任务状态" kicker="本周期">
          <div className="funnel-grid dashboard-funnel-grid">
            {[{ label: "已创建", value: metrics.singleTryOns }, { label: "成功", value: metrics.tryOnSuccess }, { label: "失败或超时", value: metrics.tryOnFailures }]
              .map((item, index) => <article key={item.label} className="funnel-card"><span className="funnel-step">{String(index + 1).padStart(2, "0")}</span>
                <strong>{item.label}</strong><span className="funnel-value">{formatCount(item.value)}</span></article>)}
          </div>
        </OverviewSection>
      </div>
      <div className="dashboard-grid">
        <OverviewSection title="最近积分订单" kicker="最近订单" badge={<span className="panel-badge">{formatCount(orders.length)} 笔</span>} className="recent-orders">
          {orders.length ? <div className="table-shell dashboard-table-shell"><table className="record-table dashboard-table"><thead><tr>
            <th>订单号</th><th>状态</th><th>购买积分</th><th>金额</th><th>创建时间</th>
          </tr></thead><tbody>{orders.map((item) => <tr key={item.orderId}><td>{item.orderId}</td><td>{item.status}</td>
            <td>{item.credits}</td><td>{formatCurrency(item.amountCents)}</td><td>{formatTimestamp(item.createdAt)}</td></tr>)}</tbody></table></div>
            : <p className="module-copy">当前没有最近积分订单。</p>}
        </OverviewSection>
        <div className="dashboard-sidepanels"><OverviewSection title="最近单支任务失败" kicker="风险监测"
          badge={<span className="panel-badge alert">{formatCount(failures.length)} 项</span>} className="risk-panel">
          {failures.length ? <ul className="record-list compact-record-list">{failures.map((item) => <li key={item.jobId} className="record-item">
            <strong>{item.errorCode || item.status}</strong><span>{item.productId || "未知商品"}</span><span>{item.errorMessage || "暂无错误信息"}</span>
          </li>)}</ul> : <p className="module-copy">当前没有失败任务。</p>}
        </OverviewSection></div>
      </div>
    </> : null}
  </section>;
}
