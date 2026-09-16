const AUTO_PLAY_DELAY = 4800;
const SWIPE_DISTANCE = 36;
const SWIPE_AXIS_RATIO = 1.15;
const EXIT_DELAY = 300;
const ENTRY_DELAY = 24;

function createRuntime(runtime) {
  return runtime || {
    setInterval(callback, delay) {
      return setInterval(callback, delay);
    },
    clearInterval(timer) {
      clearInterval(timer);
    },
    setTimeout(callback, delay) {
      return setTimeout(callback, delay);
    },
  };
}

function createDeckFlow(page, options, runtime) {
  const timers = createRuntime(runtime);

  function stop() {
    timers.clearInterval(page.deckFlowTimer);
    page.deckFlowTimer = null;
  }

  function start() {
    stop();
    if (!options.canAutoPlay()) return;
    page.deckFlowTimer = timers.setInterval(() => advance("left"), AUTO_PLAY_DELAY);
  }

  function advance(direction) {
    const count = options.getCount();
    if (page.deckTransitioning || count < options.minimumCount) return;
    page.deckTransitioning = true;
    const nextIndex =
      (options.getActiveIndex() + (direction === "left" ? 1 : -1) + count) % count;
    page.setData({ deckMotion: `deck-exit-${direction}` });
    page.deckExitTimer = timers.setTimeout(() => {
      page.setData(Object.assign(
        {},
        options.buildNextPatch(nextIndex, count),
        {
          deckMotion:
            direction === "left"
              ? "deck-enter-from-right"
              : "deck-enter-from-left",
        }
      ));
      page.deckMotionTimer = timers.setTimeout(() => {
        if (options.unlockBeforeMotionReset) {
          page.deckTransitioning = false;
          page.setData({ deckMotion: "" });
        } else {
          page.setData({ deckMotion: "" });
          page.deckTransitioning = false;
        }
        start();
      }, ENTRY_DELAY);
    }, EXIT_DELAY);
  }

  function touchStart(event) {
    stop();
    const point = event.touches && event.touches[0];
    page[options.touchStartKey] = point ? options.readPoint(point) : null;
  }

  function touchEnd(event) {
    const point = event.changedTouches && event.changedTouches[0];
    const startPoint = page[options.touchStartKey];
    if (!point || !startPoint) return;
    const endPoint = options.readPoint(point);
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    page[options.touchStartKey] = null;
    if (
      Math.abs(dx) > SWIPE_DISTANCE &&
      Math.abs(dx) > Math.abs(dy) * SWIPE_AXIS_RATIO
    ) {
      advance(dx < 0 ? "left" : "right");
      return;
    }
    start();
  }

  return {
    advance,
    start,
    stop,
    touchEnd,
    touchStart,
  };
}

module.exports = {
  createDeckFlow,
};
