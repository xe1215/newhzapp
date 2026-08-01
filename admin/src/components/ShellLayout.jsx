import React from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getPreviewToken } from "../lib/admin-api";
import { StatusPill } from "./admin-primitives";

export default function ShellLayout({ shellData, token, onLogout, pageElements }) {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedKey =
    shellData.modules.find((module) => module.path === location.pathname)?.key ||
    shellData.defaultModuleKey ||
    "overview";

  const viewerRole = shellData?.viewer?.role || "developer";

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div>
          <p className="brand-kicker">{"\u5f00\u53d1\u8005\u540e\u53f0"}</p>
          <h1 className="brand-title">newhzapp</h1>
          <p className="brand-copy">
            {"\u9762\u5411\u8fd0\u8425\u3001\u7ef4\u62a4\u548c\u6392\u67e5\u573a\u666f\u7684\u4e00\u4f53\u5316\u5de5\u4f5c\u53f0\u3002"}
          </p>
        </div>

        <nav className="nav-list">
          {shellData.modules.map((module) => (
            <button
              key={module.key}
              type="button"
              className={module.key === selectedKey ? "nav-item active" : "nav-item"}
              onClick={() => navigate(module.path)}
            >
              {module.label}
            </button>
          ))}
        </nav>

        <button type="button" className="ghost-button" onClick={onLogout}>
          {"\u9000\u51fa\u767b\u5f55"}
        </button>
      </aside>

      <main className="shell-main">
        <div className="topbar">
          <div>
            <p className="topbar-kicker">{"\u540e\u53f0\u5de5\u4f5c\u53f0"}</p>
            <h2>{"\u5f00\u53d1\u8005\u540e\u53f0"}</h2>
          </div>
          <div className="topbar-actions">
            <span className="viewer-pill">{viewerRole}</span>
            {token === getPreviewToken() ? <StatusPill text={"\u9884\u89c8\u6a21\u5f0f"} /> : null}
          </div>
        </div>
        <Routes>
          {pageElements.map((page) => (
            <Route key={page.path} path={page.path} element={page.element} />
          ))}
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>
    </div>
  );
}
