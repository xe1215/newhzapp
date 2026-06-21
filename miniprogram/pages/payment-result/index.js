const paymentService = require("../../services/payment");
const { getQueryValue, unwrapCloudCall } = require("../../utils/business");

Page({
  data: {
    orderId: "",
    testId: "",
    reportId: "",
    confirming: false,
    paymentStatus: "pending",
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

    this.setData({
      confirming: true,
      feedback: "",
    });

    paymentService
      .confirmPayment({
        orderId: this.data.orderId,
        transactionId: `mock-${Date.now()}`,
      })
      .then((response) => {
        const data = unwrapCloudCall(response, "Payment confirmation failed.");
        this.setData({
          paymentStatus: data.paymentStatus || "paid",
          reportId: data.reportId || this.data.reportId,
          feedback: data.canViewReport
            ? ""
            : "Payment succeeded, but the report is temporarily unavailable. Refund follow-up is required.",
        });
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

  viewReport() {
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
});
