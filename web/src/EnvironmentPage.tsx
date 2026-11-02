import { useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { api } from "./api";
import type { Environment } from "./types";
type Props = {
  env: Environment | null;
  checkingEnv: boolean;
  environment: () => Promise<void>;
  error: (error: unknown) => void;
  refresh: ReactNode;
};
export function EnvironmentPage({
  env,
  checkingEnv,
  environment,
  error,
  refresh,
}: Props) {
  const [installing, setInstalling] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <Typography component="h1" variant="h5">
          {env?.name || "容器环境"}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {!checkingEnv && (
            <Chip
              size="small"
              color={env?.available ? "success" : "default"}
              label={!env ? "未检查" : env.available ? "可访问" : "需要处理"}
            />
          )}
          {refresh}
        </Stack>
      </Stack>
      {checkingEnv ? (
        <Skeleton variant="rounded" height={80} />
      ) : env && !env.available ? (
        <Alert severity="warning">
          {env.name === "WSL Containers"
            ? "请安装或更新 WSL Containers。"
            : "请检查 Docker 是否已安装、启动且当前用户有访问权限。"}
          {env.message && <Box sx={{ mt: 1 }}>{env.message}</Box>}
        </Alert>
      ) : null}
      {notice && <Alert severity="info">{notice}</Alert>}
      {env?.name === "WSL Containers" && !env.available && (
        <Box>
          <Button
            variant="outlined"
            disabled={installing}
            onClick={async () => {
              setInstalling(true);
              try {
                const x = await api<{ message: string }>(
                  "/environment/install-wsl",
                  { method: "POST" },
                );
                setNotice(x.message);
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
        </Box>
      )}
    </Stack>
  );
}
