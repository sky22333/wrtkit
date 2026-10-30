import { Alert, Descriptions, Space, Typography } from "antd";
import type { Build, Environment } from "./types";
const { Title } = Typography;
type Props = {
  draft: Build;
  additionalCount: number;
  wirelessSupported: boolean;
  pppSupported: boolean;
  env: Environment | null;
};
export function ReviewStep({
  draft,
  additionalCount,
  wirelessSupported,
  pppSupported,
  env,
}: Props) {
  return (
    <Space orientation="vertical" size="middle" className="full">
      <Title level={4}>确认构建</Title>
      <Descriptions
        bordered
        size="small"
        column={1}
        items={[
          {
            key: "device",
            label: "设备",
            children: draft.device,
          },
          {
            key: "target",
            label: "目标平台",
            children: `${draft.target} / ${draft.profile}`,
          },
          {
            key: "version",
            label: "系统版本",
            children: draft.version,
          },
          {
            key: "packages",
            label: "软件包",
            children: `新增 ${additionalCount} 项，移除 ${draft.remove.length} 项`,
          },
          {
            key: "theme",
            label: "LuCI 主题",
            children: draft.theme || "固件默认",
          },
          {
            key: "rootfs",
            label: "根分区",
            children: draft.rootfs_size
              ? `${draft.rootfs_size} MiB`
              : "固件默认",
          },
          ...(wirelessSupported
            ? [
                {
                  key: "wifi",
                  label: "无线网络",
                  children: draft.wifi_ssid || "默认",
                },
              ]
            : []),
          ...(pppSupported
            ? [
                {
                  key: "ppp",
                  label: "PPPoE",
                  children: draft.ppp_username ? "已配置" : "默认",
                },
              ]
            : []),
          {
            key: "address",
            label: "管理地址",
            children: draft.address || "默认",
          },
          {
            key: "script",
            label: "初始化脚本",
            children: draft.script ? "已填写" : "未填写",
          },
          {
            key: "mirror",
            label: "构建及固件默认软件源",
            children: draft.mirror,
          },
        ]}
      />
      {draft.mirror === "https://downloads.immortalwrt.org" && (
        <Alert
          type="warning"
          showIcon
          title="当前选择的是 ImmortalWrt 官方服务器"
        />
      )}
      {!env?.available && (
        <Alert type="warning" showIcon title="构建环境不可用，请先检查。" />
      )}
    </Space>
  );
}
