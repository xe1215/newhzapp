import React, { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  exportLipsticksCsv,
  getOverview,
  getShell,
  importLipsticksCsv,
  listLipsticks,
  login,
  logout,
  saveLipstick,
  setLipstickStatus,
} from "./lib/admin-api";

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

const EMPTY_LIPSTICK_FORM = {
  brand: "",
  shadeName: "",
  shadeCode: "",
  colorHex: "",
  skinToneTags: "",
  budgetMin: "",
  budgetMax: "",
  status: "active",
};

function LipstickLibraryPage({ token }) {
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
      _id: record._id,
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

  async function loadData(currentFilters) {
    setLoading(true);
    setErrorText("");

    try {
      const data = await listLipsticks(token, currentFilters);
      setRecords(data.records || []);
      setAvailableFilters(
        data.availableFilters || {
          brands: [],
          skinToneTags: [],
          statuses: ["active", "inactive"],
        }
      );
    } catch (error) {
      setErrorText(error.message || "Unable to load the lipstick library.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(filters);
  }, [token, filters.brand, filters.skinToneTag, filters.budgetMin, filters.budgetMax, filters.status]);

  async function handleSave(event) {
    event.preventDefault();
    setErrorText("");
    setSuccessText("");

    try {
      await saveLipstick(token, {
        ...form,
        skinToneTags: String(form.skinToneTags || "")
          .split("|")
          .map((item) => item.trim())
          .filter(Boolean),
        budgetMin: Number(form.budgetMin),
        budgetMax: Number(form.budgetMax),
      });
      setSuccessText("Lipstick saved.");
      resetForm();
      await loadData(filters);
    } catch (error) {
      setErrorText(error.message || "Unable to save lipstick.");
    }
  }

  async function handleToggleStatus(record) {
    setErrorText("");
    setSuccessText("");

    try {
      await setLipstickStatus(token, record._id, record.status === "active" ? "inactive" : "active");
      setSuccessText("Lipstick status updated.");
      await loadData(filters);
    } catch (error) {
      setErrorText(error.message || "Unable to update lipstick status.");
    }
  }

  async function handleImportCsv() {
    setErrorText("");
    setSuccessText("");

    try {
      const data = await importLipsticksCsv(token, csvText);
      setSuccessText(`Imported ${data.importedCount} lipsticks.`);
      setCsvText("");
      await loadData(filters);
    } catch (error) {
      setErrorText(error.message || "Unable to import CSV.");
    }
  }

  async function handleExportCsv() {
    setErrorText("");
    setSuccessText("");

    try {
      const data = await exportLipsticksCsv(token);
      const blob = new Blob([data.csvText], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = data.fileName || "lipsticks.csv";
      anchor.click();
      window.URL.revokeObjectURL(url);
      setSuccessText("CSV export downloaded.");
    } catch (error) {
      setErrorText(error.message || "Unable to export CSV.");
    }
  }

  return (
    <section className="module-panel">
      <header className="module-header overview-header">
        <div>
          <p className="module-eyebrow">Lipstick Library</p>
          <h2>Lipstick Library</h2>
          <p className="module-copy">
            Manage recommendation-ready lipstick records with protected create, edit, status, and CSV flows.
          </p>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="ghost-button" onClick={handleExportCsv}>
            Export CSV
          </button>
        </div>
      </header>

      <div className="filters-grid">
        <label className="field-stack">
          <span>Brand</span>
          <select
            className="field-input"
            value={filters.brand}
            onChange={(event) => setFilters((current) => ({ ...current, brand: event.target.value }))}
          >
            <option value="">All brands</option>
            {availableFilters.brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </label>
        <label className="field-stack">
          <span>Skin tone</span>
          <select
            className="field-input"
            value={filters.skinToneTag}
            onChange={(event) => setFilters((current) => ({ ...current, skinToneTag: event.target.value }))}
          >
            <option value="">All tags</option>
            {availableFilters.skinToneTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <label className="field-stack">
          <span>Budget min</span>
          <input
            className="field-input"
            type="number"
            value={filters.budgetMin}
            onChange={(event) => setFilters((current) => ({ ...current, budgetMin: event.target.value }))}
          />
        </label>
        <label className="field-stack">
          <span>Budget max</span>
          <input
            className="field-input"
            type="number"
            value={filters.budgetMax}
            onChange={(event) => setFilters((current) => ({ ...current, budgetMax: event.target.value }))}
          />
        </label>
        <label className="field-stack">
          <span>Status</span>
          <select
            className="field-input"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="">All statuses</option>
            {availableFilters.statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <p className="module-copy">Loading lipstick library...</p> : null}
      {errorText ? <p className="error-text">{errorText}</p> : null}
      {successText ? <p className="success-text">{successText}</p> : null}

      <div className="library-layout">
        <section className="subpanel">
          <h3>Create or edit lipstick</h3>
          <form className="editor-form" onSubmit={handleSave}>
            <label className="field-stack">
              <span>Brand</span>
              <input
                className="field-input"
                value={form.brand}
                onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))}
              />
            </label>
            <label className="field-stack">
              <span>Shade name</span>
              <input
                className="field-input"
                value={form.shadeName}
                onChange={(event) => setForm((current) => ({ ...current, shadeName: event.target.value }))}
              />
            </label>
            <label className="field-stack">
              <span>Shade code</span>
              <input
                className="field-input"
                value={form.shadeCode}
                onChange={(event) => setForm((current) => ({ ...current, shadeCode: event.target.value }))}
              />
            </label>
            <label className="field-stack">
              <span>Color hex</span>
              <input
                className="field-input"
                value={form.colorHex}
                onChange={(event) => setForm((current) => ({ ...current, colorHex: event.target.value }))}
                placeholder="#C45A76"
              />
            </label>
            <label className="field-stack">
              <span>Skin tone tags</span>
              <input
                className="field-input"
                value={form.skinToneTags}
                onChange={(event) => setForm((current) => ({ ...current, skinToneTags: event.target.value }))}
                placeholder="warm|neutral"
              />
            </label>
            <label className="field-stack">
              <span>Budget min</span>
              <input
                className="field-input"
                type="number"
                value={form.budgetMin}
                onChange={(event) => setForm((current) => ({ ...current, budgetMin: event.target.value }))}
              />
            </label>
            <label className="field-stack">
              <span>Budget max</span>
              <input
                className="field-input"
                type="number"
                value={form.budgetMax}
                onChange={(event) => setForm((current) => ({ ...current, budgetMax: event.target.value }))}
              />
            </label>
            <label className="field-stack">
              <span>Status</span>
              <select
                className="field-input"
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
            <div className="form-actions">
              <button type="submit" className="primary-button">
                Save lipstick
              </button>
              <button type="button" className="ghost-button" onClick={resetForm}>
                Reset
              </button>
            </div>
          </form>
        </section>

        <section className="subpanel">
          <h3>CSV import</h3>
          <p className="module-copy">Paste CSV rows using the protected import flow. The whole batch is validated before write.</p>
          <textarea
            className="csv-textarea"
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder="brand,shadeName,shadeCode,colorHex,skinToneTags,budgetMin,budgetMax,status"
          />
          <button type="button" className="primary-button" onClick={handleImportCsv}>
            Import CSV
          </button>
        </section>
      </div>

      <section className="subpanel">
        <h3>Library records</h3>
        <div className="table-shell">
          <table className="record-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Shade</th>
                <th>Code</th>
                <th>Skin tone</th>
                <th>Budget</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record._id}>
                  <td>{record.brand}</td>
                  <td>{record.shadeName}</td>
                  <td>{record.shadeCode}</td>
                  <td>{(record.skinToneTags || []).join(", ")}</td>
                  <td>
                    ¥{record.budgetMin} - ¥{record.budgetMax}
                  </td>
                  <td>{record.status}</td>
                  <td className="row-actions">
                    <button type="button" className="ghost-button" onClick={() => applyRecordToForm(record)}>
                      Edit
                    </button>
                    <button type="button" className="ghost-button" onClick={() => handleToggleStatus(record)}>
                      {record.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
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
          <Route path="/lipsticks" element={<LipstickLibraryPage token={token} />} />
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
