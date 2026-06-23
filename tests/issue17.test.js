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

function createAdminLipstickDb(calls) {
  const state = {
    admin_sessions: {},
    lipsticks: {
      "lip-1": {
        _id: "lip-1",
        brand: "Aurora",
        shadeName: "Rose Tea",
        shadeCode: "A01",
        colorHex: "#B84B65",
        skinToneTags: ["warm", "neutral"],
        budgetMin: 120,
        budgetMax: 199,
        status: "active",
        createdAt: "2026-06-22T08:00:00.000Z",
        updatedAt: "2026-06-22T08:00:00.000Z",
      },
      "lip-2": {
        _id: "lip-2",
        brand: "Aurora",
        shadeName: "Berry Mist",
        shadeCode: "A02",
        colorHex: "#A14F70",
        skinToneTags: ["cool"],
        budgetMin: 220,
        budgetMax: 299,
        status: "inactive",
        createdAt: "2026-06-22T09:00:00.000Z",
        updatedAt: "2026-06-22T09:00:00.000Z",
      },
      "lip-3": {
        _id: "lip-3",
        brand: "Bloom",
        shadeName: "Cocoa Pink",
        shadeCode: "B18",
        colorHex: "#93505D",
        skinToneTags: ["neutral"],
        budgetMin: 150,
        budgetMax: 219,
        status: "active",
        createdAt: "2026-06-22T10:00:00.000Z",
        updatedAt: "2026-06-22T10:00:00.000Z",
      },
    },
    admin_actions: {},
  };

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function upsertDoc(name, id, nextValue) {
    if (!state[name]) {
      state[name] = {};
    }
    state[name][id] = {
      ...(state[name][id] || { _id: id }),
      ...clone(nextValue),
    };
  }

  function getCollectionData(name) {
    return Object.values(state[name] || {}).map(clone);
  }

  function matches(record, query) {
    return Object.entries(query || {}).every(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (Object.prototype.hasOwnProperty.call(value, "$gte")) {
          return Number(record[key] || 0) >= Number(value.$gte);
        }
        if (Object.prototype.hasOwnProperty.call(value, "$lte")) {
          return Number(record[key] || 0) <= Number(value.$lte);
        }
        if (Object.prototype.hasOwnProperty.call(value, "$in")) {
          return value.$in.includes(record[key]);
        }
      }

      if (Array.isArray(record[key])) {
        return record[key].includes(value);
      }

      return record[key] === value;
    });
  }

  function createWhereApi(name, query) {
    return {
      async get() {
        calls.push(["where.get", name, query]);
        return {
          data: getCollectionData(name).filter((item) => matches(item, query)),
        };
      },
      async update(payload) {
        calls.push(["where.update", name, query, payload]);
        const items = getCollectionData(name).filter((item) => matches(item, query));
        items.forEach((item) => {
          upsertDoc(name, item._id, payload.data);
        });
        return { stats: { updated: items.length } };
      },
    };
  }

  return {
    state,
    collection(name) {
      calls.push(["collection", name]);
      return {
        where(query) {
          calls.push(["where", name, query]);
          return createWhereApi(name, query);
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
              upsertDoc(name, id, { _id: id, ...payload.data });
              return { stats: { created: 1 } };
            },
            async update(payload) {
              calls.push(["doc.update", name, id, payload]);
              upsertDoc(name, id, payload.data);
              return { stats: { updated: 1 } };
            },
          };
        },
        async add(payload) {
          calls.push(["add", name, payload]);
          const id = payload.data._id || `${name}-${Object.keys(state[name] || {}).length + 1}`;
          upsertDoc(name, id, { _id: id, ...payload.data });
          return { _id: id };
        },
        async get() {
          calls.push(["get", name]);
          return { data: getCollectionData(name) };
        },
      };
    },
  };
}

async function loginAsDeveloper(adminFunction, db) {
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
      randomBytes: () => Buffer.from("123456789012345678901234", "utf8"),
    }
  );

  assert.strictEqual(result.code, 0);
  return result.data.token;
}

test("admin lipstick library requires developer login and supports filtering by brand, skin tone tag, budget range, and status", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createAdminLipstickDb(calls);

  const unauthorized = await adminFunction.main(
    {
      action: "listLipsticks",
      data: {},
    },
    {},
    {
      db,
      now: () => new Date("2026-06-23T12:00:00.000Z"),
    }
  );

  assert.strictEqual(unauthorized.code, "UNAUTHORIZED");

  const token = await loginAsDeveloper(adminFunction, db);
  const result = await adminFunction.main(
    {
      action: "listLipsticks",
      data: {
        token,
        filters: {
          brand: "Aurora",
          skinToneTag: "warm",
          budgetMin: 100,
          budgetMax: 200,
          status: "active",
        },
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-23T12:00:00.000Z"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.records.length, 1);
  assert.strictEqual(result.data.records[0].shadeCode, "A01");
  assert.ok(Array.isArray(result.data.availableFilters.brands));
  assert.ok(result.data.availableFilters.brands.includes("Aurora"));
});

test("admin lipstick save validates required fields, creates a new record, and appends an admin action snapshot", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createAdminLipstickDb(calls);
  const token = await loginAsDeveloper(adminFunction, db);

  const invalid = await adminFunction.main(
    {
      action: "saveLipstick",
      data: {
        token,
        lipstick: {
          brand: "",
          shadeName: "New Shade",
          shadeCode: "N01",
          colorHex: "123456",
          skinToneTags: [],
          budgetMin: 99,
          budgetMax: 80,
          status: "draft",
        },
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-23T12:00:00.000Z"),
    }
  );

  assert.strictEqual(invalid.code, "INVALID_LIPSTICK");
  assert.match(JSON.stringify(invalid.data), /brand|required|colorHex|status|budget/i);

  const result = await adminFunction.main(
    {
      action: "saveLipstick",
      data: {
        token,
        lipstick: {
          brand: "Nova",
          shadeName: "Tea Bloom",
          shadeCode: "N01",
          colorHex: "#C45A76",
          skinToneTags: ["warm", "neutral"],
          budgetMin: 129,
          budgetMax: 189,
          status: "active",
        },
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-23T12:00:00.000Z"),
      id: () => "lip-new",
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.record._id, "lip-new");
  assert.strictEqual(db.state.lipsticks["lip-new"].brand, "Nova");

  const actionRecord = Object.values(db.state.admin_actions).find((item) => item.operation === "lipstick_create");
  assert.ok(actionRecord, "creating a lipstick should append an admin action");
  assert.strictEqual(actionRecord.targetId, "lip-new");
  assert.strictEqual(actionRecord.before, null);
  assert.strictEqual(actionRecord.after.shadeCode, "N01");
});

test("admin lipstick status change edits without deleting records and records before/after snapshots", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createAdminLipstickDb(calls);
  const token = await loginAsDeveloper(adminFunction, db);

  const result = await adminFunction.main(
    {
      action: "setLipstickStatus",
      data: {
        token,
        lipstickId: "lip-1",
        status: "inactive",
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-23T12:00:00.000Z"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(db.state.lipsticks["lip-1"].status, "inactive");

  const actionRecord = Object.values(db.state.admin_actions).find((item) => item.operation === "lipstick_status_change");
  assert.ok(actionRecord);
  assert.strictEqual(actionRecord.before.status, "active");
  assert.strictEqual(actionRecord.after.status, "inactive");
});

test("admin lipstick CSV import validates the whole batch before writing and returns row-level errors", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createAdminLipstickDb(calls);
  const token = await loginAsDeveloper(adminFunction, db);

  const invalid = await adminFunction.main(
    {
      action: "importLipsticksCsv",
      data: {
        token,
        csvText: [
          "brand,shadeName,shadeCode,colorHex,skinToneTags,budgetMin,budgetMax,status",
          "Aurora,Rose Tea,A01,#B84B65,warm|neutral,120,199,active",
          ",Broken,N02,#ZZZZZZ,warm,200,180,draft",
        ].join("\n"),
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-23T12:00:00.000Z"),
    }
  );

  assert.strictEqual(invalid.code, "INVALID_CSV_IMPORT");
  assert.strictEqual(invalid.data.errors.length, 2);
  assert.ok(invalid.data.errors.some((item) => item.rowNumber === 2 && /duplicate/i.test(item.reason)));
  assert.ok(invalid.data.errors.some((item) => item.rowNumber === 3 && /required|format|status|budget/i.test(item.reason)));
  assert.strictEqual(Object.keys(db.state.lipsticks).length, 3);

  const valid = await adminFunction.main(
    {
      action: "importLipsticksCsv",
      data: {
        token,
        csvText: [
          "brand,shadeName,shadeCode,colorHex,skinToneTags,budgetMin,budgetMax,status",
          "Nova,Tea Bloom,N01,#C45A76,warm|neutral,129,189,active",
          "Nova,Berry Glass,N02,#B14E75,cool|neutral,189,259,inactive",
        ].join("\n"),
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-23T12:00:00.000Z"),
      id: (() => {
        const ids = ["lip-import-1", "lip-import-2", "action-import-1"];
        return () => ids.shift();
      })(),
    }
  );

  assert.strictEqual(valid.code, 0);
  assert.strictEqual(valid.data.importedCount, 2);
  assert.ok(db.state.lipsticks["lip-import-1"]);
  assert.ok(db.state.lipsticks["lip-import-2"]);

  const importAction = Object.values(db.state.admin_actions).find((item) => item.operation === "lipstick_import_csv");
  assert.ok(importAction);
  assert.strictEqual(importAction.after.importedCount, 2);
});

test("admin lipstick CSV export returns the current library as a CSV download payload", async () => {
  const adminFunction = require("../cloudfunctions/admin");
  const calls = [];
  const db = createAdminLipstickDb(calls);
  const token = await loginAsDeveloper(adminFunction, db);

  const result = await adminFunction.main(
    {
      action: "exportLipsticksCsv",
      data: {
        token,
      },
    },
    {},
    {
      db,
      now: () => new Date("2026-06-23T12:00:00.000Z"),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.match(result.data.fileName, /^lipsticks-/);
  assert.match(result.data.csvText, /brand,shadeName,shadeCode,colorHex,skinToneTags,budgetMin,budgetMax,status/);
  assert.match(result.data.csvText, /Aurora,Rose Tea,A01/);
});

test("developer console lipstick module exposes filters, csv import export, create edit, and status actions through protected admin APIs", () => {
  const appSource = readText("admin/src/App.jsx");
  const apiSource = readText("admin/src/lib/admin-api.js");

  assert.match(appSource, /Lipstick Library/);
  assert.match(appSource, /listLipsticks/);
  assert.match(appSource, /saveLipstick/);
  assert.match(appSource, /setLipstickStatus/);
  assert.match(appSource, /importLipsticksCsv/);
  assert.match(appSource, /exportLipsticksCsv/);
  assert.match(appSource, /brand/i);
  assert.match(appSource, /skin tone/i);
  assert.match(appSource, /budget/i);
  assert.match(appSource, /CSV/i);

  assert.match(apiSource, /invokeAdmin\("listLipsticks"/);
  assert.match(apiSource, /invokeAdmin\("saveLipstick"/);
  assert.match(apiSource, /invokeAdmin\("setLipstickStatus"/);
  assert.match(apiSource, /invokeAdmin\("importLipsticksCsv"/);
  assert.match(apiSource, /invokeAdmin\("exportLipsticksCsv"/);
});
