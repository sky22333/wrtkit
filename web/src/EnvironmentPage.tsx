import { useState } from "react";
import { Alert, App, Button, Card, Space, Tag, Typography } from "antd";
import { api } from "./api";
import type { Environment } from "./types";

const { Paragraph } = Typography;
type Props = {
  env: Environment | null;
  checkingEnv: boolean;
  environment: () => Promise<void>;
  error: (error: unknown) => void;
  refresh: React.ReactNode;
};
export function EnvironmentPage({
  env,
  checkingEnv,
  environment,
  error,
  refresh,
}: Props) {
  const { message } = App.useApp();
  const [installing, setInstalling] = useState(false);
  return (
    <>
      <Card
        title={env?.name || "容器环境"}
        extra={
          <Space>
            <Tag color={env?.available ? "success" : "default"}>
              {checkingEnv
                ? "检查中"
                : !env
                  ? "未检查"
                  : env.available
                    ? "可访问"
                    : "需要处理"}
            </Tag>
            {refresh}
          </Space>
        }
      >
        <Space orientation="vertical" className="full" size="middle">
          {!checkingEnv && env && !env.available && (
            <Alert
              type="info"
              showIcon
              title={
                env.name === "WSL Containers"
                  ? "请安装或更新 WSL Containers。"
                  : "请检查 Docker 是否已安装、启动且当前用户有访问权限。"
              }
              description={env?.message}
            />
          )}
          {env?.name === "WSL Containers" && (
            <Paragraph type="secondary">
              无需单独安装 Linux 发行版；安装可能需要管理员权限并重启。
            </Paragraph>
          )}
          {env?.name === "WSL Containers" && !env.available && (
            <Button
              loading={installing}
              onClick={async () => {
                setInstalling(true);
                try {
                  const x = await api<{ message: string }>(
                    "/environment/install-wsl",
                    { method: "POST" },
                  );
                  void message.info(x.message);
                } catch (e) {
                  error(e);
                } finally {
                  setInstalling(false);
                  await environment();
                }
              }}
            >
              安装 WSL 构建环境
            </Button>
          )}
        </Space>
      </Card>
    </>
  );
}
