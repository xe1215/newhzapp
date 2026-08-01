import React, { useEffect, useState } from "react";
import { getOverview, listOrders } from "../lib/admin-api";
import { OVERVIEW_RANGES } from "../constants/admin-shell";
import { MetricCard, OverviewSection } from "../components/admin-primitives";
import { formatCount, formatCurrency, formatPercent, formatTimestamp } from "../utils/admin-format";

export default function OperationsDashboardPage({ token }) {
  const [rangeKey, setRangeKey] = useState("last7Days");
  const [overview, setOverview] = useState(null);
  const [fallbackRecentOrders, setFallbackRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setErrorText("");
    setFallbackRecentOrders([]);

    getOverview(token, rangeKey)
      .then(async (data) => {
        if (!cancelled) {
          setOverview(data);
        }

        if (!cancelled && Number(data?.metrics?.paidOrderCount || 0) > 0) {
          const overviewOrders = Array.isArray(data?.recentOrders) ? data.recentOrders : [];
          if (!overviewOrders.length) {
            const fallbackRangeStart = data?.range?.start || "";
            const fallbackRangeEnd = data?.range?.end || "";
            const fallbackData = await listOrders(token, {
              status: "paid",
              startDate: fallbackRangeStart,
              endDate: fallbackRangeEnd,
            });
            if (!cancelled) {
              setFallbackRecentOrders(Array.isArray(fallbackData?.items) ? fallbackData.items.slice(0, 5) : []);
            }
          }
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorText(error.message || "无法加载运营数据。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, rangeKey]);

  const metrics = overview?.metrics || {};
  const conversion = overview?.conversion || {};
  const funnel = Array.isArray(overview?.funnel) ? overview.funnel : [];
  const recentOrders = Array.isArray(overview?.recentOrders) ? overview.recentOrders : [];
  const dashboardRecentOrders = recentOrders.length ? recentOrders : fallbackRecentOrders;
  const recentGenerationFailures = Array.isArray(overview?.recentGenerationFailures)
    ? overview.recentGenerationFailures
    : [];
  const recentExceptionOrders = Array.isArray(overview?.recentExceptionOrders)
    ? overview.recentExceptionOrders
    : [];

  const kpis = [
    { label: "访问量", value: formatCount(metrics.visits), hint: "进入小程序或落地页的访问次数" },
    { label: "创建试色", value: formatCount(metrics.testsCreated), hint: "用户创建试色记录数" },
    { label: "报告生成", value: formatCount(metrics.reportsCreated), hint: "当前周期生成的报告总数" },
    { label: "生成成功", value: formatCount(metrics.generationSuccessCount), hint: "生成成功次数" },
    {
      label: "支付订单",
      value: formatCount(metrics.paidOrderCount),
      hint: `支付转化 ${formatPercent(conversion.paymentFromVisitRate)}`,
    },
    {
      label: "营业收入",
      value: formatCurrency(metrics.revenueCents),
      hint: `客单价 ${formatCurrency(conversion.averageOrderValueCents)}`,
    },
  ];

  return (
    <section className="module-panel operations-dashboard">
      <header className="module-header overview-header dashboard-header">
        <div>
          <p className="module-eyebrow">运营总览</p>
          <h2>运营仪表盘</h2>
          <p className="module-copy">
            同一套仪表盘结构覆盖今天、昨天、近 7 天和近 30 天，方便用真实数据横向比较运营表现。
          </p>
        </div>
        <div className="range-switcher">
          {OVERVIEW_RANGES.map((range) => (
            <button
              key={range.key}
              type="button"
              className={range.key === rangeKey ? "range-chip active" : "range-chip"}
              onClick={() => setRangeKey(range.key)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? <p className="module-copy">正在加载运营数据...</p> : null}
      {errorText ? <p className="error-text">{errorText}</p> : null}

      {!loading && !errorText ? (
        <>
          {overview?.sampleHint ? <p className="overview-note">{overview.sampleHint}</p> : null}
          {overview?.empty ? <p className="overview-note">{overview.emptyMessage}</p> : null}

          <section className="dashboard-hero-card">
            <div>
              <p className="hero-kicker">核心经营信号</p>
              <h3>收入、转化与风险在一屏查看</h3>
              <p className="module-copy">
                当前区间收入 {formatCurrency(metrics.revenueCents)}，支付转化率{" "}
                {formatPercent(conversion.paymentFromVisitRate)}，重点跟进生成失败和退款异常。
              </p>
            </div>
            <div className="dashboard-hero-stats">
              <article>
                <span>总收入</span>
                <strong>{formatCurrency(metrics.revenueCents)}</strong>
              </article>
              <article>
                <span>试色转支付</span>
                <strong>{formatPercent(conversion.paymentFromTestRate)}</strong>
              </article>
              <article>
                <span>异常订单</span>
                <strong>{formatCount(recentExceptionOrders.length)}</strong>
              </article>
            </div>
          </section>

          <div className="overview-kpis">
            {kpis.map((item) => (
              <MetricCard key={item.label} label={item.label} value={item.value} hint={item.hint} />
            ))}
          </div>

          <div className="dashboard-grid">
            <OverviewSection
              title="最近订单"
              kicker="Recent Orders"
              badge={<span className="panel-badge">{formatCount(dashboardRecentOrders.length)} 笔</span>}
              className="recent-orders"
            >
              {dashboardRecentOrders.length ? (
                <div className="table-shell dashboard-table-shell">
                  <table className="record-table dashboard-table">
                    <thead>
                      <tr>
                        <th>订单号</th>
                        <th>状态</th>
                        <th>退款状态</th>
                        <th>金额</th>
                        <th>创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardRecentOrders.map((item) => (
                        <tr key={item.orderId}>
                          <td>{item.orderId}</td>
                          <td>{item.status || "-"}</td>
                          <td>{item.refundStatus || "-"}</td>
                          <td>{formatCurrency(item.amountCents)}</td>
                          <td>{formatTimestamp(item.createdAt || item.paidAt || item.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="module-copy">当前没有最近订单。</p>
              )}
            </OverviewSection>

            <div className="dashboard-sidepanels">
              <OverviewSection
                title="风险提醒"
                kicker="Risk Watch"
                badge={<span className="panel-badge alert">{formatCount(recentExceptionOrders.length)} 项</span>}
                className="risk-panel"
              >
                <div className="risk-summary">
                  <article>
                    <span>生成失败</span>
                    <strong>{formatCount(metrics.generationFailureCount)}</strong>
                  </article>
                  <article>
                    <span>退款异常</span>
                    <strong>{formatCount(recentExceptionOrders.length)}</strong>
                  </article>
                </div>
              </OverviewSection>

              <OverviewSection title="转化摘要">
                <div className="summary-grid dashboard-summary-grid">
                  <article className="summary-item">
                    <span>访问到试色</span>
                    <strong>{formatPercent(conversion.testFromVisitRate)}</strong>
                  </article>
                  <article className="summary-item">
                    <span>试色到支付</span>
                    <strong>{formatPercent(conversion.paymentFromTestRate)}</strong>
                  </article>
                  <article className="summary-item">
                    <span>试色到报告浏览</span>
                    <strong>{formatPercent(conversion.reportViewRate)}</strong>
                  </article>
                  <article className="summary-item">
                    <span>报告浏览到分享</span>
                    <strong>{formatPercent(conversion.shareVisitRate)}</strong>
                  </article>
                </div>
              </OverviewSection>

              <OverviewSection title="运营漏斗">
                <div className="funnel-grid dashboard-funnel-grid">
                  {funnel.map((item, index) => (
                    <article key={item.label} className="funnel-card">
                      <span className="funnel-step">{String(index + 1).padStart(2, "0")}</span>
                      <strong>{item.label}</strong>
                      <span className="funnel-value">{formatCount(item.value)}</span>
                    </article>
                  ))}
                </div>
              </OverviewSection>

              <OverviewSection title="最近生成失败">
                {recentGenerationFailures.length ? (
                  <ul className="record-list compact-record-list">
                    {recentGenerationFailures.map((item) => (
                      <li key={item.runId} className="record-item">
                        <strong>{item.errorCode || "FAILED"}</strong>
                        <span>{item.provider || "未知服务商"}</span>
                        <span>{item.errorMessage || "暂无错误信息"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="module-copy">当前没有生成失败记录。</p>
                )}
              </OverviewSection>

              <OverviewSection title="最近异常订单">
                {recentExceptionOrders.length ? (
                  <ul className="record-list compact-record-list">
                    {recentExceptionOrders.map((item) => (
                      <li key={item.orderId} className="record-item">
                        <strong>{item.orderId}</strong>
                        <span>{item.refundStatus || "-"}</span>
                        <span>{item.refundReason || "暂无异常原因"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="module-copy">当前没有异常订单。</p>
                )}
              </OverviewSection>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
