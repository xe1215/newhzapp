const reportService = require("../../services/report");
const shareService = require("../../services/share");
const { unwrapCloudCall } = require("../../utils/business");
const { resolveCloudFileList } = require("../../utils/media");
const { mapReportPresentation } = require("../../utils/presentation");

function getDatasetValue(event, key) {
  const dataset = event && event.currentTarget ? event.currentTarget.dataset : null;
  return dataset && dataset[key] !== undefined ? dataset[key] : "";
}

function getReportList(result) { return Array.isArray(result.reports) ? result.reports : []; }

function buildRecommendationDeck(recommendations, paidImages, activeIndex) {
  const slots = ["stack-front", "stack-middle", "stack-back"];
  return recommendations.slice(0, 3).map((recommendation, index) => ({
    recommendationIndex: index,
    label: ["A", "B", "C"][index] || String(index + 1),
    active: index === activeIndex,
    stackSlot: slots[(index - activeIndex + 3) % 3],
    coverImage: paidImages[index] && paidImages[index].url ? paidImages[index].url : "",
    shadeName: recommendation.shadeName || recommendation.title || `试色 ${["A", "B", "C"][index]}`,
    shadeCode: recommendation.shadeCode || "",
    brand: recommendation.brand || "专属试色",
    primaryTag: (recommendation.tags || [])[0] || "专属推荐",
  }));
}

Page({
  data: {
    loading: true,
    errorText: "",
    reports: [],
    selectedReport: null,
    displayReports: [],
    deckMotion: "",
    reportFlowIndex: 0,
  },

  onLoad(query) {
    this.selectedTestId = query && query.testId ? query.testId : "";
    this.selectedReportId = query && query.reportId ? query.reportId : "";
  },
  onShow() { this.loadReports(); },
  onHide() { this.stopDeckFlow(); },
  onUnload() { this.stopDeckFlow(); },

  startDeckFlow() {
    this.stopDeckFlow();
    if (this.data.displayReports.length > 1) this.deckFlowTimer = setInterval(() => this.advanceDeck("left"), 4800);
  },
  stopDeckFlow() { clearInterval(this.deckFlowTimer); this.deckFlowTimer = null; },

  openHome() { wx.redirectTo({ url: "/pages/home/index" }); },
  openReports() {},
  openMy() { wx.redirectTo({ url: "/pages/my/index" }); },

  loadReports() {
    this.stopDeckFlow();
    this.setData({ loading: true, errorText: "" });
    reportService.listMyReports()
      .then((response) => {
        const reports = getReportList(unwrapCloudCall(response, "无法加载报告。"));
        const selected = reports.find((item) => item.reportId === this.selectedReportId && item.testId === this.selectedTestId) || reports[0] || null;
        this.setData({ reports, selectedReport: selected });
        if (!selected) return null;
        return reportService.getReport({ testId: selected.testId, reportId: selected.reportId });
      })
      .then((response) => {
        if (!response) {
          this.setData({ loading: false, displayReports: [] });
          return null;
        }
        const report = unwrapCloudCall(response, "无法读取最新报告。 ");
        return resolveCloudFileList(report.paidImages, "Look", (fileList) => wx.cloud.getTempFileURL({ fileList }))
          .then((paidImages) => ({ paidImages, presentation: mapReportPresentation(report, paidImages) }));
      })
      .then((payload) => {
        if (!payload) return;
        const activeIndex = Math.min(this.data.reportFlowIndex, Math.max(0, payload.presentation.recommendations.length - 1));
        this.setData({
          loading: false,
          reportFlowIndex: activeIndex,
          displayReports: buildRecommendationDeck(payload.presentation.recommendations, payload.paidImages, activeIndex),
        }, () => this.startDeckFlow());
      })
      .catch((error) => this.setData({ loading: false, errorText: error.message || "无法加载报告。", displayReports: [] }));
  },

  viewReport(e) {
    const report = this.data.selectedReport;
    const index = Number(getDatasetValue(e, "recommendationIndex") || 0);
    if (!report) return;
    wx.navigateTo({ url: `/pages/report/index?testId=${report.testId}&reportId=${report.reportId}&recommendationIndex=${index}` });
  },

  onDeckTouchStart(e) {
    this.stopDeckFlow();
    const point = e.touches && e.touches[0];
    this.deckStart = point ? { x: point.clientX || point.pageX, y: point.clientY || point.pageY } : null;
  },
  onDeckTouchEnd(e) {
    const point = e.changedTouches && e.changedTouches[0];
    if (!point || !this.deckStart) return;
    const dx = (point.clientX || point.pageX) - this.deckStart.x;
    const dy = (point.clientY || point.pageY) - this.deckStart.y;
    this.deckStart = null;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.15) this.advanceDeck(dx < 0 ? "left" : "right");
    else this.startDeckFlow();
  },
  advanceDeck(direction) {
    const count = this.data.displayReports.length;
    if (this.deckTransitioning || count < 2) return;
    this.deckTransitioning = true;
    const nextIndex = (this.data.reportFlowIndex + (direction === "left" ? 1 : -1) + count) % count;
    this.setData({ deckMotion: `deck-exit-${direction}` });
    this.deckExitTimer = setTimeout(() => {
      const recommendations = this.data.displayReports.map((item) => item);
      this.setData({
        reportFlowIndex: nextIndex,
        displayReports: recommendations.map((item, index) => Object.assign({}, item, {
          active: index === nextIndex,
          stackSlot: ["stack-front", "stack-middle", "stack-back"][(index - nextIndex + count) % count],
        })),
        deckMotion: direction === "left" ? "deck-enter-from-right" : "deck-enter-from-left",
      });
      this.deckMotionTimer = setTimeout(() => {
        this.deckTransitioning = false;
        this.setData({ deckMotion: "" });
        this.startDeckFlow();
      }, 24);
    }, 300);
  },

  hideReport() {
    const report = this.data.selectedReport;
    if (!report) return;
    wx.showModal({ title: "隐藏报告", content: "隐藏后将不再出现在你的报告中。", success: (res) => {
      if (!res.confirm) return;
      reportService.hideReport({ reportId: report.reportId }).then(() => this.loadReports())
        .catch((error) => this.setData({ errorText: error.message || "无法隐藏报告。" }));
    }});
  },
  shareReport() {
    const report = this.data.selectedReport;
    if (!report) return;
    shareService.createShareEntry({ reportId: report.reportId, recommendationIndex: this.data.reportFlowIndex })
      .then((response) => {
        const data = unwrapCloudCall(response, "无法创建分享。 ");
        if (!data.shareId) throw new Error("无法创建分享。 ");
        wx.navigateTo({ url: `/pages/share/index?shareId=${data.shareId}` });
      })
      .catch((error) => this.setData({ errorText: error.message || "无法创建分享。" }));
  },
});
