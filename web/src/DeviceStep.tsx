import { Flex, Input, Select, Skeleton, Space, Table, Typography } from "antd";
import type { Dispatch, SetStateAction } from "react";
import type { Build, Device, MirrorSource, Profile } from "./types";
const { Title, Text } = Typography;
type Setter<T> = Dispatch<SetStateAction<T>>;
type Props = {
  draft: Build;
  patch: (value: Partial<Build>) => void;
  mirrors: MirrorSource[];
  versions: string[];
  deviceVersion: string;
  setDeviceVersion: Setter<string>;
  setProfile: Setter<Profile | null>;
  setVersions: Setter<string[]>;
  setDevices: Setter<Device[]>;
  setDevicePage: Setter<number>;
  query: string;
  setQuery: Setter<string>;
  devicePage: number;
  loadingDevices: boolean;
  devices: Device[];
  choose: (device: Device) => void;
};
export function DeviceStep({
  draft,
  patch,
  mirrors,
  versions,
  deviceVersion,
  setDeviceVersion,
  setProfile,
  setVersions,
  setDevices,
  setDevicePage,
  query,
  setQuery,
  devicePage,
  loadingDevices,
  devices,
  choose,
}: Props) {
  if (!draft.mirror) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }
  return (
    <Space orientation="vertical" size="middle" className="full">
      <div>
        <Title level={4}>选择设备</Title>
        <Text type="secondary">选择系统版本，搜索设备型号或目标平台。</Text>
      </div>
      <Flex gap={12} wrap>
        <Select
          aria-label="数据源"
          value={draft.mirror}
          options={mirrors.map((m) => ({
            label: m.name,
            value: m.url,
            title: m.url,
          }))}
          className="mirror-select"
          onChange={(m) => {
            patch({
              mirror: m,
              profile: "",
              target: "",
              device: "",
              version: "",
            });
            setProfile(null);
            setDeviceVersion("");
            setVersions([]);
            setDevices([]);
            setDevicePage(1);
          }}
        />
        <Select
          aria-label="系统版本"
          value={deviceVersion || undefined}
          placeholder="选择系统版本"
          options={versions.map((v) => ({
            label: v,
            value: v,
          }))}
          className="version-select"
          onChange={(v) => {
            setDevices([]);
            setDeviceVersion(v);
            patch({
              version: "",
              profile: "",
              target: "",
              device: "",
            });
            setProfile(null);
            setDevicePage(1);
          }}
        />
        <Input.Search
          className="search-input"
          placeholder="搜索品牌、型号或平台"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDevicePage(1);
          }}
          allowClear
        />
      </Flex>
      {loadingDevices && devices.length === 0 ? (
        <Skeleton active title={false} paragraph={{ rows: 7 }} />
      ) : (
        <Table<Device>
          size="middle"
          rowKey={(d) => d.target + "/" + d.id}
          loading={loadingDevices}
          dataSource={devices}
          pagination={{
            current: devicePage,
            pageSize: 100,
            showSizeChanger: false,
            onChange: setDevicePage,
          }}
          scroll={{ y: 430 }}
          rowSelection={{
            type: "radio",
            selectedRowKeys: draft.profile
              ? [draft.target + "/" + draft.profile]
              : [],
            onChange: (_, rows) => rows[0] && choose(rows[0]),
          }}
          onRow={(d) => ({
            onClick: () => choose(d),
            style: { cursor: "pointer" },
          })}
          columns={[
            {
              title: "设备",
              dataIndex: "title",
              render: (v, d) => (
                <Space orientation="vertical" size={0}>
                  <Text>{v}</Text>
                  <Text type="secondary">{d.id}</Text>
                </Space>
              ),
            },
            {
              title: "目标平台",
              dataIndex: "target",
              width: 180,
            },
          ]}
        />
      )}
      <Text type="secondary">共 {devices.length} 个设备。</Text>
    </Space>
  );
}
