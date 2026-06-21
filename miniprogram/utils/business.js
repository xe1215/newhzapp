const { ERROR_MESSAGES } = require("./errors");

function getQueryValue(query, key) {
  return query && query[key] ? query[key] : "";
}

function unwrapCloudCall(response, fallbackMessage) {
  const result = response && response.result ? response.result : {};

  if (result.code !== 0) {
    throw new Error(
      result.message ||
        ERROR_MESSAGES[result.code] ||
        fallbackMessage ||
        ERROR_MESSAGES.UNKNOWN
    );
  }

  return result.data || {};
}

module.exports = {
  getQueryValue,
  unwrapCloudCall,
};
