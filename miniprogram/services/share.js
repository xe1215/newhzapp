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

function loadShareLanding(data) {
  return callBusinessFunction("share", "loadShareLanding", data);
}

module.exports = {
  createShareEntry,
  trackShareVisit,
  getShareEntry,
  loadShareLanding,
};
