const { cloud, unsupported } = require("./test-core");
const {
  createSingleTryOn,
  processSingleTryOn,
  getSingleTryOn,
  retrySingleTryOn,
  saveSingleTryOn,
  listMySingleTryOns,
  getLatestTryOnTest,
  uploadSingleSelfie,
  deleteSingleTryOn,
} = require("./single-tryon");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const ACTIONS = {
  createSingleTryOn,
  processSingleTryOn,
  getSingleTryOn,
  retrySingleTryOn,
  saveSingleTryOn,
  listMySingleTryOns,
  getLatestTryOnTest,
  uploadSingleSelfie,
  deleteSingleTryOn,
};

async function main(event, context, deps) {
  const action = event && event.action;
  const handler = ACTIONS[action];
  return handler ? handler(event, deps) : unsupported(action);
}

exports.main = main;
Object.assign(exports, ACTIONS);
