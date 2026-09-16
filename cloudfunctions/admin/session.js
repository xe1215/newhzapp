const crypto = require("crypto");
const { fail, ok } = require("./response");
const { getRuntime, getEventData, withCollectionBootstrap } = require("./runtime");

function getSessionTtlSeconds(env) {
  return Number(env.ADMIN_SESSION_TTL_SECONDS || 7200);
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex");
}

function normalizeCredential(value) {
  return String(value || "").trim();
}

function createToken(runtime) {
  return runtime.randomBytes(24).toString("hex");
}

async function readSession(runtime, token) {
  if (!token) {
    return null;
  }

  const result = await withCollectionBootstrap(runtime, "admin_sessions", async () =>
    runtime.db.collection("admin_sessions").doc(token).get()
  );
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
  if (String((runtime.env || {}).ADMIN_AUTH_DISABLED || "").toLowerCase() === "true") {
    return {
      token: token || "auth-disabled",
      role: "developer",
      expiresAt: "",
      authDisabled: true,
    };
  }

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
  const expectedUsername = normalizeCredential(env.ADMIN_USERNAME);
  const expectedHash = String(env.ADMIN_PASSWORD_HASH || "");
  const sessionSecret = String(env.ADMIN_SESSION_SECRET || "");

  if (!expectedUsername || !expectedHash || !sessionSecret) {
    return fail("ADMIN_CONFIG_MISSING", "Admin secrets are not configured");
  }

  const username = normalizeCredential(data.username);
  const password = String(data.password || "");

  if (!username) {
    return fail("INVALID_CREDENTIALS", "Developer username is required");
  }

  if (!password) {
    return fail("INVALID_CREDENTIALS", "Developer password is required");
  }

  if (username !== expectedUsername) {
    return fail("INVALID_CREDENTIALS", "Developer username is incorrect");
  }

  const actualHash = `sha256$${hashPassword(password)}`;

  if (actualHash !== expectedHash) {
    return fail("INVALID_CREDENTIALS", "Developer password is incorrect");
  }

  const ttlSeconds = getSessionTtlSeconds(env);
  const issuedAt = runtime.now();
  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
  const token = createToken(runtime);

  await withCollectionBootstrap(runtime, "admin_sessions", async () => {
    await runtime.db.collection("admin_sessions").doc(token).set({
      data: {
        token,
        role: "developer",
        username,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        revokedAt: "",
        sessionDigest: crypto
          .createHash("sha256")
          .update(`${token}:${sessionSecret}`)
          .digest("hex"),
      },
    });
  });

  return ok({
    token,
    expiresIn: ttlSeconds,
    role: "developer",
    username,
  });
}

async function logout(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  await withCollectionBootstrap(runtime, "admin_sessions", async () => {
    await runtime.db.collection("admin_sessions").doc(session.token).update({
      data: {
        revokedAt: runtime.now().toISOString(),
      },
    });
  });

  return ok({
    loggedOut: true,
  });
}

module.exports = {
  requireSession,
  login,
  logout,
};
