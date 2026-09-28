import React from "react";
import OperationalResourcePage from "../components/OperationalResourcePage";
import { getRecommendationSetDetail, listRecommendationSets } from "../lib/admin-api";
import { formatTimestamp } from "../utils/admin-format";

const filters = [{ key: "status", label: "状态" }];
const columns = [
  { key: "setId", label: "推荐集 ID" },
  { key: "name", label: "名称" },
  { key: "status", label: "状态" },
  { key: "productIds", label: "商品 ID", format: (value) => Array.isArray(value) ? value.join("、") : "-" },
  { key: "createdAt", label: "创建时间", format: formatTimestamp },
];
const detailFields = [
  ...columns,
  { key: "recommendations", label: "推荐商品", format: (value) => Array.isArray(value) ? JSON.stringify(value, null, 2) : "-" },
  { key: "updatedAt", label: "更新时间", format: formatTimestamp },
];

export default function RecommendationSetsPage({ token }) {
  return <OperationalResourcePage token={token} title="推荐集" description="查看推荐集状态和商品组合。"
    filters={filters} columns={columns} detailFields={detailFields} idField="setId"
    list={listRecommendationSets} detail={getRecommendationSetDetail} />;
}
