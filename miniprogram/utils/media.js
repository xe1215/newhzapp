function resolveCloudFileList(fileIDs, titlePrefix, resolver) {
  const normalizedFileIDs = Array.isArray(fileIDs) ? fileIDs.filter(Boolean) : [];

  if (!normalizedFileIDs.length) {
    return Promise.resolve([]);
  }

  const resolveTempUrls =
    resolver ||
    ((fileList) =>
      wx.cloud.getTempFileURL({
        fileList,
      }));

  return resolveTempUrls(normalizedFileIDs)
    .then((res) => {
      const fileList = res.fileList || [];
      return normalizedFileIDs.map((fileID, index) => {
        const file = fileList[index] || {};
        return {
          fileID,
          url: file.tempFileURL || file.fileID || fileID,
          title: `${titlePrefix || "Item"} ${index + 1}`,
        };
      });
    });
}

module.exports = {
  resolveCloudFileList,
};
