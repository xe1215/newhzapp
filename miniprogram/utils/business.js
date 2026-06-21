const { ERROR_MESSAGES } = require("./errors");

function getQueryValue(query, key) {
  return query && query[key] ? query[key] : "";
}

function shouldMaskTechnicalError(message) {
  if (!message || typeof message !== "string") {
    return false;
  }

  return (
    message.length > 120 ||
    message.includes("cloud.callFunction:fail") ||
    message.includes("functions execute fail") ||
    message.includes("database collection not exists") ||
    message.includes("ResourceNotFound") ||
    message.includes(" at ")
  );
}

function unwrapCloudCall(response, fallbackMessage) {
  const result = response && response.result ? response.result : {};

  if (result.code !== 0) {
    const message =
      result.message && !shouldMaskTechnicalError(result.message)
        ? result.message
        : "";

    throw new Error(
      message ||
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
