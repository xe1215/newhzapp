const { cloud, createRuntime, ok, fail, unsupported } = require("../_shared/business-runtime");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

function getRuntime(deps) {
  return createRuntime(deps);
}

async function silentLogin(deps) {
  const runtime = getRuntime(deps);
  const wxContext = runtime.wxContext || {};
  const openid = wxContext.OPENID;

  if (!openid) {
    return fail("LOGIN_REQUIRED", "OPENID is missing from WeChat context");
  }

  const now = runtime.now().toISOString();
  const users = runtime.db.collection("users");
  const existing = await users.where({ openid }).get();
  const existingUser = existing.data && existing.data[0];

  if (existingUser) {
    await users.where({ openid }).update({
      data: {
        lastSeenAt: now,
        appid: wxContext.APPID || "",
        unionid: wxContext.UNIONID || "",
      },
    });
  } else {
    await users.add({
      data: {
        openid,
        appid: wxContext.APPID || "",
        unionid: wxContext.UNIONID || "",
        createdAt: now,
        lastSeenAt: now,
      },
    });
  }

  return ok({
    openid,
    appid: wxContext.APPID || "",
    unionid: wxContext.UNIONID || "",
    isNewUser: !existingUser,
  });
}

async function main(event, context, deps) {
  const action = event && event.action ? event.action : "silentLogin";

  try {
    if (action === "silentLogin") {
      return await silentLogin(deps);
    }

    return unsupported(action);
  } catch (error) {
    return fail("USER_FUNCTION_ERROR", error.message);
  }
}

exports.main = main;
exports.silentLogin = silentLogin;
