const assert = require("assert");
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

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function createDb(calls) {
  const state = {
    lipsticks: {
      "lip-1": {
        _id: "lip-1",
        brand: "Brand A",
        shadeName: "Daily Rose",
        shadeCode: "A01",
        colorHex: "#CC6677",
        skinToneTags: ["neutral", "warm"],
        budgetMin: 50,
        budgetMax: 120,
        status: "active",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    },
    admin_actions: {},
  };

  function createChain(name) {
    return {
      async get() {
        calls.push(["get", name]);
        return { data: Object.values(state[name] || {}).map(clone) };
      },
      doc(id) {
        calls.push(["doc", name, id]);
        return {
          async get() {
            calls.push(["doc.get", name, id]);
            return { data: clone((state[name] || {})[id] || null) };
          },
          async set(payload) {
            calls.push(["doc.set", name, id, payload]);
            state[name] = state[name] || {};
            state[name][id] = { _id: id, ...clone(payload.data) };
            return { stats: { created: 1 } };
          },
        };
      },
      async add(payload) {
        calls.push(["add", name, payload]);
        state[name] = state[name] || {};
        const id = `${name}-${Object.keys(state[name]).length + 1}`;
        state[name][id] = { _id: id, ...clone(payload.data) };
        return { _id: id };
      },
    };
  }

  return {
    state,
    collection(name) {
      calls.push(["collection", name]);
      return createChain(name);
    },
  };
}

test("admin actions can run with login validation disabled for the temporary developer backend", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createDb(calls);
  const deps = {
    db,
    env: {
      ADMIN_AUTH_DISABLED: "true",
    },
    now: () => new Date("2026-07-01T00:00:00.000Z"),
    id: () => "lip-2",
  };

  const listResult = await adminFunction.main(
    {
      action: "listLipsticks",
      data: {
        filters: {
          status: "active",
        },
      },
    },
    {},
    deps
  );

  assert.strictEqual(listResult.code, 0);
  assert.strictEqual(listResult.data.records.length, 1);
  assert.strictEqual(listResult.data.records[0].brand, "Brand A");

  const saveResult = await adminFunction.main(
    {
      action: "saveLipstick",
      data: {
        lipstick: {
          brand: "Brand B",
          productName: "Clear Berry",
          shadeCode: "B02",
          skinToneTags: ["cool"],
          budgetMin: 80,
          budgetMax: 160,
          status: "active",
        },
      },
    },
    {},
    deps
  );

  assert.strictEqual(saveResult.code, 0);
  assert.strictEqual(saveResult.data.record._id, "lip-2");
  assert.strictEqual(db.state.lipsticks["lip-2"].productName, "Clear Berry");
  assert.ok(
    Object.values(db.state.admin_actions).some(
      (action) => action.operation === "lipstick_create" && action.targetId === "lip-2"
    ),
    "saveLipstick should still audit writes while auth is disabled"
  );
});
