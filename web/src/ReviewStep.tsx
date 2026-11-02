import { Alert, Box, Divider, Stack, Typography } from "@mui/material";
import type { Build, Environment } from "./types";

type Props = {
  draft: Build;
  additionalCount: number;
  wirelessSupported: boolean;
  pppSupported: boolean;
  env: Environment | null;
};

export function ReviewStep({
  draft,
  additionalCount,
  wirelessSupported,
  pppSupported,
  env,
}: Props) {
  const rows = [
    ["设备", draft.device],
    ["目标平台", `${draft.target} / ${draft.profile}`],
    ["系统版本", draft.version],
    ["软件包", `新增 ${additionalCount} 项，移除 ${draft.remove.length} 项`],
    ["LuCI 主题", draft.theme || "固件默认"],
    ["根分区", draft.rootfs_size ? `${draft.rootfs_size} MiB` : "固件默认"],
    ...(wirelessSupported ? [["无线网络", draft.wifi_ssid || "默认"]] : []),
    ...(pppSupported
      ? [["PPPoE", draft.ppp_username ? "已配置" : "默认"]]
      : []),
    ["管理地址", draft.address || "默认"],
    ["初始化脚本", draft.script ? "已填写" : "未填写"],
    ["构建及固件默认软件源", draft.mirror],
  ];
  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h5">
        确认构建
      </Typography>
      <Box component="dl" sx={{ m: 0 }}>
        {rows.map(([label, value], i) => (
          <Box key={label}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "180px 1fr" },
                gap: 1,
                py: 1.5,
              }}
            >
              <Typography component="dt" color="text.secondary">
                {label}
              </Typography>
              <Typography
                component="dd"
                sx={{ m: 0, overflowWrap: "anywhere" }}
              >
                {value}
              </Typography>
            </Box>
            {i < rows.length - 1 && <Divider />}
          </Box>
        ))}
      </Box>
      {draft.mirror === "https://downloads.immortalwrt.org" && (
        <Alert severity="warning">当前选择的是 ImmortalWrt 官方服务器</Alert>
      )}
      {!env?.available && (
        <Alert severity="warning">构建环境不可用，请先检查。</Alert>
      )}
    </Stack>
  );
}
