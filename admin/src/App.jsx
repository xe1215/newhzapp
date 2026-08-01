import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminRuntimeDebug, getPreviewToken, getShell, login, logout } from "./lib/admin-api";
import { MODULES } from "./constants/admin-shell";
import { getStoredToken, storeToken } from "./utils/admin-format";
import ShellLayout from "./components/ShellLayout";
import LoginPage from "./pages/LoginPage";

const OperationsDashboardPage = lazy(() => import("./pages/OperationsDashboardPage"));
const LipstickLibraryPage = lazy(() => import("./pages/LipstickLibraryPage"));
const TestsPage = lazy(() => import("./pages/TestsPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const LogsPage = lazy(() => import("./pages/LogsPage"));

function PageFallback() {
  return (
    <section className="module-panel">
      <p className="module-copy">正在加载页面...</p>
    </section>
  );
}

export default function App() {
  const navigate = useNavigate();
  const [token, setToken] = useState(getStoredToken);
  const [shellData, setShellData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const runtimeDebug = useMemo(() => getAdminRuntimeDebug(), []);

  useEffect(() => {
    if (!token && runtimeDebug.isPreviewMode) {
      const previewToken = getPreviewToken();
      setToken(previewToken);
      storeToken(previewToken);
    }
  }, [runtimeDebug.isPreviewMode, token]);

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
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setToken("");
        storeToken("");
        setShellData(null);
        setErrorText(error.message || "无法加载开发者后台。");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleLogin(username, password) {
    setLoading(true);
    setErrorText("");

    try {
      const data = await login(username, password);
      setToken(data.token);
      storeToken(data.token);
    } catch (error) {
      let nextMessage = error && error.message ? error.message : "无法登录。";

      if (error && typeof error === "object") {
        try {
          const serialized = JSON.stringify(error);
          if (serialized && serialized !== "{}" && !nextMessage.includes(serialized)) {
            nextMessage = `${nextMessage} ${serialized}`;
          }
        } catch (serializationError) {
          return setErrorText(nextMessage);
        }
      }

      setErrorText(nextMessage);
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

  const pageElements = [
    {
      path: "/overview",
      element: (
        <Suspense fallback={<PageFallback />}>
          <OperationsDashboardPage token={token} />
        </Suspense>
      ),
    },
    {
      path: "/lipsticks",
      element: (
        <Suspense fallback={<PageFallback />}>
          <LipstickLibraryPage token={token} />
        </Suspense>
      ),
    },
    {
      path: "/tests",
      element: (
        <Suspense fallback={<PageFallback />}>
          <TestsPage token={token} />
        </Suspense>
      ),
    },
    {
      path: "/reports",
      element: (
        <Suspense fallback={<PageFallback />}>
          <ReportsPage token={token} />
        </Suspense>
      ),
    },
    {
      path: "/orders",
      element: (
        <Suspense fallback={<PageFallback />}>
          <OrdersPage token={token} />
        </Suspense>
      ),
    },
    {
      path: "/logs",
      element: (
        <Suspense fallback={<PageFallback />}>
          <LogsPage token={token} />
        </Suspense>
      ),
    },
  ];

  return <ShellLayout shellData={shellData} token={token} onLogout={handleLogout} pageElements={pageElements} />;
}
