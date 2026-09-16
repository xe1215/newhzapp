const assert = require("assert");
const fs = require("fs");
const path = require("path");

function loadPage(relativePath) {
  const absolutePath = path.join(__dirname, "..", relativePath);
  const previousPage = global.Page;
  let definition = null;
  global.Page = (value) => {
    definition = value;
  };
  delete require.cache[require.resolve(absolutePath)];
  try {
    require(absolutePath);
  } finally {
    global.Page = previousPage;
  }
  return definition;
}

function createPage(definition, overrides) {
  const page = Object.assign({}, definition);
  page.data = Object.assign({}, definition.data, overrides || {});
  page.setDataCalls = [];
  page.setData = function setData(patch, callback) {
    this.setDataCalls.push({
      patch,
      transitioningAtCall: this.deckTransitioning,
    });
    Object.assign(this.data, patch);
    if (callback) callback();
  };
  return page;
}

function withFakeTimers(run) {
  const previousSetInterval = global.setInterval;
  const previousClearInterval = global.clearInterval;
  const previousSetTimeout = global.setTimeout;
  const intervals = [];
  const clearedIntervals = [];
  const timeouts = [];

  global.setInterval = (callback, delay) => {
    const timer = { callback, delay };
    intervals.push(timer);
    return timer;
  };
  global.clearInterval = (timer) => clearedIntervals.push(timer);
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay };
    timeouts.push(timer);
    return timer;
  };

  try {
    run({ intervals, clearedIntervals, timeouts });
  } finally {
    global.setInterval = previousSetInterval;
    global.clearInterval = previousClearInterval;
    global.setTimeout = previousSetTimeout;
  }
}

function touch(x, y, pageX, pageY) {
  return { clientX: x, clientY: y, pageX, pageY };
}

const homeDefinition = loadPage("miniprogram/pages/home/index.js");
const reportsDefinition = loadPage("miniprogram/pages/my-reports/index.js");

withFakeTimers(({ intervals, timeouts }) => {
  const page = createPage(homeDefinition, {
    latestPreview: { testId: "test-1", reportId: "report-1" },
  });

  page.startDeckFlow();
  assert.strictEqual(intervals.length, 1);
  assert.strictEqual(intervals[0].delay, 4800);

  intervals[0].callback();
  assert.deepStrictEqual(page.setDataCalls[0].patch, { deckMotion: "deck-exit-left" });
  assert.strictEqual(timeouts[0].delay, 300);

  timeouts[0].callback();
  assert.strictEqual(page.data.homeFlowIndex, 1);
  assert.deepStrictEqual(page.data.homeDeck.map((item) => item.stackSlot), [
    "stack-back",
    "stack-front",
    "stack-middle",
  ]);
  assert.strictEqual(page.data.deckMotion, "deck-enter-from-right");
  assert.strictEqual(timeouts[1].delay, 24);

  timeouts[1].callback();
  const clearMotionCall = page.setDataCalls[2];
  assert.deepStrictEqual(clearMotionCall.patch, { deckMotion: "" });
  assert.strictEqual(clearMotionCall.transitioningAtCall, true);
  assert.strictEqual(page.deckTransitioning, false);
  assert.strictEqual(intervals.length, 2);
});

withFakeTimers(({ intervals }) => {
  const page = createPage(homeDefinition, {
    latestPreview: { testId: "test-1", reportId: "report-1" },
  });
  page.onDeckTouchStart({ touches: [touch(0, 20, 99, 88)] });
  assert.deepStrictEqual(page.homeFlowStart, { x: 0, y: 20 });
  page.onDeckTouchEnd({ changedTouches: [touch(10, 22, 10, 22)] });
  assert.strictEqual(intervals.length, 1);

  page.onDeckTouchStart({ touches: [touch(120, 20, 120, 20)] });
  const intervalCount = intervals.length;
  page.onDeckTouchEnd({ changedTouches: [] });
  assert.strictEqual(intervals.length, intervalCount);
});

withFakeTimers(({ intervals, timeouts }) => {
  const displayReports = [0, 1, 2].map((index) => ({
    recommendationIndex: index,
    active: index === 0,
    stackSlot: ["stack-front", "stack-middle", "stack-back"][index],
  }));
  const page = createPage(reportsDefinition, { displayReports });

  page.startDeckFlow();
  assert.strictEqual(intervals.length, 1);
  assert.strictEqual(intervals[0].delay, 4800);

  page.onDeckTouchStart({ touches: [touch(0, 0, 95, 75)] });
  assert.deepStrictEqual(page.deckStart, { x: 95, y: 75 });
  page.onDeckTouchEnd({ changedTouches: [touch(20, 0, 20, 75)] });
  assert.deepStrictEqual(page.setDataCalls[0].patch, { deckMotion: "deck-exit-left" });
  assert.strictEqual(timeouts[0].delay, 300);

  timeouts[0].callback();
  assert.strictEqual(page.data.reportFlowIndex, 1);
  assert.deepStrictEqual(page.data.displayReports.map((item) => item.stackSlot), [
    "stack-back",
    "stack-front",
    "stack-middle",
  ]);
  assert.strictEqual(page.data.deckMotion, "deck-enter-from-right");
  timeouts[1].callback();
  const clearMotionCall = page.setDataCalls[2];
  assert.deepStrictEqual(clearMotionCall.patch, { deckMotion: "" });
  assert.strictEqual(clearMotionCall.transitioningAtCall, false);
});

withFakeTimers(({ intervals, timeouts }) => {
  const page = createPage(reportsDefinition, {
    displayReports: [{ recommendationIndex: 0, active: true, stackSlot: "stack-front" }],
  });
  page.startDeckFlow();
  page.advanceDeck("left");
  assert.strictEqual(intervals.length, 0);
  assert.strictEqual(timeouts.length, 0);
  assert.deepStrictEqual(page.setDataCalls, []);
});

withFakeTimers(({ timeouts }) => {
  const page = createPage(homeDefinition, {
    latestPreview: { testId: "test-1", reportId: "report-1" },
  });
  page.advanceDeck("right");
  page.advanceDeck("left");
  assert.strictEqual(page.setDataCalls.length, 1);
  assert.deepStrictEqual(page.setDataCalls[0].patch, { deckMotion: "deck-exit-right" });
  timeouts[0].callback();
  assert.strictEqual(page.data.homeFlowIndex, 2);
  assert.strictEqual(page.data.deckMotion, "deck-enter-from-left");
});

const root = path.join(__dirname, "..");
const deckFlowSource = fs.readFileSync(
  path.join(root, "miniprogram", "utils", "card-deck-flow.js"),
  "utf8"
);
[
  "miniprogram/pages/home/index.js",
  "miniprogram/pages/my-reports/index.js",
].forEach((relativePath) => {
  const pageSource = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert.match(pageSource, /createDeckFlow/);
  assert.doesNotMatch(pageSource, /setInterval|setTimeout|Math\.abs\(dx\)|deck-exit-/);
});
assert.match(deckFlowSource, /const AUTO_PLAY_DELAY = 4800/);
assert.match(deckFlowSource, /const SWIPE_DISTANCE = 36/);
assert.match(deckFlowSource, /const SWIPE_AXIS_RATIO = 1\.15/);
assert.match(deckFlowSource, /const EXIT_DELAY = 300/);
assert.match(deckFlowSource, /const ENTRY_DELAY = 24/);

console.log("ok - miniprogram card deck flow characterization");
