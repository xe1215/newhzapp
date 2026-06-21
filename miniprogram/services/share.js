const { callBusinessFunction } = require("./cloud");

function createShareEntry(data) {
  return callBusinessFunction("share", "createShareEntry", data);
}

function trackShareVisit(data) {
  return callBusinessFunction("share", "trackShareVisit", data);
}

function getShareEntry(data) {
  return callBusinessFunction("share", "getShareEntry", data);
}

module.exports = {
  createShareEntry,
  trackShareVisit,
  getShareEntry,
};
