const testService = require("../../services/test");
const { getQueryValue, unwrapCloudCall } = require("../../utils/business");
const POLL_INTERVAL_MS = 3000;

Page({
  data: {
    testId: "",
    reportId: "",
    retryIndex: 0,
    generationFinished: false,
    statusText: "Generating try-on images...",
  },

  pollTimer: null,

  onLoad(query) {
    const testId = getQueryValue(query, "testId");
    const reportId = getQueryValue(query, "reportId");

    this.setData({
      testId,
      reportId,
    });

    this.generateImages();
  },

  onShow() {
    if (this.data.testId && this.data.reportId && !this.data.generationFinished) {
      this.queueNextPoll();
    }
  },

  generateImages() {
    this.clearPollTimer();

    if (!this.data.testId || !this.data.reportId) {
      this.setData({
        generationFinished: true,
        statusText: "Missing test information. Please start again.",
      });
      return;
    }

    testService
      .generateTryOnImages({
        testId: this.data.testId,
        reportId: this.data.reportId,
        retryIndex: this.data.retryIndex,
      })
      .then((response) => {
        const data = unwrapCloudCall(response, "Generation failed. Please retry.");

        if (data.status === "generating") {
          const completedCount = Number(data.completedCount || 0);
          const totalCount = Number(data.totalCount || 3);
          this.setData({
            statusText: `Generating try-on images... ${completedCount}/${totalCount}`,
            retryIndex: this.data.retryIndex + 1,
          });
          this.queueNextPoll();
          return;
        }

        wx.redirectTo({
          url: `/pages/preview/index?testId=${data.testId}&reportId=${data.reportId}`,
        });
        this.setData({
          generationFinished: true,
        });
      })
      .catch((error) => {
        this.setData({
          generationFinished: true,
          statusText: error.message || "Generation failed. Please retry.",
        });
      });
  },

  queueNextPoll() {
    this.clearPollTimer();
    this.pollTimer = setTimeout(() => {
      this.generateImages();
    }, POLL_INTERVAL_MS);
  },

  clearPollTimer() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  },

  onUnload() {
    this.clearPollTimer();
  },
});
