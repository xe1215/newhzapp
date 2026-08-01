const crypto = require("crypto");
const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

function getRuntime(deps) {
  return {
    db: deps && deps.db ? deps.db : cloud.database(),
    env: deps && deps.env ? deps.env : process.env,
    now: deps && deps.now ? deps.now : () => new Date(),
    id:
      deps && deps.id
        ? deps.id
        : () => crypto.randomBytes(12).toString("hex"),
    randomBytes:
      deps && deps.randomBytes
        ? deps.randomBytes
        : (size) => crypto.randomBytes(size),
  };
}

function isMissingCollectionError(error) {
  const message = String((error && error.message) || "");
  return message.includes("database collection not exists") || message.includes("Db or Table not exist");
}

async function ensureCollection(runtime, name) {
  const collection = runtime.db.collection(name);

  if (typeof collection.createCollection === "function") {
    await collection.createCollection();
    return;
  }

  throw new Error(`Admin collection "${name}" is missing and cannot be created automatically`);
}

async function withCollectionBootstrap(runtime, name, operation) {
  try {
    return await operation();
  } catch (error) {
    if (!isMissingCollectionError(error)) {
      throw error;
    }

    await ensureCollection(runtime, name);
    return operation();
  }
}

function getEventData(event) {
  return (event && event.data) || {};
}

module.exports = {
  getRuntime,
  withCollectionBootstrap,
  getEventData,
};
