import React, { useState } from "react";
import { getAdminRuntimeDebug } from "../lib/admin-api";

export default function LoginPage({ onLogin, loading, errorText }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const runtimeDebug = getAdminRuntimeDebug();

  return (
    <div className="login-page">
      <section className="login-card">
        <p className="login-kicker">开发者登录</p>
        <h1>开发者后台</h1>
        <p className="login-copy">请输入用户名和密码后进入运营后台。</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onLogin(username, password);
          }}
        >
          <label className="field-label" htmlFor="username">
            用户名
          </label>
          <input
            id="username"
            className="field-input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="请输入用户名"
          />

          <label className="field-label" htmlFor="password">
            密码
          </label>
          <input
            id="password"
            type="password"
            className="field-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入开发者密码"
          />

          <p className="runtime-debug">
            env: {runtimeDebug.envId || "missing"} | region: {runtimeDebug.region} | window cloud:{" "}
            {runtimeDebug.hasWindowCloud ? "yes" : "no"} | wx.cloud: {runtimeDebug.hasWxCloud ? "yes" : "no"} |
            preview: {runtimeDebug.isPreviewMode ? "on" : runtimeDebug.previewEnabled ? "available" : "off"} | access
            key: {runtimeDebug.accessKeyConfigured ? "yes" : "no"}
          </p>
          <p className="runtime-debug">
            runtime: {runtimeDebug.runtimeSource || "unknown"} | auth: {runtimeDebug.lastAuthResult || "idle"} |
            action: {runtimeDebug.lastAction || "none"}
          </p>
          {runtimeDebug.lastError ? <p className="error-text runtime-debug">debug: {runtimeDebug.lastError}</p> : null}
          {errorText ? <p className="error-text">{errorText}</p> : null}

          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
      </section>
    </div>
  );
}
