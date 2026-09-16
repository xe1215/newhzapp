import { buildDetailItem } from "./admin-primitives";
import { formatCurrency, formatTimestamp, renderArrayValue } from "../utils/admin-format";

export function buildTestDetailItems(selectedDetail) {
  if (!selectedDetail) {
    return [];
  }

  return [
    buildDetailItem("测试 ID", selectedDetail.testId),
    buildDetailItem("openid", selectedDetail.openid),
    buildDetailItem("当前报告", selectedDetail.currentReportId),
    buildDetailItem("肤色标签", selectedDetail.preferences ? selectedDetail.preferences.skinTone : ""),
    buildDetailItem("预算", selectedDetail.preferences ? selectedDetail.preferences.budget : ""),
    buildDetailItem("场景", selectedDetail.preferences ? selectedDetail.preferences.scene : ""),
    buildDetailItem("风格", selectedDetail.preferences ? selectedDetail.preferences.style : ""),
    buildDetailItem("安全状态", selectedDetail.statuses ? selectedDetail.statuses.safetyStatus : ""),
    buildDetailItem("质量状态", selectedDetail.statuses ? selectedDetail.statuses.qualityStatus : ""),
    buildDetailItem("生成状态", selectedDetail.statuses ? selectedDetail.statuses.generationStatus : ""),
    buildDetailItem("创建时间", formatTimestamp(selectedDetail.lifecycle ? selectedDetail.lifecycle.createdAt : "")),
    buildDetailItem(
      "偏好提交",
      formatTimestamp(selectedDetail.lifecycle ? selectedDetail.lifecycle.preferenceSubmittedAt : "")
    ),
    buildDetailItem(
      "开始生成",
      formatTimestamp(selectedDetail.lifecycle ? selectedDetail.lifecycle.generationStartedAt : "")
    ),
    buildDetailItem(
      "完成生成",
      formatTimestamp(selectedDetail.lifecycle ? selectedDetail.lifecycle.generationCompletedAt : "")
    ),
    buildDetailItem("报告完成", formatTimestamp(selectedDetail.lifecycle ? selectedDetail.lifecycle.reportReadyAt : "")),
  ];
}

export function buildReportDetailItems(selectedDetail) {
  if (!selectedDetail) {
    return [];
  }

  return [
    buildDetailItem("报告 ID", selectedDetail.reportId),
    buildDetailItem("openid", selectedDetail.openid),
    buildDetailItem("测试 ID", selectedDetail.testId),
    buildDetailItem("状态", selectedDetail.status),
    buildDetailItem(
      "解锁时间",
      selectedDetail.unlock && selectedDetail.unlock.unlocked ? selectedDetail.unlock.unlockedAt : "未解锁"
    ),
    buildDetailItem("预览图", renderArrayValue(selectedDetail.assets ? selectedDetail.assets.previewImages : [])),
    buildDetailItem("正式图", renderArrayValue(selectedDetail.assets ? selectedDetail.assets.paidImages : [])),
    buildDetailItem("分享卡图", renderArrayValue(selectedDetail.assets ? selectedDetail.assets.shareCardImages : [])),
    buildDetailItem(
      "推荐快照",
      JSON.stringify(selectedDetail.snapshot ? selectedDetail.snapshot.recommendations || [] : [], null, 2)
    ),
    buildDetailItem("隐藏时间", selectedDetail.audit ? selectedDetail.audit.hiddenAt : ""),
    buildDetailItem("异常标记", selectedDetail.audit ? selectedDetail.audit.flaggedAt : ""),
  ];
}

export function buildOrderDetailItems(selectedDetail) {
  if (!selectedDetail) {
    return [];
  }

  return [
    buildDetailItem("订单 ID", selectedDetail.orderId),
    buildDetailItem("openid", selectedDetail.openid),
    buildDetailItem("支付状态", selectedDetail.status),
    buildDetailItem("退款状态", selectedDetail.refundStatus),
    buildDetailItem("交易号", selectedDetail.transactionId),
    buildDetailItem("商户单号", selectedDetail.outTradeNo),
    buildDetailItem("金额", formatCurrency(selectedDetail.amountCents)),
    buildDetailItem("支付时间", formatTimestamp(selectedDetail.paidAt)),
    buildDetailItem("关联测试", selectedDetail.testId),
    buildDetailItem("关联报告", selectedDetail.reportId),
  ];
}

export function buildRunDetailItems(selectedRun) {
  if (!selectedRun) {
    return [];
  }

  return [
    buildDetailItem("运行 ID", selectedRun.runId),
    buildDetailItem("服务商", selectedRun.provider),
    buildDetailItem("状态", selectedRun.status),
    buildDetailItem("错误码", selectedRun.errorCode),
    buildDetailItem("错误信息", selectedRun.errorMessage),
    buildDetailItem("耗时", selectedRun.durationMs ? `${selectedRun.durationMs}ms` : ""),
    buildDetailItem("原图文件", selectedRun.originalImageFileId),
    buildDetailItem("水印图文件", selectedRun.watermarkedImageFileId),
    buildDetailItem("关联测试", selectedRun.testId),
    buildDetailItem("关联报告", selectedRun.reportId),
    buildDetailItem("openid", selectedRun.openid),
  ];
}

export function buildEventDetailItems(selectedEvent) {
  if (!selectedEvent) {
    return [];
  }

  return [
    buildDetailItem("事件 ID", selectedEvent.eventId),
    buildDetailItem("事件名", selectedEvent.eventName),
    buildDetailItem("openid", selectedEvent.openid),
    buildDetailItem("测试 ID", selectedEvent.testId),
    buildDetailItem("报告 ID", selectedEvent.reportId),
    buildDetailItem("订单 ID", selectedEvent.orderId),
    buildDetailItem("分享 ID", selectedEvent.shareId),
  ];
}
