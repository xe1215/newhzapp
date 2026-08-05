const reportService = require("../../services/report");
const { unwrapCloudCall } = require("../../utils/business");
const { resolveCloudFileList } = require("../../utils/media");

function formatDate(value) {
  if (!value) return "已解锁报告";
  return String(value).replace("T", " ").slice(0, 10);
}

Page({
  data: { loading: true, errorText: "", reports: [] },
  onShow() { this.loadReports(); },
  goBack() { wx.navigateBack({ delta: 1 }); },
  loadReports() {
    this.setData({ loading: true, errorText: "" });
    reportService.listMyReports()
      .then((response) => unwrapCloudCall(response, "无法加载历史报告。"))
      .then((data) => Promise.all((data.reports || []).map((report) => {
        const image = report.coverImage ? resolveCloudFileList([report.coverImage], "Report") : Promise.resolve([]);
        return image.then((images) => Object.assign({}, report, { coverUrl: images[0] && images[0].url ? images[0].url : "", displayDate: formatDate(report.unlockedAt) }));
      })))
      .then((reports) => this.setData({ loading: false, reports }))
      .catch((error) => this.setData({ loading: false, errorText: error.message || "无法加载历史报告。" }));
  },
  openReport(e) {
    const { testId, reportId } = e.currentTarget.dataset;
    if (!testId || !reportId) return;
    wx.navigateTo({ url: `/pages/my-reports/index?testId=${testId}&reportId=${reportId}` });
  },
});
