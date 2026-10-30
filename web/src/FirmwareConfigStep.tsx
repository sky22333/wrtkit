import {
  Collapse,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
} from "antd";
import type { Build, Profile } from "./types";
import { CodeOutlined } from "@ant-design/icons";
const { Title, Text } = Typography;
type Props = {
  draft: Build;
  patch: (value: Partial<Build>) => void;
  profile: Profile | null;
  wirelessSupported: boolean;
  pppSupported: boolean;
};
export function FirmwareConfigStep({
  draft,
  patch,
  profile,
  wirelessSupported,
  pppSupported,
}: Props) {
  return (
    <Space orientation="vertical" size="middle" className="full">
      <div>
        <Title level={4}>配置固件</Title>
        <Text type="secondary">留空时使用固件默认配置。</Text>
      </div>
      <Form layout="vertical" className="quick-form">
        <Form.Item label="主机名">
          <Input
            value={draft.hostname}
            placeholder="例如 WrtKit"
            onChange={(e) => patch({ hostname: e.target.value })}
          />
        </Form.Item>
        <Form.Item
          label="管理地址"
          extra="使用 IPv4/CIDR 格式，例如 192.168.2.1/24。"
        >
          <Input
            value={draft.address}
            placeholder="192.168.2.1/24"
            onChange={(e) => patch({ address: e.target.value })}
          />
        </Form.Item>
        <Form.Item label="时区">
          <Select
            allowClear
            value={draft.timezone || undefined}
            placeholder="使用固件默认时区"
            options={[
              {
                value: "Asia/Shanghai",
                label: "中国标准时间（上海）",
              },
              {
                value: "Asia/Hong_Kong",
                label: "中国标准时间（香港）",
              },
              { value: "Asia/Tokyo", label: "日本标准时间" },
              { value: "UTC", label: "UTC" },
            ]}
            onChange={(v) => patch({ timezone: v || "" })}
          />
        </Form.Item>
        <Form.Item
          label="管理员密码"
          extra="在本机生成密码哈希后写入固件，不保存明文到构建记录。"
        >
          <Input.Password
            autoComplete="new-password"
            value={draft.root_password}
            onChange={(e) => patch({ root_password: e.target.value })}
          />
        </Form.Item>
        {wirelessSupported && (
          <>
            <Form.Item
              label="Wi-Fi 名称"
              extra="首次启动时对已有的无线 AP 接口生效；没有无线接口的设备会跳过。"
            >
              <Input
                value={draft.wifi_ssid}
                onChange={(e) => patch({ wifi_ssid: e.target.value })}
                maxLength={32}
              />
            </Form.Item>
            <Form.Item
              label="Wi-Fi 密码"
              extra="填写 Wi-Fi 时需同时设置 8–63 字节的密码。"
            >
              <Input.Password
                autoComplete="new-password"
                value={draft.wifi_password}
                onChange={(e) => patch({ wifi_password: e.target.value })}
              />
            </Form.Item>
          </>
        )}
        {pppSupported && (
          <>
            <Form.Item
              label="PPPoE 宽带账号"
              extra="仅在设备存在 WAN 配置时生效；构建时会加入 PPPoE 支持。"
            >
              <Input
                autoComplete="off"
                value={draft.ppp_username}
                onChange={(e) => patch({ ppp_username: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="PPPoE 宽带密码">
              <Input.Password
                autoComplete="new-password"
                value={draft.ppp_password}
                onChange={(e) => patch({ ppp_password: e.target.value })}
              />
            </Form.Item>
          </>
        )}
        {profile?.rootfs_supported && (
          <Form.Item
            label="根分区大小"
            extra="留空使用固件默认大小。"
          >
            <InputNumber
              className="full"
              min={64}
              max={32768}
              precision={0}
              placeholder="使用固件默认大小"
              suffix="MiB"
              value={draft.rootfs_size || null}
              onChange={(v) => patch({ rootfs_size: v || 0 })}
            />
          </Form.Item>
        )}
      </Form>
      <Collapse
        ghost
        items={[
          {
            key: "script",
            label: (
              <Space>
                <CodeOutlined />
                高级选项：首次启动脚本
              </Space>
            ),
            children: (
              <Space orientation="vertical" size="small" className="full">
                <Text type="secondary">
                  /etc/uci-defaults/99-custom.sh · 首次启动时执行
                </Text>
                <Input.TextArea
                  aria-label="首次启动脚本"
                  rows={10}
                  className="mono"
                  placeholder={"#!/bin/sh\n\nexit 0"}
                  value={draft.script}
                  onChange={(e) => patch({ script: e.target.value })}
                />
              </Space>
            ),
          },
        ]}
      />
    </Space>
  );
}
