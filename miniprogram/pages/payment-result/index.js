const paymentService = require("../../services/payment");

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
      orderId: query && query.orderId ? query.orderId : "",
      testId: query && query.testId ? query.testId : "",
      reportId: query && query.reportId ? query.reportId : "",
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
        const result = response.result || {};
        if (result.code !== 0) {
          throw new Error(result.message || "Payment confirmation failed.");
        }

        const data = result.data || {};
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
