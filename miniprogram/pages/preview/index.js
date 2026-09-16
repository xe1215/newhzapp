const reportService = require("../../services/report");
const paymentService = require("../../services/payment");
const testService = require("../../services/test");
const { getQueryValue, unwrapCloudCall } = require("../../utils/business");
const { resolveCloudFileList } = require("../../utils/media");

function buildPreviewCards(images, activeIndex) {
  const slots = ["fan-front", "fan-mid", "fan-back"];
  return images.slice(0, 3).map((image, index) => ({
    index,
    url: image && image.url ? image.url : "",
    label: ["A", "B", "C"][index] || String(index + 1),
    slot: slots[(index - activeIndex + 3) % 3],
    active: index === activeIndex,
  }));
}

Page({
  data: {
    testId: "",
    reportId: "",
    loading: true,
    errorText: "",
    previewImages: [],
    remainingRegenerateCount: null,
    canRegeneratePreview: true,
    unlocking: false,
    currentIndex: 0,
    previewCards: [],
    previewDragOffset: 0,
    previewDragY: 0,
    previewDragRotation: 0,
    previewDragging: false,
    previewMotion: "",
  },

  onLoad(query) {
    const testId = getQueryValue(query, "testId");
    const reportId = getQueryValue(query, "reportId");

    this.setData({
      testId,
      reportId,
    });

    if (testId && reportId) {
      wx.setStorageSync("newhzLatestPreview", { testId, reportId });
    }

    this.loadPreview();
  },

  loadPreview() {
    if (!this.data.testId || !this.data.reportId) {
      this.setData({
        loading: false,
        errorText: "Missing report information. Please generate again.",
      });
      return;
    }

    this.setData({
      loading: true,
      errorText: "",
    });

    reportService
      .getPreview({
        testId: this.data.testId,
        reportId: this.data.reportId,
      })
      .then((response) => {
        const data = unwrapCloudCall(response, "Preview is not ready.");
        this.setData({
          remainingRegenerateCount:
            typeof data.remainingRegenerateCount === "number"
              ? data.remainingRegenerateCount
              : this.data.remainingRegenerateCount,
          canRegeneratePreview:
            typeof data.remainingRegenerateCount === "number"
              ? data.remainingRegenerateCount > 0
              : this.data.canRegeneratePreview,
        });

        return this.resolvePreviewImages(data);
      })
      .then((previewImages) => {
        const currentIndex = Math.min(this.data.currentIndex, Math.max(0, previewImages.length - 1));
        this.setData({
          loading: false,
          previewImages,
          currentIndex,
          previewCards: buildPreviewCards(previewImages, currentIndex),
          errorText: previewImages.length ? "" : "No preview images are ready yet.",
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          errorText: error.message || "Preview failed to load.",
          previewImages: [],
        });
      });
  },

  resolvePreviewImages(report) {
    return resolveCloudFileList(report.previewImages, "Look");
  },

  unlockReport() {
    if (!this.data.testId) {
      this.setData({
        errorText: "Missing test information. Please generate again.",
      });
      return;
    }

    this.setData({
      unlocking: true,
      errorText: "",
    });

    paymentService
      .createReportOrder({
        testId: this.data.testId,
      })
      .then((response) => {
        const order = unwrapCloudCall(response, "Unable to create payment order.");
        wx.navigateTo({
          url:
            `/pages/payment-result/index?orderId=${order.orderId}` +
            `&testId=${this.data.testId}` +
            `&reportId=${order.reportId || this.data.reportId}`,
        });
      })
      .catch((error) => {
        this.setData({
          errorText: error.message || "Unable to create payment order.",
        });
      })
      .finally(() => {
        this.setData({
          unlocking: false,
        });
      });
  },

  regeneratePreview() {
    if (!this.data.testId || !this.data.reportId) {
      this.setData({
        errorText: "Missing report information. Please generate again.",
      });
      return;
    }

    if (!this.data.canRegeneratePreview) {
      this.setData({
        errorText: "No free refreshes left. Please adjust preferences and try again.",
      });
      return;
    }

    this.setData({
      loading: true,
      errorText: "",
    });

    testService
      .regeneratePreview({
        testId: this.data.testId,
        reportId: this.data.reportId,
      })
      .then((response) => {
        const data = unwrapCloudCall(response, "Preview refresh failed.");
        if (data.status === "generating") {
          this.setData({
            loading: false,
            remainingRegenerateCount:
              typeof data.remainingRegenerateCount === "number"
                ? data.remainingRegenerateCount
                : this.data.remainingRegenerateCount,
            canRegeneratePreview: true,
            errorText: "Preview refresh is still generating. Tap refresh again in a moment.",
          });
          return null;
        }

        this.setData({
          reportId: data.reportId || this.data.reportId,
          remainingRegenerateCount:
            typeof data.remainingRegenerateCount === "number"
              ? data.remainingRegenerateCount
              : this.data.remainingRegenerateCount,
          canRegeneratePreview:
            typeof data.remainingRegenerateCount === "number"
              ? data.remainingRegenerateCount > 0
              : this.data.canRegeneratePreview,
        });

        return this.resolvePreviewImages(data);
      })
      .then((previewImages) => {
        if (previewImages === null) {
          return;
        }

        const currentIndex = Math.min(this.data.currentIndex, Math.max(0, previewImages.length - 1));
        this.setData({
          loading: false,
          previewImages,
          currentIndex,
          previewCards: buildPreviewCards(previewImages, currentIndex),
          errorText: previewImages.length ? "" : "No preview images are ready yet.",
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          errorText: error.message || "Preview refresh failed.",
        });
      });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  selectPreview(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    if (!this.data.previewImages[index]) return;

    // A rear card first comes to the front. A second tap on the visible card
    // opens that recommendation's deliberately locked report detail.
    if (index !== this.data.currentIndex) {
      this.setData({
        currentIndex: index,
        previewCards: buildPreviewCards(this.data.previewImages, index),
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/report/index?testId=${this.data.testId}&reportId=${this.data.reportId}` +
        `&recommendationIndex=${index}&locked=1`,
    });
  },

  resetPreviewGesture() {
    this.previewTouchStart = null;
    this.setData({
      previewDragging: false,
      previewDragOffset: 0,
      previewDragY: 0,
      previewDragRotation: 0,
    });
  },

  onPreviewTouchStart(e) {
    if (this.data.previewDragging || this.data.previewDragOffset || this.data.previewDragY || this.data.previewDragRotation) {
      this.resetPreviewGesture();
    }
    const point = e.touches && e.touches[0];
    this.previewTouchStart = point ? {
      x: typeof point.clientX === "number" ? point.clientX : point.pageX,
      y: typeof point.clientY === "number" ? point.clientY : point.pageY,
      timestamp: Date.now(),
    } : null;
  },

  onPreviewTouchMove(e) {
    const point = e.touches && e.touches[0];
    if (!point || !this.previewTouchStart) return;
    const x = typeof point.clientX === "number" ? point.clientX : point.pageX;
    const y = typeof point.clientY === "number" ? point.clientY : point.pageY;
    const dx = x - this.previewTouchStart.x;
    const dy = y - this.previewTouchStart.y;
    if (Math.abs(dx) <= Math.abs(dy) * 1.15) return;

    this.setData({
      previewDragging: true,
      previewDragOffset: Math.max(-88, Math.min(88, Math.round(dx * 0.42))),
      previewDragY: Math.round(Math.abs(Math.max(-88, Math.min(88, dx * 0.42))) * 0.2),
      previewDragRotation: Math.max(-10, Math.min(10, Math.round(dx * 0.045))),
    });
  },

  onPreviewTouchEnd(e) {
    const point = e.changedTouches && e.changedTouches[0];
    if (!point || !this.previewTouchStart) {
      this.resetPreviewGesture();
      return;
    }
    const gesture = this.previewTouchStart;
    const x = typeof point.clientX === "number" ? point.clientX : point.pageX;
    const y = typeof point.clientY === "number" ? point.clientY : point.pageY;
    const dx = x - gesture.x;
    const dy = y - gesture.y;
    this.previewTouchStart = null;
    if (Math.abs(dx) <= Math.abs(dy) * 1.15 || !this.data.previewImages.length) {
      this.resetPreviewGesture();
      return;
    }

    const count = this.data.previewImages.length;
    const duration = Math.max(1, Date.now() - gesture.timestamp);
    const velocity = Math.abs(dx) / duration;
    const distanceSteps = Math.round(Math.abs(dx) / 180);
    const momentumSteps = velocity >= 0.65 ? 2 : 1;
    const steps = Math.min(2, velocity >= 0.65 ? momentumSteps : distanceSteps);
    if (!steps) {
      this.resetPreviewGesture();
      return;
    }
    const nextIndex = (this.data.currentIndex + (dx < 0 ? steps : -steps) + count * 2) % count;
    this.setData({
      currentIndex: nextIndex,
      previewCards: buildPreviewCards(this.data.previewImages, nextIndex),
      previewDragging: false,
      previewDragOffset: 0,
      previewDragY: 0,
      previewDragRotation: 0,
      previewMotion: "watermark-scan",
    });
    clearTimeout(this.previewMotionTimer);
    this.previewMotionTimer = setTimeout(() => this.setData({ previewMotion: "" }), 520);
  },

  onPreviewTouchCancel() {
    this.resetPreviewGesture();
  },

  deleteSelfie() {
    if (!this.data.testId) {
      this.setData({
        errorText: "Missing test information. Please generate again.",
      });
      return;
    }

    testService
      .deleteSelfie({
        testId: this.data.testId,
      })
      .then(() => {
        this.setData({
          errorText: "Original selfie deleted. Generated reports stay available.",
        });
      })
      .catch((error) => {
        this.setData({
          errorText: error.message || "Unable to delete the original selfie.",
        });
      });
  },
});
