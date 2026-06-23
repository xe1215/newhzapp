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
