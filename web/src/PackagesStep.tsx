import {
  Alert,
  Button,
  Card,
  Checkbox,
  Flex,
  Input,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { Dispatch, SetStateAction } from "react";
import type { Build, Package } from "./types";
const { Title, Text } = Typography;
type Props = {
  draft: Build;
  packageWarnings: string[];
  selectedPackages: string[];
  defaultSet: Set<string>;
  automaticTranslations: Set<string>;
  selectPackage: (name: string, value: boolean) => void;
  toggleDefault: (name: string, remove: boolean) => void;
  packageData: Package[];
  availableNames: Set<string>;
  packageFeed: string;
  setPackageFeed: Dispatch<SetStateAction<string>>;
  packageSearch: string;
  setPackageSearch: Dispatch<SetStateAction<string>>;
  loadingPackages: boolean;
  categorizedPackages: Package[];
  additionalCount: number;
};
export function PackagesStep({
  draft,
  packageWarnings,
  selectedPackages,
  defaultSet,
  automaticTranslations,
  selectPackage,
  toggleDefault,
  packageData,
  availableNames,
  packageFeed,
  setPackageFeed,
  packageSearch,
  setPackageSearch,
  loadingPackages,
  categorizedPackages,
  additionalCount,
}: Props) {
  if (loadingPackages)
    return (
      <Space orientation="vertical" className="full" size="large">
        <Skeleton active paragraph={{ rows: 2 }} />
        <Skeleton active paragraph={{ rows: 8 }} />
      </Space>
    );
  return (
    <Space orientation="vertical" size="middle" className="full">
      <div>
        <Title level={4}>选择软件</Title>
        <Text type="secondary">
          软件目录来自当前镜像站，软件依赖由 ImageBuilder 处理。
        </Text>
      </div>
      {packageWarnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title="部分软件源索引不可用"
          description={packageWarnings.join("；")}
        />
      )}
      <Card
        size="small"
        title="已选择的软件包"
        extra={<Text type="secondary">{selectedPackages.length} 项</Text>}
      >
        <Text type="secondary">
          浅色为设备内置包；中文翻译随所选软件自动匹配。
        </Text>
        <div className="selected-packages">
          {selectedPackages.map((name) => (
            <Tooltip
              key={name}
              title={
                defaultSet.has(name)
                  ? "设备清单中的默认软件包"
                  : automaticTranslations.has(name)
                    ? "由已选软件自动匹配"
                    : undefined
              }
            >
              <Tag
                className={defaultSet.has(name) ? "builtin-package" : undefined}
                closable={!automaticTranslations.has(name)}
                onClose={(e) => {
                  e.preventDefault();
                  selectPackage(name, false);
                }}
              >
                {name}
              </Tag>
            </Tooltip>
          ))}
        </div>
        {draft.remove.length > 0 && (
          <div className="removed-packages">
            <Text type="secondary">已移除的内置包，点击恢复：</Text>
            <Flex wrap gap={6}>
              {draft.remove.map((name) => (
                <Button
                  key={name}
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => toggleDefault(name, false)}
                >
                  {name}
                </Button>
              ))}
            </Flex>
          </div>
        )}
      </Card>
      <Card size="small" title="软件包目录">
        <Space orientation="vertical" className="full" size="middle">
          <Text type="secondary">
            软件来自所选设备的软件源，自动安装中文版本；依赖由构建环境解析。
          </Text>
          {draft.theme &&
            packageData.length > 0 &&
            !availableNames.has(draft.theme) && (
              <Alert
                type="warning"
                showIcon
                title="当前镜像没有所选主题，请在已选软件包中取消或更换。"
              />
            )}
          <Tabs
            activeKey={packageFeed}
            onChange={setPackageFeed}
            items={[
              { key: "all", label: "全部" },
              { key: "luci", label: "LuCI 界面" },
              { key: "themes", label: "主题" },
              { key: "proxy", label: "代理工具" },
            ]}
          />
          <Input.Search
            placeholder="搜索当前分类的软件包"
            value={packageSearch}
            onChange={(e) => setPackageSearch(e.target.value)}
            allowClear
          />
          <Table<Package>
            size="small"
            loading={loadingPackages}
            rowKey={(p) => p.feed + "/" + p.name}
            dataSource={categorizedPackages}
            pagination={{
              pageSize: 10,
              showSizeChanger: false,
              showTotal: (n) => `共 ${n} 项`,
            }}
            columns={[
              {
                title: "选择",
                width: 65,
                render: (_, p) => (
                  <Checkbox
                    aria-label={"选择 " + p.name}
                    disabled={automaticTranslations.has(p.name)}
                    checked={selectedPackages.includes(p.name)}
                    onChange={(e) => selectPackage(p.name, e.target.checked)}
                  />
                ),
              },
              {
                title: "软件包",
                dataIndex: "name",
                render: (name: string) => (
                  <Space>
                    {name}
                    {defaultSet.has(name) && !draft.remove.includes(name) && (
                      <Tag>设备内置</Tag>
                    )}
                    {automaticTranslations.has(name) && <Tag>自动匹配中文</Tag>}
                  </Space>
                ),
              },
              {
                title: "版本",
                dataIndex: "version",
                width: 240,
              },
              {
                title: "软件源",
                dataIndex: "feed",
                width: 100,
              },
            ]}
          />
        </Space>
      </Card>
      <Text>
        新增 {additionalCount} 项，移除 {draft.remove.length} 项
      </Text>
    </Space>
  );
}
