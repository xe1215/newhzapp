const { fail, unsupported } = require("./response");
const { login, logout } = require("./session");
const { getShell } = require("./shell");
const { getOverview } = require("./overview");
const {
  exportLipsticksCsv,
  importLipsticksCsv,
  listLipsticks,
  saveLipstick,
  setLipstickStatus,
} = require("./lipsticks");
const {
  exportEventsCsv,
  flagReport,
  getEventDetail,
  getOrderDetail,
  getProviderRunDetail,
  getReportDetail,
  getTestDetail,
  listEvents,
  listOrders,
  listProviderRuns,
  listReports,
  listTests,
  updateOrderRefundHandling,
} = require("./records");

const ACTIONS = {
  login,
  logout,
  getShell,
  getOverview,
  listLipsticks,
  saveLipstick,
  setLipstickStatus,
  importLipsticksCsv,
  exportLipsticksCsv,
  listTests,
  getTestDetail,
  listReports,
  getReportDetail,
  listOrders,
  getOrderDetail,
  listProviderRuns,
  getProviderRunDetail,
  listEvents,
  getEventDetail,
  exportEventsCsv,
  updateOrderRefundHandling,
  flagReport,
};

async function main(event, context, deps) {
  const action = event && event.action;
  const handler = ACTIONS[action];

  try {
    if (!handler) {
      return unsupported(action);
    }

    return await handler(event, deps);
  } catch (error) {
    return fail("ADMIN_FUNCTION_ERROR", error.message);
  }
}

exports.main = main;
Object.assign(exports, ACTIONS);
