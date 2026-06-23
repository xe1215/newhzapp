import React, { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getOverview, getShell, login, logout } from "./lib/admin-api";

const MODULES = [
  { key: "overview", label: "Operations Overview", path: "/overview" },
  { key: "lipsticks", label: "Lipstick Library", path: "/lipsticks" },
  { key: "tests", label: "Test Records", path: "/tests" },
  { key: "reports", label: "Report Records", path: "/reports" },
  { key: "orders", label: "Orders and Refund Handling", path: "/orders" },
  { key: "logs", label: "Generation and Event Logs", path: "/logs" },
];

const OVERVIEW_RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7Days", label: "Last 7 days" },
  { key: "last30Days", label: "Last 30 days" },
];

function getStoredToken() {
  try {
    return window.sessionStorage.getItem("admin_token") || "";
  } catch (error) {
    return "";
  }
}

function storeToken(token) {
  try {
    if (token) {
      window.sessionStorage.setItem("admin_token", token);
    } else {
      window.sessionStorage.removeItem("admin_token");
    }
  } catch (error) {
    return;
  }
}

function ModulePage({ title }) {
  return (
    <section className="module-panel">
      <header className="module-header">
        <p className="module-eyebrow">Placeholder module</p>
        <h2>{title}</h2>
      </header>
      <p className="module-copy">
        This protected route confirms the Developer Console shell can render after login.
      </p>
    </section>
  );
}

function MetricCard({ label, value }) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <strong className="metric-value">{value}</strong>
    </article>
  );
}

function OverviewPage({ token }) {
  const [rangeKey, setRangeKey] = useState("today");
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setErrorText("");

    getOverview(token, rangeKey)
      .then((data) => {
        if (!cancelled) {
          setOverview(data);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorText(error.message || "Unable to load overview data.");
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

  const metrics = overview ? overview.metrics : null;

  return (
    <section className="module-panel">
      <header className="module-header overview-header">
        <div>
          <p className="module-eyebrow">Operations Overview</p>
          <h2>Operations Overview</h2>
          <p className="module-copy">
            Track visits, tests, generation health, payments, report views, share visits, and recent exceptions.
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

      {loading ? <p className="module-copy">Loading overview...</p> : null}
      {errorText ? <p className="error-text">{errorText}</p> : null}

      {!loading && !errorText && overview ? (
        <>
          {overview.empty ? (
            <div className="empty-state">
              <h3>No overview data for this range</h3>
              <p>{overview.emptyMessage}</p>
            </div>
          ) : (
            <div className="metrics-grid">
              <MetricCard label="Visits" value={metrics.visits} />
              <MetricCard label="Tests created" value={metrics.testsCreated} />
              <MetricCard label="Generation success" value={metrics.generationSuccessCount} />
              <MetricCard label="Generation failure" value={metrics.generationFailureCount} />
              <MetricCard label="Paid orders" value={metrics.paidOrderCount} />
              <MetricCard label="Revenue" value={`¥${(metrics.revenueCents / 100).toFixed(2)}`} />
              <MetricCard label="Report views" value={metrics.reportViewCount} />
              <MetricCard label="Share visits" value={metrics.shareVisitCount} />
            </div>
          )}

          <div className="overview-sections">
            <section className="subpanel">
              <h3>Recent generation failures</h3>
              {overview.recentGenerationFailures.length ? (
                <ul className="record-list">
                  {overview.recentGenerationFailures.map((item) => (
                    <li key={item.runId} className="record-item">
                      <strong>{item.errorCode || "FAILED"}</strong>
                      <span>{item.provider}</span>
                      <span>{item.errorMessage}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="module-copy">No recent generation failures.</p>
              )}
            </section>

            <section className="subpanel">
              <h3>Recent exception orders</h3>
              {overview.recentExceptionOrders.length ? (
                <ul className="record-list">
                  {overview.recentExceptionOrders.map((item) => (
                    <li key={item.orderId} className="record-item">
                      <strong>{item.orderId}</strong>
                      <span>{item.refundStatus}</span>
                      <span>{item.refundReason || "No reason recorded"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="module-copy">No recent exception orders.</p>
              )}
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}

function LoginPage({ onLogin, loading, errorText }) {
  const [password, setPassword] = useState("");

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="login-kicker">Developer Login</p>
        <h1>Developer Console</h1>
        <p className="login-copy">
          Enter the developer password to unlock the admin shell and protected routes.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onLogin(password);
          }}
        >
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="field-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter developer password"
          />
          {errorText ? <p className="error-text">{errorText}</p> : null}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ShellLayout({ shellData, token, onLogout }) {
  const location = useLocation();

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div>
          <p className="brand-kicker">Developer Console</p>
          <h1 className="brand-title">newhzapp</h1>
          <p className="brand-copy">Independent desktop shell for operations and troubleshooting.</p>
        </div>
        <nav className="nav-list">
          {shellData.modules.map((module) => {
            const active = location.pathname === module.path;

            return (
              <a
                key={module.key}
                href={`#${module.path}`}
                className={active ? "nav-item active" : "nav-item"}
                onClick={(event) => {
                  event.preventDefault();
                  window.history.pushState({}, "", module.path);
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }}
              >
                {module.label}
              </a>
            );
          })}
        </nav>
        <button className="ghost-button" type="button" onClick={onLogout}>
          logout
        </button>
      </aside>
      <main className="shell-main">
        <div className="topbar">
          <div>
            <p className="topbar-kicker">Protected admin route</p>
            <h2>Developer Console</h2>
          </div>
          <div className="viewer-pill">{shellData.viewer.role}</div>
        </div>
        <Routes>
          <Route path="/overview" element={<OverviewPage token={token} />} />
          <Route path="/lipsticks" element={<ModulePage title="Lipstick Library" />} />
          <Route path="/tests" element={<ModulePage title="Test Records" />} />
          <Route path="/reports" element={<ModulePage title="Report Records" />} />
          <Route path="/orders" element={<ModulePage title="Orders and Refund Handling" />} />
          <Route path="/logs" element={<ModulePage title="Generation and Event Logs" />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const [token, setToken] = useState(getStoredToken);
  const [shellData, setShellData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    if (!token) {
      setShellData(null);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setErrorText("");

    getShell(token)
      .then((data) => {
        if (cancelled) {
          return;
        }

        setShellData({
          ...data,
          modules: Array.isArray(data.modules) && data.modules.length ? data.modules : MODULES,
        });
        navigate("/overview", { replace: true });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setToken("");
        storeToken("");
        setShellData(null);
        setErrorText(error.message || "Unable to load the Developer Console.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  async function handleLogin(password) {
    setLoading(true);
    setErrorText("");

    try {
      const data = await login(password);
      setToken(data.token);
      storeToken(data.token);
    } catch (error) {
      setErrorText(error.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    const currentToken = token;

    setToken("");
    setShellData(null);
    storeToken("");
    navigate("/login", { replace: true });

    if (currentToken) {
      try {
        await logout(currentToken);
      } catch (error) {
        return;
      }
    }
  }

  if (!token || !shellData) {
    return <LoginPage onLogin={handleLogin} loading={loading} errorText={errorText} />;
  }

  return <ShellLayout shellData={shellData} token={token} onLogout={handleLogout} />;
}
