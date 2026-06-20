const testService = require("../../services/test");
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
    const testId = query && query.testId ? query.testId : "";
    const reportId = query && query.reportId ? query.reportId : "";

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
        const result = response.result || {};

        if (result.code !== 0) {
          this.setData({
            generationFinished: true,
            statusText: result.message || "Generation failed. Please retry.",
          });
          return;
        }

        if (result.data && result.data.status === "generating") {
          const completedCount = Number(result.data.completedCount || 0);
          const totalCount = Number(result.data.totalCount || 3);
          this.setData({
            statusText: `Generating try-on images... ${completedCount}/${totalCount}`,
            retryIndex: this.data.retryIndex + 1,
          });
          this.queueNextPoll();
          return;
        }

        wx.redirectTo({
          url: `/pages/preview/index?testId=${result.data.testId}&reportId=${result.data.reportId}`,
        });
        this.setData({
          generationFinished: true,
        });
      })
      .catch(() => {
        this.setData({
          generationFinished: true,
          statusText: "Generation failed. Please retry.",
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
