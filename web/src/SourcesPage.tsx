import { Button, Card, Form, Input, Tooltip, Typography } from "antd";
import type { FormInstance } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { MirrorSource } from "./types";
const { Title, Text } = Typography;
type Props = {
  mirrorForm: FormInstance<{ mirrors: MirrorSource[] }>;
  saveMirrors: (values: { mirrors: MirrorSource[] }) => void;
  savingMirrors: boolean;
};
export function SourcesPage({ mirrorForm, saveMirrors, savingMirrors }: Props) {
  return (
    <>
      <div className="page-title">
        <Title level={3}>软件源站</Title>
        <Text type="secondary">管理设备目录、构建和固件默认软件源。</Text>
      </div>
      <Card
        title="软件源列表"
        extra={<Text type="secondary">第一项为默认源</Text>}
      >
        <Form form={mirrorForm} layout="vertical" onFinish={saveMirrors}>
          <Form.List
            name="mirrors"
            rules={[
              {
                validator: async (_, list: MirrorSource[]) => {
                  if (!list?.length) throw new Error("请至少保留一个软件源");
                  if (list.length > 32) throw new Error("最多添加 32 个软件源");
                },
              },
            ]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                <div className="mirror-list-header">
                  <span>镜像名称</span>
                  <span>HTTPS 地址</span>
                  <span />
                </div>
                {fields.map(({ key, name, ...rest }) => (
                  <div className="mirror-row" key={key}>
                    <Form.Item
                      {...rest}
                      name={[name, "name"]}
                      rules={[
                        {
                          required: true,
                          whitespace: true,
                          message: "请填写名称",
                        },
                        { max: 80 },
                      ]}
                    >
                      <Input
                        aria-label="镜像名称"
                        placeholder="例如 南京大学"
                        maxLength={80}
                      />
                    </Form.Item>
                    <Form.Item
                      {...rest}
                      name={[name, "url"]}
                      rules={[
                        {
                          required: true,
                          whitespace: true,
                          message: "请填写地址",
                        },
                        { type: "url", message: "请输入有效地址" },
                        {
                          pattern: /^https:\/\//,
                          message: "请使用 HTTPS",
                        },
                      ]}
                    >
                      <Input
                        aria-label="镜像地址"
                        placeholder="https://example.com/openwrt"
                      />
                    </Form.Item>
                    <Tooltip title="删除">
                      <Button
                        aria-label="删除软件源"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={fields.length === 1}
                        onClick={() => remove(name)}
                      />
                    </Tooltip>
                  </div>
                ))}
                <Form.ErrorList errors={errors} />
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => add({ name: "", url: "" })}
                  disabled={fields.length >= 32}
                >
                  添加软件源
                </Button>
              </>
            )}
          </Form.List>
          <div className="mirror-actions">
            <Button type="primary" htmlType="submit" loading={savingMirrors}>
              保存设置
            </Button>
          </div>
        </Form>
      </Card>
    </>
  );
}
