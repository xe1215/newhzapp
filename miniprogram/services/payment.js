const { callBusinessFunction } = require("./cloud");

function createReportOrder(data) {
  return callBusinessFunction("payment", "createReportOrder", data);
}

function confirmPayment(data) {
  return callBusinessFunction("payment", "confirmPayment", data);
}

function requestRefund(data) {
  return callBusinessFunction("payment", "requestRefund", data);
}

module.exports = {
  createReportOrder,
  confirmPayment,
  requestRefund,
};
