const authService = require("../../services/auth");
const { unwrapCloudCall } = require("../../utils/business");

function buildHomeDeck(activeIndex) {
  const slots = ["stack-front", "stack-middle", "stack-back"];
  return ["A", "B", "C"].map((label, index) => ({
    label,
    active: index === activeIndex,
    stackSlot: slots[(index - activeIndex + 3) % 3],
  }));
}

Page({
  data: {
    userReady: false,
    loginError: "",
    latestPreview: null,
    homeDeck: buildHomeDeck(0),
    deckMotion: "",
    homeFlowIndex: 0,
    deckDragOffset: 0,
    deckDragY: 0,
    deckDragRotation: 0,
    deckDragging: false,
    steps: [
      "Upload a clear selfie",
      "Choose skin tone, budget, scene, and style",
      "Preview three watermarked lipstick looks",
      "Unlock the full report for 5.99 CNY",
    ],
  },

  onLoad() {
    this.deckSwipeThreshold = wx.getSystemInfoSync().windowWidth * 0.3;
    this.bootstrapUser();
  },

  onShow() {
    const latestPreview = wx.getStorageSync("newhzLatestPreview");
    this.setData({
      latestPreview:
        latestPreview && latestPreview.testId && latestPreview.reportId
          ? latestPreview
          : null,
    }, () => this.startDeckFlow());
  },

  onHide() { this.stopDeckFlow(); },
  onUnload() { this.stopDeckFlow(); },

  startDeckFlow() {
    this.stopDeckFlow();
    if (!this.data.latestPreview) return;
    this.deckFlowTimer = setInterval(() => this.advanceDeck("left"), 4800);
  },

  stopDeckFlow() {
    clearInterval(this.deckFlowTimer);
    this.deckFlowTimer = null;
  },

  bootstrapUser() {
    authService
      .silentLogin()
      .then((response) => {
        const app = getApp();
        app.globalData.user = unwrapCloudCall(
          response,
          "Cloud login is not ready. Please try again later."
        );
        this.setData({ userReady: true, loginError: "" });
      })
      .catch(() => {
        this.setData({
          userReady: false,
          loginError: "Cloud login is not ready. Please try again later.",
        });
      });
  },

  startTest() {
    if (!this.data.userReady) {
      this.setData({ loginError: "\u6B63\u5728\u51C6\u5907\u8D26\u53F7\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002" });
      return;
    }
    wx.navigateTo({
      url: "/pages/upload/index",
    });
  },

  openLatestPreview() {
    const latestPreview = this.data.latestPreview;

    if (latestPreview) {
      wx.navigateTo({
        url: `/pages/preview/index?testId=${latestPreview.testId}&reportId=${latestPreview.reportId}`,
      });
      return;
    }

    wx.showModal({
      title: "还没有试色预览",
      content: "先上传一张自拍，生成你的专属试色预览。",
      confirmText: "开始试色",
      success: (result) => {
        if (result.confirm) {
          this.startTest();
        }
      },
    });
  },

  onDeckTouchStart(e) {
    this.stopDeckFlow();
    const point = e.touches && e.touches[0];
    this.homeFlowStart = point ? {
      x: typeof point.clientX === "number" ? point.clientX : point.pageX,
      y: typeof point.clientY === "number" ? point.clientY : point.pageY,
    } : null;
  },

  onDeckTouchEnd(e) {
    const point = e.changedTouches && e.changedTouches[0];
    if (!point || !this.homeFlowStart) return;
    const gesture = this.homeFlowStart;
    const x = typeof point.clientX === "number" ? point.clientX : point.pageX;
    const y = typeof point.clientY === "number" ? point.clientY : point.pageY;
    const dx = x - gesture.x;
    const dy = y - gesture.y;
    this.homeFlowStart = null;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      this.advanceDeck(dx < 0 ? "left" : "right");
      return;
    }
    this.startDeckFlow();
  },

  advanceDeck(direction) {
    if (this.deckTransitioning) return;
    this.deckTransitioning = true;
    const nextIndex = (this.data.homeFlowIndex + (direction === "left" ? 1 : -1) + 3) % 3;
    this.setData({ deckMotion: `deck-exit-${direction}` });
    this.deckExitTimer = setTimeout(() => {
      this.setData({
        homeFlowIndex: nextIndex,
        homeDeck: buildHomeDeck(nextIndex),
        deckMotion: direction === "left" ? "deck-enter-from-right" : "deck-enter-from-left",
      });
      this.deckMotionTimer = setTimeout(() => {
        this.setData({ deckMotion: "" });
        this.deckTransitioning = false;
        this.startDeckFlow();
      }, 24);
    }, 300);
  },

  openHome() {},

  openMy() {
    wx.redirectTo({ url: "/pages/my/index" });
  },

  openReports() {
    wx.redirectTo({
      url: "/pages/my-reports/index",
    });
  },
});
