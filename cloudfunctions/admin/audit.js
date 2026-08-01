const { withCollectionBootstrap } = require("./runtime");
const { clone } = require("./utils");

async function appendAdminAction(runtime, operation, targetType, targetId, before, after) {
  const actionId = runtime.id();
  await withCollectionBootstrap(runtime, "admin_actions", async () => {
    await runtime.db.collection("admin_actions").add({
      data: {
        _id: actionId,
        operation,
        targetType,
        targetId,
        before: before === undefined ? null : clone(before),
        after: after === undefined ? null : clone(after),
        createdAt: runtime.now().toISOString(),
      },
    });
  });
}

module.exports = {
  appendAdminAction,
};
