const assert = require("assert");
const crypto = require("crypto");
const Module = require("module");

const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return {
      DYNAMIC_CURRENT_ENV: "DYNAMIC_CURRENT_ENV",
      init() {},
      database() {
        throw new Error("Test must inject a fake database");
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((error) => {
      console.error(`not ok - ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

function createDb() {
  const state = {
    admin_sessions: {},
  };

  return {
    state,
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              return { data: state[name] && state[name][id] ? { ...state[name][id] } : null };
            },
            async set(payload) {
              state[name] = state[name] || {};
              state[name][id] = { _id: id, ...payload.data };
              return { stats: { created: 1 } };
            },
            async update(payload) {
              state[name] = state[name] || {};
              state[name][id] = { ...(state[name][id] || { _id: id }), ...payload.data };
              return { stats: { updated: 1 } };
            },
          };
        },
      };
    },
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

test("admin login requires a configured username and matching password", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const db = createDb();
  const deps = {
    db,
    env: {
      ADMIN_USERNAME: "developer",
      ADMIN_PASSWORD_HASH: `sha256$${sha256("s3cret-pass")}`,
      ADMIN_SESSION_SECRET: "session-secret",
      ADMIN_SESSION_TTL_SECONDS: "7200",
    },
    now: () => new Date("2026-07-01T00:00:00.000Z"),
    randomBytes: (size) => Buffer.alloc(size, 7),
  };

  const wrongUsername = await adminFunction.main(
    {
      action: "login",
      data: {
        username: "wrong",
        password: "s3cret-pass",
      },
    },
    {},
    deps
  );

  assert.strictEqual(wrongUsername.code, "INVALID_CREDENTIALS");

  const wrongPassword = await adminFunction.main(
    {
      action: "login",
      data: {
        username: "developer",
        password: "wrong-pass",
      },
    },
    {},
    deps
  );

  assert.strictEqual(wrongPassword.code, "INVALID_CREDENTIALS");

  const success = await adminFunction.main(
    {
      action: "login",
      data: {
        username: "developer",
        password: "s3cret-pass",
      },
    },
    {},
    deps
  );

  assert.strictEqual(success.code, 0);
  assert.strictEqual(success.data.role, "developer");
  assert.strictEqual(success.data.username, "developer");
  assert.ok(success.data.token);
  assert.ok(db.state.admin_sessions[success.data.token]);
  assert.strictEqual(db.state.admin_sessions[success.data.token].username, "developer");
});
