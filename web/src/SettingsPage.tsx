import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Select,
  Space,
  Typography,
} from "antd";

const { Title, Text, Paragraph } = Typography;
type Props = {
  ecosystem: string;
  switchingEcosystem: boolean;
  changeEcosystem: (value: string) => void;
  proxyType: string;
  setProxyType: (value: string) => void;
  proxyAddress: string;
  setProxyAddress: (value: string) => void;
  savingProxy: boolean;
  saveProxy: () => void;
  registry: string;
  setRegistry: (value: string) => void;
  saveRegistry: () => void;
  dataDir: string;
  mirror: string;
  environmentName: string;
};
export function SettingsPage({
  ecosystem,
  switchingEcosystem,
  changeEcosystem,
  proxyType,
  setProxyType,
  proxyAddress,
  setProxyAddress,
  savingProxy,
  saveProxy,
  registry,
  setRegistry,
  saveRegistry,
  dataDir,
  mirror,
  environmentName,
}: Props) {
  return (
    <>
      <div className="page-title">
        <Title level={3}>设置</Title>
        <Text type="secondary">配置网络访问并查看本地数据目录。</Text>
      </div>
      <Space orientation="vertical" size="middle" className="full">
        <Card title="固件生态">
          <Select
            className="full"
            value={ecosystem}
            loading={switchingEcosystem}
            disabled={switchingEcosystem}
            onChange={changeEcosystem}
            options={[
              { value: "immortalwrt", label: "ImmortalWrt" },
              { value: "openwrt", label: "OpenWrt 官方" },
            ]}
          />
        </Card>
        <Card title="查询代理">
          <Form layout="vertical">
            <Form.Item label="代理类型">
              <Select
                value={proxyType}
                onChange={setProxyType}
                options={[
                  { value: "none", label: "不使用" },
                  { value: "http", label: "HTTP" },
                  { value: "socks5", label: "SOCKS5" },
                ]}
              />
            </Form.Item>
            {proxyType !== "none" && (
              <Form.Item
                label="代理地址"
                extra="填写地址和端口，例如 127.0.0.1:7890。"
              >
                <Input
                  value={proxyAddress}
                  onChange={(e) => setProxyAddress(e.target.value)}
                  placeholder="127.0.0.1:7890"
                />
              </Form.Item>
            )}
            <Paragraph type="secondary">
              用于查询版本、设备、软件索引和 Docker Hub
              摘要；容器镜像拉取不使用此代理。
            </Paragraph>
            <Button type="primary" loading={savingProxy} onClick={saveProxy}>
              保存设置
            </Button>
          </Form>
        </Card>
        <Card title="Docker Hub 镜像加速">
          <Form layout="vertical">
            <Form.Item
              label="镜像仓库前缀"
              extra="可选，例如 mirror.example.com；留空直接使用 Docker Hub。加速失败时不会自动回退；获取镜像摘要仍需访问 Docker Hub。"
            >
              <Input
                value={registry}
                placeholder="留空使用 Docker Hub"
                onChange={(e) => setRegistry(e.target.value)}
              />
            </Form.Item>
            <Button type="primary" onClick={saveRegistry}>
              保存设置
            </Button>
          </Form>
        </Card>
        <Card title="本地数据">
          <Descriptions
            column={1}
            items={[
              { key: "data", label: "数据目录", children: dataDir },
              {
                key: "mirror",
                label: "当前软件源",
                children: mirror,
              },
              {
                key: "env",
                label: "构建环境",
                children: environmentName,
              },
            ]}
          />
        </Card>
      </Space>
    </>
  );
}
