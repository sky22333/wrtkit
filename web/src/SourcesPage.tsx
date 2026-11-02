import { useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";
import type { MirrorSource } from "./types";
type Props = {
  mirrors: MirrorSource[];
  saveMirrors: (values: { mirrors: MirrorSource[] }) => void;
  savingMirrors: boolean;
};
export function SourcesPage({ mirrors, saveMirrors, savingMirrors }: Props) {
  const [items, setItems] = useState(mirrors);
  const [error, setError] = useState("");
  const update = (i: number, patch: Partial<MirrorSource>) =>
    setItems((old) => old.map((v, n) => (n === i ? { ...v, ...patch } : v)));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!items.length || items.length > 32) {
      setError("请保留 1–32 个软件源");
      return;
    }
    for (const item of items) {
      if (!item.name.trim() || item.name.length > 80) {
        setError("请填写不超过 80 个字符的名称");
        return;
      }
      try {
        if (new URL(item.url).protocol !== "https:") throw Error();
      } catch {
        setError("请输入有效的 HTTPS 软件源地址");
        return;
      }
    }
    setError("");
    saveMirrors({ mirrors: items });
  };
  return (
    <Stack component="form" onSubmit={submit} spacing={2}>
      <Box>
        <Typography component="h1" variant="h5">
          软件源列表
        </Typography>
        <Typography variant="body2" color="text.secondary">
          第一项为默认源。
        </Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {items.map((item, i) => (
        <Box
          key={i}
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0, 1fr) auto",
              sm: "minmax(0, 1fr) minmax(0, 2fr) auto",
            },
            gap: 1.5,
            alignItems: "end",
          }}
        >
          <TextField
            label={`镜像名称 ${i + 1}`}
            value={item.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <TextField
            label={`HTTPS 地址 ${i + 1}`}
            value={item.url}
            onChange={(e) => update(i, { url: e.target.value })}
            sx={{
              gridColumn: { xs: "1", sm: "2" },
              gridRow: { xs: "2", sm: "1" },
            }}
          />
          <Box
            sx={{
              gridColumn: { xs: "2", sm: "3" },
              gridRow: "1",
              alignSelf: "end",
            }}
          >
            <Tooltip title="删除软件源">
              <span>
                <IconButton
                  aria-label={`删除软件源 ${item.name || i + 1}`}
                  disabled={items.length === 1}
                  onClick={() =>
                    setItems((old) => old.filter((_, n) => n !== i))
                  }
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      ))}
      <Stack direction="row" spacing={1}>
        <Button
          startIcon={<AddIcon />}
          disabled={items.length >= 32}
          onClick={() => setItems((old) => [...old, { name: "", url: "" }])}
        >
          添加软件源
        </Button>
        <Button type="submit" variant="contained" disabled={savingMirrors}>
          保存设置
        </Button>
      </Stack>
    </Stack>
  );
}
