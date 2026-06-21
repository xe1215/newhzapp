const reportService = require("../../services/report");

Page({
  data: {
    testId: "",
    reportId: "",
    loading: true,
    errorText: "",
    paidImages: [],
    recommendations: [],
  },

  onLoad(query) {
    this.setData({
      testId: query && query.testId ? query.testId : "",
      reportId: query && query.reportId ? query.reportId : "",
    });
    this.loadReport();
  },

  loadReport() {
    if (!this.data.testId || !this.data.reportId) {
      this.setData({
        loading: false,
        errorText: "Missing report information.",
      });
      return;
    }

    this.setData({
      loading: true,
      errorText: "",
    });

    reportService
      .getReport({
        testId: this.data.testId,
        reportId: this.data.reportId,
      })
      .then((response) => {
        const result = response.result || {};
        if (result.code !== 0) {
          throw new Error(result.message || "Report is unavailable.");
        }

        const data = result.data || {};
        return this.resolvePaidImages(data).then((paidImages) => ({
          paidImages,
          recommendations:
            data.snapshot && Array.isArray(data.snapshot.recommendations)
              ? data.snapshot.recommendations
              : [],
        }));
      })
      .then((payload) => {
        this.setData({
          loading: false,
          paidImages: payload.paidImages,
          recommendations: payload.recommendations,
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          errorText: error.message || "Report is unavailable.",
        });
      });
  },

  resolvePaidImages(report) {
    const fileIDs = Array.isArray(report.paidImages) ? report.paidImages : [];

    if (!fileIDs.length) {
      return Promise.resolve([]);
    }

    return wx.cloud
      .getTempFileURL({
        fileList: fileIDs,
      })
      .then((res) => {
        const fileList = res.fileList || [];
        return fileIDs.map((fileID, index) => {
          const file = fileList[index] || {};
          return {
            fileID,
            url: file.tempFileURL || file.fileID || fileID,
            title: `Look ${index + 1}`,
          };
        });
      });
  },

  shareCard() {
    wx.navigateTo({ url: "/pages/share/index" });
  },
});
