const { cloud, createRuntime, ok, fail, unsupported, getEventData, getOpenId, requireOpenId } = require("../_shared/business-runtime");

function getRuntime(deps) {
  return createRuntime(deps, {
    uploadFile:
      deps && deps.uploadFile
        ? deps.uploadFile
        : async ({ cloudPath, filePath, fileContent }) => {
            return cloud.uploadFile({
              cloudPath,
              filePath,
              fileContent,
            });
          },
  });
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
