import {
  Box,
  Button,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
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
    <Stack spacing={3} divider={<Divider />}>
      <Typography component="h1" variant="h5">
        系统设置
      </Typography>
      <Box>
        <Typography variant="h6">固件生态</Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
          切换后重新选择设备和软件。
        </Typography>
        <TextField
          select
          label="固件生态"
          value={ecosystem}
          disabled={switchingEcosystem}
          onChange={(e) => changeEcosystem(e.target.value)}
          sx={{ width: "100%", maxWidth: 520 }}
        >
          <MenuItem value="immortalwrt">ImmortalWrt</MenuItem>
          <MenuItem value="openwrt">OpenWrt 官方</MenuItem>
        </TextField>
      </Box>
      <Box>
        <Typography variant="h6">查询代理</Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
          用于查询版本、设备、软件索引和 Docker Hub 摘要。
        </Typography>
        <Stack spacing={2} sx={{ maxWidth: 520 }}>
          <TextField
            select
            label="代理类型"
            value={proxyType}
            onChange={(e) => setProxyType(e.target.value)}
          >
            <MenuItem value="none">不使用</MenuItem>
            <MenuItem value="http">HTTP</MenuItem>
            <MenuItem value="socks5">SOCKS5</MenuItem>
          </TextField>
          {proxyType !== "none" && (
            <TextField
              label="代理地址"
              placeholder="127.0.0.1:10808"
              value={proxyAddress}
              onChange={(e) => setProxyAddress(e.target.value)}
            />
          )}
          <Box>
            <Button
              variant="contained"
              disabled={savingProxy}
              onClick={saveProxy}
            >
              保存代理设置
            </Button>
          </Box>
        </Stack>
      </Box>
      <Box>
        <Typography variant="h6">Docker Hub 镜像加速</Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
          镜像拉取使用独立的仓库前缀；留空使用 Docker Hub。
        </Typography>
        <Stack spacing={2} sx={{ maxWidth: 520 }}>
          <TextField
            label="镜像仓库前缀"
            value={registry}
            onChange={(e) => setRegistry(e.target.value)}
          />
          <Box>
            <Button variant="contained" onClick={saveRegistry}>
              保存镜像设置
            </Button>
          </Box>
        </Stack>
      </Box>
      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>
          本地数据
        </Typography>
        {[
          ["数据目录", dataDir],
          ["当前软件源", mirror],
          ["构建环境", environmentName],
        ].map(([label, value]) => (
          <Box
            key={label}
            sx={{
              display: "grid",
              gridTemplateColumns: "120px minmax(0, 1fr)",
              py: 0.5,
            }}
          >
            <Typography color="text.secondary">{label}</Typography>
            <Typography sx={{ overflowWrap: "anywhere" }}>{value}</Typography>
          </Box>
        ))}
      </Box>
    </Stack>
  );
}
