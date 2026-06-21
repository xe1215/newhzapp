const { callBusinessFunction } = require("./cloud");

function getPreview(data) {
  return callBusinessFunction("report", "getPreview", data);
}

function getReport(data) {
  return callBusinessFunction("report", "getReport", data);
}

function listMyReports() {
  return callBusinessFunction("report", "listMyReports");
}

function hideReport(data) {
  return callBusinessFunction("report", "hideReport", data);
}

module.exports = {
  getPreview,
  getReport,
  listMyReports,
  hideReport,
};
