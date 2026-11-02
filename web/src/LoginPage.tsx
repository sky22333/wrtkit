import { useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/.test(username)) {
      setError("用户名需为 3–32 位字母、数字或 ._-，且以字母或数字开头");
      return;
    }
    if (Array.from(password).length < 6 || Array.from(password).length > 64) {
      setError("密码需为 6–64 个字符");
      return;
    }
    if (!initialized && password !== confirm) {
      setError("两次密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Paper
        component="main"
        variant="outlined"
        sx={{ width: "100%", maxWidth: 420, p: { xs: 3, sm: 4 } }}
      >
        <Stack spacing={3}>
          <Stack spacing={1} sx={{ alignItems: "center" }}>
            <Box
              component="img"
              src="/favicon.svg"
              alt=""
              sx={{ width: 40, height: 40 }}
            />
            <Typography variant="h5">
              WrtKit
            </Typography>
            <Typography color="text.secondary">
              {initialized ? "登录工作台" : "创建管理员账号"}
            </Typography>
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack component="form" onSubmit={submit} spacing={2}>
            <TextField
              required
              fullWidth
              label="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
            <TextField
              required
              fullWidth
              label="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={initialized ? "current-password" : "new-password"}
            />
            {!initialized && (
              <TextField
                required
                fullWidth
                label="确认密码"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            )}
            <Button type="submit" variant="contained" disabled={busy} fullWidth>
              {busy ? "请稍候…" : initialized ? "登录" : "创建并登录"}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
