const assert = require("assert");
const Module = require("module");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return {
      DYNAMIC_CURRENT_ENV: "DYNAMIC_CURRENT_ENV",
      init() {},
      database() {
        throw new Error("Test must inject a fake database");
      },
      getWXContext() {
        throw new Error("Test must inject a fake WeChat context");
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

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

function createAdminDb(calls) {
  const state = {
    admin_sessions: {},
    admin_actions: {},
    lipsticks: {},
  };
  const missingCollections = new Set();

  function clone(value) {
    return value ? JSON.parse(JSON.stringify(value)) : value;
  }

  return {
    state,
    missingCollections,
    collection(name) {
      calls.push(["collection", name]);
      return {
        async createCollection() {
          calls.push(["createCollection", name]);
          missingCollections.delete(name);
          if (!state[name]) {
            state[name] = {};
          }
          return { ok: 1 };
        },
        async add(payload) {
          calls.push(["add", name, payload]);
          if (missingCollections.has(name)) {
            const error = new Error(`collection ${name} missing`);
            error.message = `document.add:fail -502005 database collection not exists: ${name}`;
            throw error;
          }
          if (!state[name]) {
            state[name] = {};
          }
          const data = clone(payload.data) || {};
          const id = data._id || `${name}-${Object.keys(state[name]).length + 1}`;
          state[name][id] = { _id: id, ...data };
          return { _id: id };
        },
        doc(id) {
          calls.push(["doc", name, id]);
          return {
            async get() {
              calls.push(["doc.get", name, id]);
              if (missingCollections.has(name)) {
                const error = new Error(`collection ${name} missing`);
                error.message = `document.get:fail -502005 database collection not exists: ${name}`;
                throw error;
              }
              return { data: clone((state[name] || {})[id] || null) };
            },
            async set(payload) {
              calls.push(["doc.set", name, id, payload]);
              if (missingCollections.has(name)) {
                const error = new Error(`collection ${name} missing`);
                error.message = `document.set:fail -502005 database collection not exists: ${name}`;
                throw error;
              }
              if (!state[name]) {
                state[name] = {};
              }
              state[name][id] = { _id: id, ...clone(payload.data) };
              return { stats: { created: 1 } };
            },
            async update(payload) {
              calls.push(["doc.update", name, id, payload]);
              if (missingCollections.has(name)) {
                const error = new Error(`collection ${name} missing`);
                error.message = `document.update:fail -502005 database collection not exists: ${name}`;
                throw error;
              }
              if (!state[name]) {
                state[name] = {};
              }
              state[name][id] = {
                ...(state[name][id] || { _id: id }),
                ...clone(payload.data),
              };
              return { stats: { updated: 1 } };
            },
          };
        },
      };
    },
  };
}

test("admin cloud function rejects protected access before login, supports login/logout, and keeps session secrets server-side", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createAdminDb(calls);
  const now = () => new Date("2026-06-23T12:00:00.000Z");
  const env = {
    ADMIN_PASSWORD_HASH: "sha256$4e738ca5563c06cfd0018299933d58db1dd8bf97f6973dc99bf6cdc64b5550bd",
    ADMIN_SESSION_SECRET: "server-only-session-secret",
    ADMIN_SESSION_TTL_SECONDS: "7200",
  };

  const unauthorized = await adminFunction.main(
    {
      action: "getShell",
      data: {},
    },
    {},
    {
      db,
      env,
      now,
    }
  );

  assert.strictEqual(unauthorized.code, "UNAUTHORIZED");

  const loginResult = await adminFunction.main(
    {
      action: "login",
      data: {
        password: "s3cr3t",
      },
    },
    {},
    {
      db,
      env,
      now,
    }
  );

  assert.strictEqual(loginResult.code, 0);
  assert.ok(loginResult.data.token);
  assert.strictEqual(loginResult.data.expiresIn, 7200);
  assert.ok(!JSON.stringify(loginResult.data).includes("server-only-session-secret"));
  assert.ok(
    calls.some(
      (call) => call[0] === "doc.set" && call[1] === "admin_sessions"
    ),
    "login should persist a server-side admin session"
  );

  const shellResult = await adminFunction.main(
    {
      action: "getShell",
      data: {
        token: loginResult.data.token,
      },
    },
    {},
    {
      db,
      env,
      now,
    }
  );

  assert.strictEqual(shellResult.code, 0);
  assert.strictEqual(shellResult.data.viewer.role, "developer");
  assert.deepStrictEqual(
    shellResult.data.modules.map((module) => module.key),
    [
      "overview",
      "lipsticks",
      "tests",
      "reports",
      "orders",
      "logs",
    ]
  );

  const logoutResult = await adminFunction.main(
    {
      action: "logout",
      data: {
        token: loginResult.data.token,
      },
    },
    {},
    {
      db,
      env,
      now,
    }
  );

  assert.strictEqual(logoutResult.code, 0);

  const rejectedAfterLogout = await adminFunction.main(
    {
      action: "getShell",
      data: {
        token: loginResult.data.token,
      },
    },
    {},
    {
      db,
      env,
      now,
    }
  );

  assert.strictEqual(rejectedAfterLogout.code, "UNAUTHORIZED");
});

test("admin cloud function returns a clear auth error when password is wrong", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createAdminDb(calls);

  const result = await adminFunction.main(
    {
      action: "login",
      data: {
        password: "wrong-password",
      },
    },
    {},
    {
      db,
      env: {
        ADMIN_PASSWORD_HASH: "sha256$4e738ca5563c06cfd0018299933d58db1dd8bf97f6973dc99bf6cdc64b5550bd",
        ADMIN_SESSION_SECRET: "server-only-session-secret",
      },
      now: () => new Date("2026-06-23T12:00:00.000Z"),
    }
  );

  assert.strictEqual(result.code, "INVALID_CREDENTIALS");
  assert.ok(
    !calls.some((call) => call[0] === "doc.set" && call[1] === "admin_sessions")
  );
});

test("admin cloud function auto-creates admin collections when they are missing", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createAdminDb(calls);
  db.missingCollections.add("admin_sessions");

  const result = await adminFunction.main(
    {
      action: "login",
      data: {
        password: "s3cr3t",
      },
    },
    {},
    {
      db,
      env: {
        ADMIN_PASSWORD_HASH: "sha256$4e738ca5563c06cfd0018299933d58db1dd8bf97f6973dc99bf6cdc64b5550bd",
        ADMIN_SESSION_SECRET: "server-only-session-secret",
        ADMIN_SESSION_TTL_SECONDS: "7200",
      },
      now: () => new Date("2026-06-23T12:00:00.000Z"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.ok(
    calls.some((call) => call[0] === "createCollection" && call[1] === "admin_sessions"),
    "login should bootstrap admin_sessions when the collection is missing"
  );
});

test("admin cloud function auto-creates admin action log collection when writes need it", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createAdminDb(calls);
  db.missingCollections.add("admin_actions");
  db.state.lipsticks.seed = {
    _id: "seed",
    brand: "Test",
    shadeName: "Rose",
    shadeCode: "R1",
    colorHex: "#AA0000",
    skinToneTags: ["warm"],
    budgetMin: 10,
    budgetMax: 20,
    status: "active",
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
  };
  db.state.admin_sessions.token1 = {
    _id: "token1",
    token: "token1",
    role: "developer",
    expiresAt: "2026-06-23T14:00:00.000Z",
    revokedAt: "",
  };

  const result = await adminFunction.main(
    {
      action: "setLipstickStatus",
      data: {
        token: "token1",
        lipstickId: "seed",
        status: "inactive",
      },
    },
    {},
    {
      db,
      env: {},
      now: () => new Date("2026-06-23T12:00:00.000Z"),
      id: () => "generated-action-id",
    }
  );

  assert.strictEqual(result.code, 0);
  assert.ok(
    calls.some((call) => call[0] === "createCollection" && call[1] === "admin_actions"),
    "write actions should bootstrap admin_actions when the collection is missing"
  );
});

test("developer console shell exists as an independent Vite app with login page, authenticated routes, and protected admin client", () => {
  for (const file of [
    "admin/package.json",
    "admin/index.html",
    "admin/.env.example",
    "admin/vite.config.js",
    "admin/src/main.jsx",
    "admin/src/App.jsx",
    "admin/src/styles.css",
    "admin/src/lib/admin-api.js",
  ]) {
    assert.ok(exists(file), `${file} should exist`);
  }

  const packageJson = readJson("admin/package.json");
  assert.strictEqual(packageJson.private, true);
  assert.match(packageJson.scripts.dev, /vite/);
  assert.match(packageJson.scripts.build, /vite build/);
  assert.ok(packageJson.dependencies["@cloudbase/js-sdk"]);
  assert.ok(packageJson.dependencies.react);
  assert.ok(packageJson.dependencies["react-router-dom"]);

  const appSource = readText("admin/src/App.jsx");
  const mainSource = readText("admin/src/main.jsx");
  const styles = readText("admin/src/styles.css");
  const apiClient = readText("admin/src/lib/admin-api.js");
  const envExample = readText("admin/.env.example");

  assert.match(appSource, /Developer Console/);
  assert.match(appSource, /Operations Overview/);
  assert.match(appSource, /Lipstick Library/);
  assert.match(appSource, /Test Records/);
  assert.match(appSource, /Report Records/);
  assert.match(appSource, /Orders and Refund Handling/);
  assert.match(appSource, /Generation and Event Logs/);
  assert.match(appSource, /login/);
  assert.match(appSource, /logout/);
  assert.match(appSource, /getShell/);
  assert.match(appSource, /Navigate|Routes|Route/);
  assert.match(mainSource, /BrowserRouter/);
  assert.match(styles, /\.admin-shell/);
  assert.match(styles, /\.sidebar/);
  assert.match(styles, /\.login-card/);
  assert.match(apiClient, /@cloudbase\/js-sdk/);
  assert.match(apiClient, /import\.meta\.env/);
  assert.match(apiClient, /callFunction/);
  assert.match(apiClient, /name:\s*"admin"/);
  assert.match(apiClient, /window\.__ADMIN_CLOUD__/);
  assert.match(envExample, /VITE_CLOUDBASE_ENV_ID/);
  assert.doesNotMatch(apiClient, /ADMIN_SESSION_SECRET|ADMIN_PASSWORD_HASH|secret/i);
});

test("developer console source keeps secrets out of the browser bundle inputs", () => {
  const trackedFiles = [
    "admin/index.html",
    "admin/src/main.jsx",
    "admin/src/App.jsx",
    "admin/src/styles.css",
    "admin/src/lib/admin-api.js",
  ];

  const joinedSource = trackedFiles.map(readText).join("\n");

  assert.doesNotMatch(joinedSource, /server-only-session-secret/);
  assert.doesNotMatch(joinedSource, /4e738ca5563c06cfd0018299933d58db1dd8bf97f6973dc99bf6cdc64b5550bd/);
  assert.doesNotMatch(joinedSource, /tcb-admin-node/);
});
