const reportService = require("../../services/report");

Page({
  data: {
    testId: "",
    reportId: "",
    loading: true,
    errorText: "",
    previewImages: [],
    recommendations: [],
  },

  onLoad(query) {
    const testId = query && query.testId ? query.testId : "";
    const reportId = query && query.reportId ? query.reportId : "";

    this.setData({
      testId,
      reportId,
    });
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
        const result = response.result || {};
        if (result.code !== 0) {
          throw new Error(result.message || "Preview is not ready.");
        }

        return this.resolvePreviewImages(result.data || {});
      })
      .then(({ previewImages, recommendations }) => {
        this.setData({
          loading: false,
          previewImages,
          recommendations,
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
    const fileIDs = Array.isArray(report.previewImages) ? report.previewImages : [];
    const recommendations = Array.isArray(report.recommendations)
      ? report.recommendations
      : [];

    if (!fileIDs.length) {
      return Promise.resolve({
        previewImages: [],
        recommendations,
      });
    }

    return wx.cloud
      .getTempFileURL({
        fileList: fileIDs,
      })
      .then((res) => {
        const fileList = res.fileList || [];
        return {
          recommendations,
          previewImages: fileIDs.map((fileID, index) => {
            const file = fileList[index] || {};
            return {
              fileID,
              url: file.tempFileURL || file.fileID || fileID,
              recommendation: recommendations[index] || {},
            };
          }),
        };
      });
  },

  unlockReport() {
    wx.navigateTo({ url: "/pages/payment-result/index" });
  },

  regeneratePreview() {
    this.loadPreview();
  },
});
