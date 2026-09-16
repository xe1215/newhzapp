const { MODULES } = require("./constants");
const { ok } = require("./response");
const { getRuntime, getEventData } = require("./runtime");
const { requireSession } = require("./session");

async function getShell(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  return ok({
    viewer: {
      role: "developer",
      sessionExpiresAt: session.expiresAt,
    },
    modules: MODULES,
    defaultModuleKey: "overview",
  });
}

module.exports = {
  getShell,
};
