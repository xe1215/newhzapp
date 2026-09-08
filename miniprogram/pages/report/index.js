const reportService = require("../../services/report");
const paymentService = require("../../services/payment");
const shareService = require("../../services/share");
const testService = require("../../services/test");
const { getQueryValue, unwrapCloudCall } = require("../../utils/business");
const {
  resolveCloudFile,
  resolveCloudFileList,
  resolveMediaSource,
} = require("../../utils/media");
const { mapReportPresentation } = require("../../utils/presentation");

function getDatasetValue(event, key) {
  const dataset = event && event.currentTarget ? event.currentTarget.dataset : null;
  return dataset && dataset[key] !== undefined ? dataset[key] : "";
}

function wrapCopyLine(label, value) {
  return value ? `${label}: ${value}` : "";
}

function buildLockedRecommendations(images) {
  return [0, 1, 2].map((index) => ({
    rank: index + 1,
    title: `试色 ${["A", "B", "C"][index]}`,
    previewImage: images[index] && images[index].url ? images[index].url : "",
    colorHex: "#C98A83",
  }));
}

Page({
  data: {
    testId: "",
    reportId: "",
    loading: true,
    errorText: "",
    isLocked: false,
    unlocking: false,
    previewImages: [],
    paidImages: [],
    recommendations: [],
    sharingIndex: -1,
    activeIndex: 0,
    presentation: null,
    activeRecommendation: null,
    originalImage: "",
    originalDeletedByUser: false,
    sliderPercent: 50,
    resultClipStyle: "clip-path: inset(0 0 0 50%);",
    sheetState: "peek",
    sheetDrag: 250,
    sheetDragging: false,
    lockedSheetState: "peek",
    lockedSheetDragging: false,
    lockedSheetOffset: 0,
    detailSection: "color",
    tabLabels: ["A", "B", "C"],
  },

  goBack() { wx.navigateBack({ delta: 1 }); },

  selectRecommendation(e) {
    const index = Number(getDatasetValue(e, "index") || 0);
    if (index === this.data.activeIndex) return;
    const lockedQuery = this.data.isLocked ? "&locked=1" : "";
    wx.redirectTo({
      url: `/pages/report/index?testId=${this.data.testId}&reportId=${this.data.reportId}` +
        `&recommendationIndex=${index}${lockedQuery}`,
    });
  },

  selectDetailSection(e) {
    const section = getDatasetValue(e, "section");
    if (["color", "scene", "outfit"].indexOf(section) === -1) return;
    this.setData({ detailSection: section }, () => {
    });
  },

  onLoad(query) {
    this.setData({
      testId: getQueryValue(query, "testId"),
      reportId: getQueryValue(query, "reportId"),
      activeIndex: Math.max(0, Math.min(2, Number(getQueryValue(query, "recommendationIndex") || 0))),
      isLocked: getQueryValue(query, "locked") === "1",
    });
    this.loadReport();
  },

  loadReport() {
    if (!this.data.testId || !this.data.reportId) {
      this.setData({ loading: false, errorText: "缺少报告信息。" });
      return;
    }
    this.setData({ loading: true, errorText: "" });
    if (this.data.isLocked) {
      this.loadLockedPreview();
      return;
    }
    reportService.getReport({ testId: this.data.testId, reportId: this.data.reportId })
      .then((response) => {
        const data = unwrapCloudCall(response, "报告暂不可用。");
        return Promise.all([this.resolvePaidImages(data), this.resolveOriginalImage(data)])
          .then(([paidImages, originalImage]) => {
            const presentation = mapReportPresentation(data, paidImages);
            return Promise.all(presentation.recommendations.map((item) => this.resolveProductImage(item.productImage)))
              .then((productImages) => ({
                paidImages,
                originalImage,
                originalDeletedAt: data.originalDeletedAt || "",
                presentation: Object.assign({}, presentation, {
                  recommendations: presentation.recommendations.map((item, index) => Object.assign({}, item, {
                    productImageUrl: productImages[index],
                  })),
                }),
              }));
          });
      })
      .then((payload) => {
        const recommendations = payload.presentation.recommendations;
        const activeIndex = Math.min(this.data.activeIndex, Math.max(0, recommendations.length - 1));
        this.setData({
          loading: false,
          paidImages: payload.paidImages,
          recommendations,
          presentation: payload.presentation,
          originalImage: payload.originalImage,
          originalDeletedByUser: Boolean(payload.originalDeletedAt),
          activeIndex,
          activeRecommendation: recommendations[activeIndex] || null,
        });
      })
      .catch((error) => this.setData({ loading: false, errorText: error.message || "报告暂不可用。" }));
  },

  loadLockedPreview() {
    reportService.getPreview({ testId: this.data.testId, reportId: this.data.reportId })
      .then((response) => unwrapCloudCall(response, "试色预览暂不可用。"))
      .then((data) => this.resolvePreviewImages(data))
      .then((previewImages) => {
        const recommendations = buildLockedRecommendations(previewImages);
        const activeIndex = Math.min(this.data.activeIndex, Math.max(0, previewImages.length - 1));
        this.setData({
          loading: false,
          previewImages,
          recommendations,
          activeIndex,
          activeRecommendation: recommendations[activeIndex],
          errorText: previewImages.length ? "" : "试色预览暂未生成，请稍后重试。",
        });
      })
      .catch((error) => this.setData({ loading: false, errorText: error.message || "试色预览暂不可用。" }));
  },

  onLockedSheetTouchStart(e) {
    const touch = e.touches && e.touches[0];
    this.lockedSheetStartY = touch ? touch.clientY : 0;
    this.setData({ lockedSheetDragging: true, lockedSheetOffset: 0 });
  },

  onLockedSheetTouchMove(e) {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const delta = touch.clientY - this.lockedSheetStartY;
    this.setData({ lockedSheetOffset: Math.max(-72, Math.min(72, Math.round(delta * 0.35))) });
  },

  onLockedSheetTouchEnd(e) {
    const touch = e.changedTouches && e.changedTouches[0];
    const endY = touch ? touch.clientY : this.lockedSheetStartY;
    const delta = endY - this.lockedSheetStartY;
    const nextState = this.data.lockedSheetState === "expanded"
      ? (delta > 70 ? "peek" : "expanded")
      : (delta < -70 ? "expanded" : "peek");
    this.setData({ lockedSheetState: nextState, lockedSheetDragging: false, lockedSheetOffset: 0 });
  },

  onLockedSheetTouchCancel() {
    this.setData({ lockedSheetDragging: false, lockedSheetOffset: 0 });
  },

  resolvePaidImages(report) {
    return resolveCloudFileList(report.paidImages, "Look");
  },

  resolvePreviewImages(report) {
    return resolveCloudFileList(report.previewImages, "Look");
  },

  resolveOriginalImage(report) {
    const fileId = report.originalImage || report.originalImageFileId || report.selfieFileId || "";
    return resolveCloudFile(fileId);
  },

  resolveProductImage(source) {
    return resolveMediaSource(source);
  },

  unlockReport() {
    if (this.data.unlocking) return;
    this.setData({ unlocking: true, errorText: "" });
    paymentService.createReportOrder({ testId: this.data.testId })
      .then((response) => {
        const order = unwrapCloudCall(response, "无法创建支付订单。");
        wx.navigateTo({
          url: `/pages/payment-result/index?orderId=${order.orderId}&testId=${this.data.testId}` +
            `&reportId=${order.reportId || this.data.reportId}`,
        });
      })
      .catch((error) => this.setData({ errorText: error.message || "无法创建支付订单。" }))
      .finally(() => this.setData({ unlocking: false }));
  },

  deleteOriginalSelfie() {
    if (!this.data.testId || this.data.originalDeletedByUser) return;
    wx.showModal({
      title: "删除原图",
      content: "删除后将无法恢复，报告中的高清试色图会保留。",
      confirmColor: "#9f5d59",
      success: (res) => {
        if (!res.confirm) return;
        testService.deleteSelfie({ testId: this.data.testId, reportId: this.data.reportId })
          .then(() => this.setData({
            originalImage: "",
            originalDeletedByUser: true,
            errorText: "原图已删除，报告试色图仍可查看。",
          }))
          .catch((error) => this.setData({ errorText: error.message || "无法删除原图。" }));
      },
    });
  },

  onSliderTouchStart() {
    if (this.data.sheetState === "expanded" || this.data.isLocked || this.data.originalDeletedByUser) return;
    wx.createSelectorQuery().in(this).select(".comparison-stage")
      .boundingClientRect((rect) => { this.sliderRect = rect; }).exec();
  },

  onSliderTouchMove(e) {
    if (this.data.sheetState === "expanded" || this.data.isLocked || this.data.originalDeletedByUser) return;
    const touch = e.touches && e.touches[0];
    if (!touch || !this.sliderRect) return;
    const percent = Math.max(0, Math.min(100, ((touch.clientX - this.sliderRect.left) / this.sliderRect.width) * 100));
    const sliderPercent = Math.round(percent);
    this.setData({
      sliderPercent,
      resultClipStyle: `clip-path: inset(0 0 0 ${sliderPercent}%);`,
    });
  },

  onSheetTouchStart(e) {
    this.sheetStartY = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
    this.setData({ sheetDragging: true });
  },
  onSheetTouchMove(e) {
    if (this.data.isLocked) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const expanded = this.data.sheetState === "expanded";
    const base = expanded ? 0 : 250;
    const sheetDrag = Math.max(0, Math.min(360, base + touch.clientY - this.sheetStartY));
    this.setData({ sheetDrag });
  },
  onSheetTouchEnd(e) {
    if (this.data.isLocked) return;
    const endY = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : this.sheetStartY;
    const delta = endY - this.sheetStartY;
    const nextState = this.data.sheetState === "expanded" ? (delta > 80 ? "peek" : "expanded") : (delta < -80 ? "expanded" : "peek");
    this.setData({
      sheetState: nextState,
      sheetDrag: nextState === "expanded" ? 0 : 250,
      sheetDragging: false,
    });
  },

  createShareCard(recommendationIndex) {
    const recommendation = this.data.recommendations[recommendationIndex];
    if (!recommendation) return Promise.reject(new Error("当前推荐不可用。"));
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().select("#share-card-canvas").fields({ node: true, size: true }).exec((res) => {
        const canvasNode = res && res[0];
        if (!canvasNode || !canvasNode.node) { reject(new Error("无法准备分享卡片。")); return; }
        const canvas = canvasNode.node;
        const ctx = canvas.getContext("2d");
        canvas.width = 900; canvas.height = 1200;
        ctx.fillStyle = "#fff8fa"; ctx.fillRect(0, 0, 900, 1200);
        ctx.fillStyle = "#24191d"; ctx.font = "bold 54px sans-serif"; ctx.fillText("Lip Result Card", 72, 130);
        ctx.fillStyle = "#b72957"; ctx.font = "bold 72px sans-serif";
        ctx.fillText(`${recommendation.shadeName || ""} ${recommendation.shadeCode || ""}`.trim(), 72, 260);
        ctx.fillStyle = "#6d5960"; ctx.font = "36px sans-serif";
        [recommendation.brand, recommendation.colorHex, recommendation.recommendationReason,
          wrapCopyLine("Caution", recommendation.cautionNote), wrapCopyLine("Substitute", recommendation.substitute)]
          .filter(Boolean).forEach((line, index) => ctx.fillText(line, 72, 360 + index * 72, 756));
        wx.canvasToTempFilePath({ canvas, width: 900, height: 1200, destWidth: 900, destHeight: 1200,
          success: (result) => resolve(result.tempFilePath), fail: () => reject(new Error("无法导出分享卡片。")) }, this);
      });
    });
  },

  saveCardToAlbum(e) {
    const index = Number(getDatasetValue(e, "recommendationIndex") || 0);
    this.createShareCard(index).then((filePath) => new Promise((resolve, reject) => wx.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject })))
      .then(() => this.setData({ errorText: "报告图片已保存到相册。" }))
      .catch((error) => this.setData({ errorText: error.message || "无法保存报告图片。" }));
  },

  shareCard(e) {
    const index = Number(getDatasetValue(e, "recommendationIndex") || 0);
    if (this.data.isLocked) return;
    this.setData({ sharingIndex: index, errorText: "" });
    this.createShareCard(index).then((tempFilePath) => shareService.createShareEntry({ reportId: this.data.reportId, recommendationIndex: index, shareCardTempFilePath: tempFilePath }))
      .then((response) => {
        const data = unwrapCloudCall(response, "无法创建分享。 ");
        if (!data.shareId) throw new Error("无法创建分享。 ");
        wx.navigateTo({ url: `/pages/share/index?shareId=${data.shareId}` });
      })
      .catch((error) => this.setData({ errorText: error.message || "无法创建分享。" }))
      .finally(() => this.setData({ sharingIndex: -1 }));
  },
});
