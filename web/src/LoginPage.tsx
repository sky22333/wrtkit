import { useState } from "react";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { api } from "./api";

export function LoginPage({
  initialized,
  onLogin,
}: {
  initialized: boolean;
  onLogin: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (values: { username: string; password: string }) => {
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      onLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-page">
      <Card className="login-card">
        <div className="login-heading">
          <img src="/favicon.svg" alt="" />
          <Typography.Title level={2}>WrtKit</Typography.Title>
          <Typography.Text type="secondary">
            {initialized ? "登录" : "创建管理员"}
          </Typography.Text>
        </div>
        {error && (
          <Alert
            type="error"
            title={error}
            showIcon
            style={{ marginBottom: 20 }}
          />
        )}
        <Form
          layout="vertical"
          onFinish={submit}
          requiredMark={false}
          autoComplete="on"
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: "请输入用户名" },
              {
                pattern: /^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/,
                message: "使用 3–32 位字母、数字",
              },
            ]}
          >
            <Input prefix={<UserOutlined />} autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: "请输入密码" },
              {
                validator: (_, v: string) =>
                  !v ||
                  (Array.from(v).length >= 6 &&
                    Array.from(v).length <= 64)
                    ? Promise.resolve()
                    : Promise.reject(new Error("密码需为 6–64 个字符")),
              },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              autoComplete={initialized ? "current-password" : "new-password"}
            />
          </Form.Item>
          {!initialized && (
            <Form.Item
              name="confirm"
              label="确认密码"
              dependencies={["password"]}
              rules={[
                { required: true, message: "请再次输入密码" },
                ({ getFieldValue }) => ({
                  validator: (_, value: string) =>
                    value === getFieldValue("password")
                      ? Promise.resolve()
                      : Promise.reject(new Error("两次密码不一致")),
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                autoComplete="new-password"
              />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" loading={busy} block>
            {initialized ? "登录" : "创建并登录"}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
