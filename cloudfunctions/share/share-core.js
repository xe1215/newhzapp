const cloud = require("wx-server-sdk");

function getRuntime(deps) {
  return {
    db: deps && deps.db ? deps.db : cloud.database(),
    wxContext: deps && deps.wxContext ? deps.wxContext : cloud.getWXContext(),
    now: deps && deps.now ? deps.now : () => new Date(),
  };
}

function ok(data) {
  return {
    code: 0,
    message: "ok",
    data: data || null,
  };
}

function fail(code, message, data) {
  return {
    code: code || -1,
    message: message || "error",
    data: data || null,
  };
}

function unsupported(action) {
  return fail("INVALID_ACTION", `Unsupported action: ${action || "unknown"}`);
}

function getEventData(event) {
  return (event && event.data) || {};
}

function getOpenId(runtime) {
  return runtime.wxContext && runtime.wxContext.OPENID;
}

function requireOpenId(runtime) {
  const openid = getOpenId(runtime);

  if (!openid) {
    return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  }

  return openid;
}

module.exports = {
  cloud,
  getRuntime,
  ok,
  fail,
  unsupported,
  getEventData,
  getOpenId,
  requireOpenId,
};
