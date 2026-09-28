const cloud = require("wx-server-sdk");

function createRuntime(deps, extras, options) {
  const source = deps || {};
  const runtime = {
    db: source.db || cloud.database(),
    now: source.now || (() => new Date()),
  };
  if (!options || options.includeWxContext !== false) {
    runtime.wxContext = source.wxContext || cloud.getWXContext();
  }
  return Object.assign(runtime, extras || {});
}

function ok(data) {
  return { code: 0, message: "ok", data: data || null };
}

function fail(code, message, data) {
  return { code: code || -1, message: message || "error", data: data || null };
}

function unsupported(action) {
  return fail("INVALID_ACTION", `Unsupported action: ${action || "unknown"}`);
}

module.exports = { cloud, createRuntime, ok, fail, unsupported };
