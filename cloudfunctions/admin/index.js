const { fail, unsupported } = require("./response");
const { login, logout } = require("./session");
const { getShell } = require("./shell");
const {
  exportLipsticksCsv,
  importLipsticksCsv,
  listLipsticks,
  saveLipstick,
  setLipstickStatus,
} = require("./lipsticks");
const {
  exportEventsCsv,
  getEventDetail,
  getProviderRunDetail,
  listEvents,
  listProviderRuns,
} = require("./records");
const operations = require("./operations");

const ACTIONS = {
  login,
  logout,
  getShell,
  listLipsticks,
  saveLipstick,
  setLipstickStatus,
  importLipsticksCsv,
  exportLipsticksCsv,
  listProviderRuns,
  getProviderRunDetail,
  listEvents,
  getEventDetail,
  exportEventsCsv,
  ...operations,
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
