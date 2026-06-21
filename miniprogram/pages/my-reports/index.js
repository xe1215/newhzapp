const reportService = require("../../services/report");
const shareService = require("../../services/share");

Page({
  data: {
    loading: true,
    errorText: "",
    reports: [],
  },

  onShow() {
    this.loadReports();
  },

  loadReports() {
    this.setData({
      loading: true,
      errorText: "",
    });

    reportService
      .listMyReports()
      .then((response) => {
        const result = response.result || {};
        if (result.code !== 0) {
          throw new Error(result.message || "Unable to load reports.");
        }

        this.setData({
          loading: false,
          reports: result.data && Array.isArray(result.data.reports) ? result.data.reports : [],
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          errorText: error.message || "Unable to load reports.",
        });
      });
  },

  viewReport(e) {
    const reportId = e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.reportId
      : "";
    const testId = e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.testId
      : "";

    if (!reportId || !testId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/report/index?testId=${testId}&reportId=${reportId}`,
    });
  },

  hideReport(e) {
    const reportId = e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.reportId
      : "";

    if (!reportId) {
      return;
    }

    reportService
      .hideReport({
        reportId,
      })
      .then(() => {
        this.loadReports();
      })
      .catch((error) => {
        this.setData({
          errorText: error.message || "Unable to hide report.",
        });
      });
  },

  shareReport(e) {
    const reportId = e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.reportId
      : "";

    if (!reportId) {
      return;
    }

    shareService
      .createShareEntry({
        reportId,
        recommendationIndex: 0,
      })
      .then((response) => {
        const result = response.result || {};
        const data = result.data || {};

        if (result.code !== 0 || !data.shareId) {
          throw new Error(result.message || "Unable to create share entry.");
        }

        wx.navigateTo({
          url: `/pages/share/index?shareId=${data.shareId}`,
        });
      })
      .catch((error) => {
        this.setData({
          errorText: error.message || "Unable to create share entry.",
        });
      });
  },
});
