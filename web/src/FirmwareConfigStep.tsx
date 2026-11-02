import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { Build, Profile } from "./types";

type Props = {
  draft: Build;
  patch: (value: Partial<Build>) => void;
  profile: Profile | null;
  wirelessSupported: boolean;
  pppSupported: boolean;
};

export function FirmwareConfigStep({
  draft,
  patch,
  profile,
  wirelessSupported,
  pppSupported,
}: Props) {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h5">
          配置固件
        </Typography>
        <Typography color="text.secondary">留空时使用固件默认配置。</Typography>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          gap: 2.5,
        }}
      >
        <TextField
          label="主机名"
          value={draft.hostname}
          onChange={(e) => patch({ hostname: e.target.value })}
        />
        <TextField
          label="管理地址"
          value={draft.address}
          onChange={(e) => patch({ address: e.target.value })}
          helperText="IPv4/CIDR，例如 192.168.2.1/24"
        />
        <TextField
          select
          label="时区"
          value={draft.timezone}
          onChange={(e) => patch({ timezone: e.target.value })}
        >
          <MenuItem value="">固件默认</MenuItem>
          <MenuItem value="Asia/Shanghai">中国标准时间（上海）</MenuItem>
          <MenuItem value="Asia/Hong_Kong">中国标准时间（香港）</MenuItem>
          <MenuItem value="Asia/Tokyo">日本标准时间</MenuItem>
          <MenuItem value="UTC">UTC</MenuItem>
        </TextField>
        <TextField
          label="管理员密码"
          type="password"
          autoComplete="new-password"
          value={draft.root_password}
          onChange={(e) => patch({ root_password: e.target.value })}
          helperText="构建记录不保存明文密码"
        />
        {wirelessSupported && (
          <>
            <TextField
              label="Wi-Fi 名称"
              value={draft.wifi_ssid}
              onChange={(e) => patch({ wifi_ssid: e.target.value })}
              helperText="首次启动时对已有无线 AP 接口生效"
            />
            <TextField
              label="Wi-Fi 密码"
              type="password"
              autoComplete="new-password"
              value={draft.wifi_password}
              onChange={(e) => patch({ wifi_password: e.target.value })}
              helperText="填写 Wi-Fi 时需同时设置 8–63 字节密码"
            />
          </>
        )}
        {pppSupported && (
          <>
            <TextField
              label="PPPoE 宽带账号"
              value={draft.ppp_username}
              onChange={(e) => patch({ ppp_username: e.target.value })}
              helperText="仅在设备存在 WAN 配置时生效"
            />
            <TextField
              label="PPPoE 宽带密码"
              type="password"
              autoComplete="new-password"
              value={draft.ppp_password}
              onChange={(e) => patch({ ppp_password: e.target.value })}
            />
          </>
        )}
        {profile?.rootfs_supported && (
          <TextField
            label="根分区大小（MiB）"
            type="number"
            value={draft.rootfs_size || ""}
            onChange={(e) =>
              patch({ rootfs_size: Number(e.target.value) || 0 })
            }
            slotProps={{ htmlInput: { min: 64, max: 32768, step: 1 } }}
            helperText="留空使用固件默认大小"
          />
        )}
      </Box>
      <Accordion disableGutters elevation={0} square>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>高级选项：首次启动脚本</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <TextField
            multiline
            minRows={10}
            fullWidth
            value={draft.script}
            onChange={(e) => patch({ script: e.target.value })}
            placeholder={"#!/bin/sh\n\nexit 0"}
            slotProps={{ htmlInput: { "aria-label": "首次启动脚本" } }}
          />
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}
