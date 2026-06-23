const cloud = require("wx-server-sdk");
const crypto = require("crypto");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const MODULES = [
  { key: "overview", label: "Operations Overview", path: "/overview" },
  { key: "lipsticks", label: "Lipstick Library", path: "/lipsticks" },
  { key: "tests", label: "Test Records", path: "/tests" },
  { key: "reports", label: "Report Records", path: "/reports" },
  { key: "orders", label: "Orders and Refund Handling", path: "/orders" },
  { key: "logs", label: "Generation and Event Logs", path: "/logs" },
];

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

function getRuntime(deps) {
  return {
    db: deps && deps.db ? deps.db : cloud.database(),
    env: deps && deps.env ? deps.env : process.env,
    now: deps && deps.now ? deps.now : () => new Date(),
    randomBytes:
      deps && deps.randomBytes
        ? deps.randomBytes
        : (size) => crypto.randomBytes(size),
  };
}

function getEventData(event) {
  return (event && event.data) || {};
}

function getSessionTtlSeconds(env) {
  return Number(env.ADMIN_SESSION_TTL_SECONDS || 7200);
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex");
}

function createToken(runtime) {
  return runtime.randomBytes(24).toString("hex");
}

async function readSession(runtime, token) {
  if (!token) {
    return null;
  }

  const result = await runtime.db.collection("admin_sessions").doc(token).get();
  const session = result.data || null;

  if (!session || session.revokedAt) {
    return null;
  }

  const nowMs = runtime.now().getTime();
  const expiresAtMs = Date.parse(session.expiresAt || "");

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    return null;
  }

  return session;
}

async function requireSession(runtime, token) {
  const session = await readSession(runtime, token);

  if (!session) {
    return fail("UNAUTHORIZED", "Developer login is required");
  }

  return session;
}

async function login(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const env = runtime.env || {};
  const expectedHash = String(env.ADMIN_PASSWORD_HASH || "");
  const sessionSecret = String(env.ADMIN_SESSION_SECRET || "");

  if (!expectedHash || !sessionSecret) {
    return fail("ADMIN_CONFIG_MISSING", "Admin secrets are not configured");
  }

  const password = String(data.password || "");

  if (!password) {
    return fail("INVALID_CREDENTIALS", "Developer password is required");
  }

  const actualHash = `sha256$${hashPassword(password)}`;

  if (actualHash !== expectedHash) {
    return fail("INVALID_CREDENTIALS", "Developer password is incorrect");
  }

  const ttlSeconds = getSessionTtlSeconds(env);
  const issuedAt = runtime.now();
  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
  const token = createToken(runtime);

  await runtime.db.collection("admin_sessions").doc(token).set({
    data: {
      token,
      role: "developer",
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      revokedAt: "",
      sessionDigest: crypto
        .createHash("sha256")
        .update(`${token}:${sessionSecret}`)
        .digest("hex"),
    },
  });

  return ok({
    token,
    expiresIn: ttlSeconds,
    role: "developer",
  });
}

async function logout(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  await runtime.db.collection("admin_sessions").doc(session.token).update({
    data: {
      revokedAt: runtime.now().toISOString(),
    },
  });

  return ok({
    loggedOut: true,
  });
}

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

async function main(event, context, deps) {
  const action = event && event.action;

  try {
    if (action === "login") {
      return await login(event, deps);
    }

    if (action === "logout") {
      return await logout(event, deps);
    }

    if (action === "getShell") {
      return await getShell(event, deps);
    }

    return unsupported(action);
  } catch (error) {
    return fail("ADMIN_FUNCTION_ERROR", error.message);
  }
}

exports.main = main;
exports.login = login;
exports.logout = logout;
exports.getShell = getShell;
