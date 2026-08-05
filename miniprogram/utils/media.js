function getTempFileURLs(fileList) {
  return wx.cloud.getTempFileURL({
    fileList,
  });
}

function resolveCloudFileList(fileIDs, titlePrefix, resolver) {
  const normalizedFileIDs = Array.isArray(fileIDs) ? fileIDs.filter(Boolean) : [];

  if (!normalizedFileIDs.length) {
    return Promise.resolve([]);
  }

  const resolveTempUrls = resolver || getTempFileURLs;

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

function resolveCloudFile(fileID, resolver) {
  if (!fileID) {
    return Promise.resolve("");
  }

  const resolveTempUrls = resolver || getTempFileURLs;
  return resolveTempUrls([fileID])
    .then((res) =>
      res.fileList && res.fileList[0]
        ? res.fileList[0].tempFileURL || ""
        : ""
    )
    .catch(() => "");
}

function resolveMediaSource(source, resolver) {
  if (!source) {
    return Promise.resolve("");
  }
  if (source.indexOf("cloud://") !== 0) {
    return Promise.resolve(source);
  }
  return resolveCloudFile(source, resolver);
}

module.exports = {
  resolveCloudFile,
  resolveCloudFileList,
  resolveMediaSource,
};
