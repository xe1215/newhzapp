const authService = require("../../services/auth");
const reportService = require("../../services/report");
const { unwrapCloudCall } = require("../../utils/business");
const { createDeckFlow } = require("../../utils/card-deck-flow");

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
    }, () => {
      this.startDeckFlow();
      reportService.listMyReports()
        .then((response) => {
          const reports = unwrapCloudCall(response, "");
          if (Array.isArray(reports.reports) && reports.reports.length) {
            wx.removeStorageSync("newhzLatestPreview");
            this.setData({ latestPreview: null });
          }
        })
        .catch(() => {});
    });
  },

  onHide() { this.stopDeckFlow(); },
  onUnload() { this.stopDeckFlow(); },

  getDeckFlow() {
    if (!this.deckFlow) {
      this.deckFlow = createDeckFlow(this, {
        canAutoPlay: () => Boolean(this.data.latestPreview),
        getCount: () => 3,
        getActiveIndex: () => this.data.homeFlowIndex,
        minimumCount: 0,
        touchStartKey: "homeFlowStart",
        readPoint: (point) => ({
          x: typeof point.clientX === "number" ? point.clientX : point.pageX,
          y: typeof point.clientY === "number" ? point.clientY : point.pageY,
        }),
        buildNextPatch: (nextIndex) => ({
          homeFlowIndex: nextIndex,
          homeDeck: buildHomeDeck(nextIndex),
        }),
        unlockBeforeMotionReset: false,
      });
    }
    return this.deckFlow;
  },

  startDeckFlow() {
    this.getDeckFlow().start();
  },

  stopDeckFlow() {
    this.getDeckFlow().stop();
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
    this.getDeckFlow().touchStart(e);
  },

  onDeckTouchEnd(e) {
    this.getDeckFlow().touchEnd(e);
  },

  advanceDeck(direction) {
    this.getDeckFlow().advance(direction);
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
