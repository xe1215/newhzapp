import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createOperationalDataViewActions,
} from "../admin/src/hooks/useOperationalDataView.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function createTransitions(log) {
  return {
    setRecords(value) {
      log.push(["records", value]);
    },
    setSelectedDetail(value) {
      log.push(["selectedDetail", value]);
    },
    setLoading(value) {
      log.push(["loading", value]);
    },
    setDetailLoading(value) {
      log.push(["detailLoading", value]);
    },
    setErrorText(value) {
      log.push(["errorText", value]);
    },
    setSuccessText(value) {
      log.push(["successText", value]);
    },
  };
}

async function testListSuccessAndNormalization() {
  const log = [];
  const actions = createOperationalDataViewActions(
    {
      loadList: async () => ({ items: [{ id: "item-1" }] }),
      loadDetail: async () => null,
      listErrorMessage: "list fallback",
      detailErrorMessage: "detail fallback",
    },
    createTransitions(log)
  );

  await actions.loadData();
  assert.deepEqual(log, [
    ["loading", true],
    ["errorText", ""],
    ["records", [{ id: "item-1" }]],
    ["loading", false],
  ]);

  log.length = 0;
  const malformedActions = createOperationalDataViewActions(
    {
      loadList: async () => ({ items: "not-an-array" }),
      loadDetail: async () => null,
      listErrorMessage: "list fallback",
      detailErrorMessage: "detail fallback",
    },
    createTransitions(log)
  );
  await malformedActions.loadData();
  assert.deepEqual(log, [
    ["loading", true],
    ["errorText", ""],
    ["records", []],
    ["loading", false],
  ]);
}

async function testListFailureKeepsExistingRecords() {
  const log = [];
  const actions = createOperationalDataViewActions(
    {
      loadList: async () => {
        throw new Error("");
      },
      loadDetail: async () => null,
      listErrorMessage: "list fallback",
      detailErrorMessage: "detail fallback",
    },
    createTransitions(log)
  );

  await actions.loadData();
  assert.deepEqual(log, [
    ["loading", true],
    ["errorText", ""],
    ["errorText", "list fallback"],
    ["loading", false],
  ]);
}

async function testDetailSuccessAndFailureOrdering() {
  const log = [];
  const detail = { id: "detail-1" };
  const actions = createOperationalDataViewActions(
    {
      loadList: async () => ({ items: [] }),
      loadDetail: async () => detail,
      listErrorMessage: "list fallback",
      detailErrorMessage: "detail fallback",
      onDetailLoaded(value) {
        log.push(["onDetailLoaded", value]);
      },
    },
    createTransitions(log)
  );

  await actions.loadSelectedDetail("detail-1");
  assert.deepEqual(log, [
    ["detailLoading", true],
    ["errorText", ""],
    ["successText", ""],
    ["selectedDetail", detail],
    ["onDetailLoaded", detail],
    ["detailLoading", false],
  ]);

  log.length = 0;
  const failingActions = createOperationalDataViewActions(
    {
      loadList: async () => ({ items: [] }),
      loadDetail: async () => {
        throw new Error("specific detail failure");
      },
      listErrorMessage: "list fallback",
      detailErrorMessage: "detail fallback",
    },
    createTransitions(log)
  );
  await failingActions.loadSelectedDetail("detail-2");
  assert.deepEqual(log, [
    ["detailLoading", true],
    ["errorText", ""],
    ["successText", ""],
    ["errorText", "specific detail failure"],
    ["detailLoading", false],
  ]);
}

async function testConcurrentListsKeepResolutionOrder() {
  const log = [];
  const pending = [];
  const actions = createOperationalDataViewActions(
    {
      loadList: () => new Promise((resolve) => pending.push(resolve)),
      loadDetail: async () => null,
      listErrorMessage: "list fallback",
      detailErrorMessage: "detail fallback",
    },
    createTransitions(log)
  );

  const first = actions.loadData();
  const second = actions.loadData();
  pending[1]({ items: ["newer"] });
  await second;
  pending[0]({ items: ["older"] });
  await first;

  assert.deepEqual(
    log.filter(([name]) => name === "records"),
    [
      ["records", ["newer"]],
      ["records", ["older"]],
    ]
  );
}

function testDeletionSurface() {
  const hookSource = fs.readFileSync(
    path.join(root, "admin", "src", "hooks", "useOperationalDataView.js"),
    "utf8"
  );
  assert.match(hookSource, /useState\(options\.initialFilters\)/);
  assert.match(hookSource, /useState\(\[\]\)/);
  assert.match(hookSource, /useState\(null\)/);
  assert.match(hookSource, /useState\(true\)/);
  assert.match(hookSource, /useState\(false\)/);

  ["TestsPage.jsx", "ReportsPage.jsx", "OrdersPage.jsx"].forEach((fileName) => {
    const source = fs.readFileSync(path.join(root, "admin", "src", "pages", fileName), "utf8");
    assert.match(source, /useOperationalDataView/);
    assert.doesNotMatch(source, /Array\.isArray\(data\.items\)/);
    assert.doesNotMatch(source, /setDetailLoading\(true\)/);
  });

  [
    ["ReportsPage.jsx", /await handleSelect\(selectedDetail\.reportId\);\s*await loadData\(\);/],
    ["OrdersPage.jsx", /await handleSelect\(selectedDetail\.orderId\);\s*await loadData\(\);/],
  ].forEach(([fileName, expectedOrder]) => {
    const source = fs.readFileSync(path.join(root, "admin", "src", "pages", fileName), "utf8");
    assert.match(source, expectedOrder);
  });
}

await testListSuccessAndNormalization();
await testListFailureKeepsExistingRecords();
await testDetailSuccessAndFailureOrdering();
await testConcurrentListsKeepResolutionOrder();
testDeletionSurface();

console.log("ok - Developer Console Operational Data View async state");
