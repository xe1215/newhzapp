const cloud = require("wx-server-sdk");

function ok(data) {
  return {
    code: 0,
    message: "ok",
    data: data || null,
  };
}

function fail(code, message, data) {
  return {
    code: code || -1,
    message: message || "error",
    data: data || null,
  };
}

function unsupported(action) {
  return {
    code: "INVALID_ACTION",
    message: `Unsupported action: ${action || "unknown"}`,
    data: null,
  };
}

function getEventData(event) {
  return (event && event.data) || {};
}

function getOpenId(runtime) {
  return runtime.wxContext && runtime.wxContext.OPENID;
}

function requireOpenId(runtime) {
  const openid = getOpenId(runtime);

  if (!openid) {
    return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  }

  return openid;
}

function buildRuntime(deps, options) {
  const {
    httpRequest,
    downloadUrl,
    applyVisibleWatermark,
    previewWatermarkText,
  } = options;

  return {
    db: deps && deps.db ? deps.db : cloud.database(),
    wxContext: deps && deps.wxContext ? deps.wxContext : cloud.getWXContext(),
    now: deps && deps.now ? deps.now : () => new Date(),
    env: deps && deps.env ? deps.env : process.env,
    durationMs: deps && deps.durationMs ? deps.durationMs : (start) => Date.now() - start,
    sleep:
      deps && deps.sleep
        ? deps.sleep
        : (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    httpRequest: deps && deps.httpRequest ? deps.httpRequest : httpRequest,
    getTempFileURL:
      deps && deps.getTempFileURL
        ? deps.getTempFileURL
        : async (fileID) => {
            const result = await cloud.getTempFileURL({
              fileList: [fileID],
            });
            const file = result.fileList && result.fileList[0];
            return file && (file.tempFileURL || file.download_url || file.url);
          },
    uploadFileFromUrl:
      deps && deps.uploadFileFromUrl
        ? deps.uploadFileFromUrl
        : async ({ url, cloudPath }) => {
            const fileContent = await downloadUrl(url);
            const upload = await cloud.uploadFile({
              cloudPath,
              fileContent,
            });
            return upload.fileID;
          },
    createWatermarkedFile:
      deps && deps.createWatermarkedFile
        ? deps.createWatermarkedFile
        : async ({ sourceFileId, cloudPath, watermarkText }) => {
            const download = await cloud.downloadFile({ fileID: sourceFileId });
            const fileContent = await applyVisibleWatermark(
              download.fileContent,
              watermarkText || previewWatermarkText
            );
            const upload = await cloud.uploadFile({
              cloudPath,
              fileContent,
            });
            return upload.fileID;
          },
    id:
      deps && deps.id
        ? deps.id
        : () => `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    moveFile:
      deps && deps.moveFile
        ? deps.moveFile
        : async ({ from, to }) => {
            const download = await cloud.downloadFile({ fileID: from });
            const upload = await cloud.uploadFile({
              cloudPath: to,
              fileContent: download.fileContent,
            });
            await cloud.deleteFile({ fileList: [from] });
            return upload;
          },
    deleteFile:
      deps && deps.deleteFile
        ? deps.deleteFile
        : async (fileID) => {
            if (!fileID) {
              return;
            }

            await cloud.deleteFile({ fileList: [fileID] });
          },
  };
}

module.exports = {
  cloud,
  ok,
  fail,
  unsupported,
  getEventData,
  getOpenId,
  requireOpenId,
  buildRuntime,
};
