const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

function ok(data) {
  return {
    code: 0,
    message: "ok",
    data: data || null,
  };
}

function getRuntime(deps) {
  return {
    db: deps && deps.db ? deps.db : cloud.database(),
    now: deps && deps.now ? deps.now : () => new Date(),
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

function isExpired(isoTime, nowMs) {
  if (!isoTime) {
    return false;
  }

  const expiresMs = Date.parse(isoTime);
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}

async function clearExpiredSelfies(runtime, nowIso, nowMs) {
  const result = await runtime.db.collection("try_on_tests").where({}).get();
  const tests = result.data || [];
  let cleanedSelfies = 0;

  for (const test of tests) {
    if (!test.selfieFileId || !isExpired(test.expiresAt, nowMs)) {
      continue;
    }

    await runtime.deleteFile(test.selfieFileId).catch(() => null);
    await runtime.db.collection("try_on_tests").doc(test._id).update({
      data: {
        selfieFileId: "",
        updatedAt: nowIso,
      },
    });
    cleanedSelfies += 1;
  }

  return cleanedSelfies;
}

async function expireUnpaidReports(runtime, nowIso, nowMs) {
  const reportResult = await runtime.db.collection("reports").where({}).get();
  const reports = reportResult.data || [];
  const orderResult = await runtime.db.collection("orders").where({}).get();
  const paidReportIds = new Set(
    (orderResult.data || [])
      .filter((order) => order.status === "paid")
      .map((order) => order.reportId)
      .filter(Boolean)
  );
  let expiredReports = 0;

  for (const report of reports) {
    if (!report._id || report.deletedAt || report.unlockedAt || paidReportIds.has(report._id)) {
      continue;
    }

    if (!isExpired(report.createdAt, nowMs)) {
      continue;
    }

    await runtime.db.collection("reports").doc(report._id).update({
      data: {
        status: "expired",
        updatedAt: nowIso,
      },
    });
    expiredReports += 1;
  }

  return expiredReports;
}

exports.main = async (event, context, deps) => {
  const runtime = getRuntime(deps);
  const now = runtime.now();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const cleanedSelfies = await clearExpiredSelfies(runtime, nowIso, nowMs);
  const expiredReports = await expireUnpaidReports(runtime, nowIso, nowMs);

  return ok({
    cleanedSelfies,
    expiredReports,
  });
};
