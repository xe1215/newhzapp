import React from "react";
import OperationalResourcePage from "../components/OperationalResourcePage";
import { getSingleTryOnDetail, listSingleTryOns } from "../lib/admin-api";
import { formatTimestamp } from "../utils/admin-format";

const filters = [
  { key: "openid", label: "openid" }, { key: "status", label: "任务状态" },
  { key: "testId", label: "测试 ID" }, { key: "productId", label: "商品 ID" },
  { key: "errorCode", label: "错误码" },
  { key: "startDate", label: "开始日期", placeholder: "YYYY-MM-DD" },
  { key: "endDate", label: "结束日期", placeholder: "YYYY-MM-DD" },
];
const columns = [
  { key: "jobId", label: "任务 ID" }, { key: "openidMasked", label: "openid" },
  { key: "productId", label: "商品 ID" }, { key: "status", label: "状态" },
  { key: "errorCode", label: "错误码" },
  { key: "createdAt", label: "创建时间", format: formatTimestamp },
];
const detailFields = [
  ...columns, { key: "testId", label: "测试 ID" },
  { key: "errorMessage", label: "错误信息" },
  { key: "resultImage", label: "结果图" },
  { key: "updatedAt", label: "更新时间", format: formatTimestamp },
];

export default function SingleTryOnsPage({ token }) {
  return <OperationalResourcePage token={token} title="单支任务" description="查看单支试色任务状态、结果和失败原因。"
    filters={filters} columns={columns} detailFields={detailFields} idField="jobId"
    list={listSingleTryOns} detail={getSingleTryOnDetail} />;
}
