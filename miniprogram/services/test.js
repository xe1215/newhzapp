const { callBusinessFunction } = require("./cloud");

function createSingleTryOn(data) {
  return callBusinessFunction("test", "createSingleTryOn", data);
}

function uploadSingleSelfie(data) {
  return callBusinessFunction('test', 'uploadSingleSelfie', data);
}

function processSingleTryOn(data) {
  return callBusinessFunction("test", "processSingleTryOn", data);
}

function getSingleTryOn(data) {
  return callBusinessFunction("test", "getSingleTryOn", data);
}

function retrySingleTryOn(data) {
  return callBusinessFunction("test", "retrySingleTryOn", data);
}

function saveSingleTryOn(data) {
  return callBusinessFunction("test", "saveSingleTryOn", data);
}

function listMySingleTryOns(data) {
  return callBusinessFunction("test", "listMySingleTryOns", data);
}

function deleteSingleTryOn(data) {
  return callBusinessFunction("test", "deleteSingleTryOn", data);
}

function getLatestTryOnTest(data) {
  if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.callFunction !== 'function') return Promise.resolve(null);
  return callBusinessFunction('test', 'getLatestTryOnTest', data || {}).then((value) => {
    const result = value && value.result ? value.result : value;
    if (!result || result.code !== 0) throw Object.assign(new Error('SELFIE_LOOKUP_FAILED'), {code:result && result.code});
    return result && result.data && result.data.test ? result.data.test : null;
  });
}

module.exports = {
  createSingleTryOn,
  uploadSingleSelfie,
  processSingleTryOn,
  getSingleTryOn,
  retrySingleTryOn,
  saveSingleTryOn,
  listMySingleTryOns,
  deleteSingleTryOn,
  getLatestTryOnTest,
};
