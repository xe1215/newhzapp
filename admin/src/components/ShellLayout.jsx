import React from "react";
import { App as AntApp, Avatar, Breadcrumb, Layout, Menu, Space, Tag, Typography } from "antd";
import { AreaChartOutlined, DatabaseOutlined, FileSearchOutlined, LogoutOutlined, SkinOutlined } from "@ant-design/icons";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getPreviewToken } from "../lib/admin-api";

const { Header, Sider, Content } = Layout;
const icons = { overview: <AreaChartOutlined />, lipsticks: <SkinOutlined />, tests: <DatabaseOutlined />, reports: <FileSearchOutlined />, orders: <DatabaseOutlined />, logs: <FileSearchOutlined /> };

export default function ShellLayout({ shellData, token, onLogout, pageElements }) {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedKey = shellData.modules.find((module) => module.path === location.pathname)?.key || "overview";
  const selectedModule = shellData.modules.find((module) => module.key === selectedKey);
  return (
    <AntApp>
      <Layout className="admin-shell-antd" style={{ minHeight: "100vh" }}>
        <Sider width={232} theme="dark" breakpoint="lg" collapsedWidth={0}>
          <div style={{ height: 96, padding: "24px 20px", color: "#fff" }}>
            <Typography.Text style={{ color: "rgba(255,255,255,.65)", fontSize: 12 }}>开发者后台</Typography.Text>
            <Typography.Title level={4} style={{ color: "#fff", margin: "4px 0 0" }}>newhzapp</Typography.Title>
          </div>
          <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={shellData.modules.map((module) => ({ key: module.key, icon: icons[module.key] || <DatabaseOutlined />, label: module.label, onClick: () => navigate(module.path) }))} />
          <div style={{ position: "absolute", bottom: 20, width: "100%", padding: "0 16px" }}>
            <Menu theme="dark" mode="inline" items={[{ key: "logout", icon: <LogoutOutlined />, label: "退出登录", onClick: onLogout }]} />
          </div>
        </Sider>
        <Layout>
          <Header style={{ height: 64, padding: "0 28px", background: "#fff", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Breadcrumb items={[{ title: "开发者后台" }, { title: selectedModule?.label || "运营仪表盘" }]} />
            <Space><Tag color={token === getPreviewToken() ? "gold" : "blue"}>{token === getPreviewToken() ? "预览模式" : "开发者"}</Tag><Avatar style={{ backgroundColor: "#1677ff" }}>D</Avatar></Space>
          </Header>
          <Content style={{ padding: 24, background: "#f5f7fa" }}>
            <Routes>{pageElements.map((page) => <Route key={page.path} path={page.path} element={page.element} />)}<Route path="*" element={<Navigate to="/overview" replace />} /></Routes>
          </Content>
        </Layout>
      </Layout>
    </AntApp>
  );
}
