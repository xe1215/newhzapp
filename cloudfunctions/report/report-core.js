const {
  cloud,
  createRuntime,
  ok,
  fail,
  unsupported,
  getEventData,
  getOpenId,
  requireOpenId,
} = require("./business-runtime");

function getRuntime(deps) {
  return createRuntime(deps);
}

module.exports = {
  cloud,
  getRuntime,
  ok,
  fail,
  unsupported,
  getEventData,
  getOpenId,
  requireOpenId,
};
