const paymentService = require("../../services/payment");
const { getQueryValue, unwrapCloudCall } = require("../../utils/business");

Page({
  data: {
    orderId: "",
    feedback: "",
    submitting: false,
  },

  onLoad(query) {
    this.setData({
      orderId: getQueryValue(query, "orderId"),
    });
  },

  requestRefund() {
    if (!this.data.orderId) {
      this.setData({
        feedback: "Missing order information.",
      });
      return;
    }

    this.setData({
      submitting: true,
      feedback: "",
    });

    paymentService
      .requestRefund({
        orderId: this.data.orderId,
        refundReason: "PAID_BUT_REPORT_UNAVAILABLE",
      })
      .then((response) => {
        const data = unwrapCloudCall(response, "Refund request failed.");
        this.setData({
          feedback:
            data.refundStatus === "requested"
              ? "Refund request submitted. Final payout is handled in the WeChat Pay merchant console."
              : "Refund status updated.",
        });
      })
      .catch((error) => {
        this.setData({
          feedback: error.message || "Refund request failed.",
        });
      })
      .finally(() => {
        this.setData({
          submitting: false,
        });
      });
  },
});
