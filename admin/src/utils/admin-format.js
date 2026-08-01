export function getStoredToken() {
  try {
    return window.sessionStorage.getItem("admin_token") || "";
  } catch (error) {
    return "";
  }
}

export function storeToken(token) {
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

export function formatPercent(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}

export function formatCurrency(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

export function formatCount(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
}

export function formatTimestamp(value) {
  return value || "未记录";
}

export function emptyInvestigationFilters(extra) {
  return {
    openid: "",
    status: "",
    startDate: "",
    endDate: "",
    ...(extra || {}),
  };
}

export async function copyText(value) {
  if (!value) {
    return false;
  }

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      return false;
    }
  }

  return false;
}

export function renderArrayValue(list) {
  return Array.isArray(list) && list.length ? list.join(", ") : "无";
}
