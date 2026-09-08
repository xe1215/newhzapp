const paymentService = require("../../services/payment");
const { getQueryValue, unwrapCloudCall } = require("../../utils/business");

Page({
  data: {
    orderId: "",
    testId: "",
    reportId: "",
    confirming: false,
    paymentStatus: "pending",
    canViewReport: false,
    retainOriginalConsent: false,
    feedback: "",
  },

  onLoad(query) {
          this.setData({
      orderId: getQueryValue(query, "orderId"),
      testId: getQueryValue(query, "testId"),
      reportId: getQueryValue(query, "reportId"),
    });
  },

  confirmUnlock() {
    if (!this.data.orderId) {
      this.setData({
        feedback: "Missing order information. Please try paying again.",
      });
      return;
    }

    if (!this.data.retainOriginalConsent) {
      this.setData({ feedback: "请先确认原图保存说明。" });
      return;
    }

    this.setData({
      confirming: true,
      feedback: "",
    });

    paymentService
      .confirmPayment({
        orderId: this.data.orderId,
        retainSelfie: true,
        transactionId: `mock-${Date.now()}`,
      })
      .then((response) => {
        const data = unwrapCloudCall(response, "Payment confirmation failed.");
        this.setData({
          paymentStatus: data.paymentStatus || "paid",
          canViewReport: Boolean(data.canViewReport),
          reportId: data.reportId || this.data.reportId,
            feedback: data.canViewReport
            ? ""
              : "Payment succeeded, but the report is temporarily unavailable. Refund follow-up is required.",
          });
          if (data.canViewReport) {
            wx.removeStorageSync("newhzLatestPreview");
          }
      })
      .catch((error) => {
        this.setData({
          feedback: error.message || "Payment confirmation failed.",
        });
      })
      .finally(() => {
        this.setData({
          confirming: false,
        });
      });
  },

  onRetentionConsentChange(e) {
    const detail = e.detail || {};
    const checked = typeof detail.checked === "boolean"
      ? detail.checked
      : typeof detail.value === "boolean"
        ? detail.value
      : Array.isArray(detail.value)
        ? detail.value.indexOf("retain") !== -1
        : detail.value === "retain";
    this.setData({
      retainOriginalConsent: checked,
      feedback: checked && this.data.feedback === "请先确认原图保存说明。" ? "" : this.data.feedback,
    });
  },

  onRetentionConsentTap() {
    this.setData({
      retainOriginalConsent: true,
      feedback: "",
    });
  },

  viewReport() {
    if (!this.data.canViewReport) {
      this.setData({
        feedback: "Please confirm payment before opening the full report.",
      });
      return;
    }

    if (!this.data.testId || !this.data.reportId) {
      this.setData({
        feedback: "Missing report information. Please return and try again.",
      });
      return;
    }

    wx.redirectTo({
      url: `/pages/report/index?testId=${this.data.testId}&reportId=${this.data.reportId}`,
    });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  requestRefund() {
    if (!this.data.orderId) {
      this.setData({
        feedback: "Missing order information. Please try again later.",
      });
      return;
    }

    paymentService
      .requestRefund({
        orderId: this.data.orderId,
        retainSelfie: true,
        refundReason: this.data.canViewReport
          ? "REPORT_ALREADY_VIEWED"
          : "PAID_BUT_REPORT_UNAVAILABLE",
      })
      .then((response) => {
        const data = unwrapCloudCall(response, "Refund request failed.");
        this.setData({
          feedback:
            data.refundStatus === "requested"
              ? "Refund request submitted. Merchant-side verification will follow in WeChat Pay."
              : "Refund request status updated.",
        });
      })
      .catch((error) => {
        this.setData({
          feedback: error.message || "Refund request failed.",
        });
      });
  },

  openRefundHelp() {
    wx.navigateTo({
      url: `/pages/refund-help/index?orderId=${this.data.orderId}`,
    });
  },
});
