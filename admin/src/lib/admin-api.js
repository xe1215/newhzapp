function getCloudRuntime() {
  if (window.__ADMIN_CLOUD__ && typeof window.__ADMIN_CLOUD__.callFunction === "function") {
    return window.__ADMIN_CLOUD__;
  }

  throw new Error("Cloud runtime is unavailable.");
}

async function invokeAdmin(action, data) {
  const response = await getCloudRuntime().callFunction({
    name: "admin",
    data: {
      action,
      data: data || {},
    },
  });

  const result = response && response.result ? response.result : {};

  if (result.code !== 0) {
    throw new Error(result.message || "Admin request failed.");
  }

  return result.data || {};
}

export function login(password) {
  return invokeAdmin("login", { password });
}

export function logout(token) {
  return invokeAdmin("logout", { token });
}

export function getShell(token) {
  return invokeAdmin("getShell", { token });
}

export function getOverview(token, rangeKey) {
  return invokeAdmin("getOverview", { token, rangeKey });
}

export function listLipsticks(token, filters) {
  return invokeAdmin("listLipsticks", { token, filters: filters || {} });
}

export function saveLipstick(token, lipstick) {
  return invokeAdmin("saveLipstick", { token, lipstick });
}

export function setLipstickStatus(token, lipstickId, status) {
  return invokeAdmin("setLipstickStatus", { token, lipstickId, status });
}

export function importLipsticksCsv(token, csvText) {
  return invokeAdmin("importLipsticksCsv", { token, csvText });
}

export function exportLipsticksCsv(token) {
  return invokeAdmin("exportLipsticksCsv", { token });
}

export function listTests(token, filters) {
  return invokeAdmin("listTests", { token, filters: filters || {} });
}

export function getTestDetail(token, testId) {
  return invokeAdmin("getTestDetail", { token, testId });
}

export function listReports(token, filters) {
  return invokeAdmin("listReports", { token, filters: filters || {} });
}

export function getReportDetail(token, reportId) {
  return invokeAdmin("getReportDetail", { token, reportId });
}

export function flagReport(token, reportId, operation, reason) {
  return invokeAdmin("flagReport", {
    token,
    reportId,
    operation,
    reason,
  });
}
