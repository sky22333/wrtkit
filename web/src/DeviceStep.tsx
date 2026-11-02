import {
  Alert,
  Box,
  Button,
  MenuItem,
  Pagination,
  Radio,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import type { Dispatch, SetStateAction } from "react";
import type { Build, Device, MirrorSource, Profile } from "./types";
type Setter<T> = Dispatch<SetStateAction<T>>;
type Props = {
  draft: Build;
  patch: (value: Partial<Build>) => void;
  mirrors: MirrorSource[];
  versions: string[];
  deviceVersion: string;
  setDeviceVersion: Setter<string>;
  setProfile: Setter<Profile | null>;
  setVersions: Setter<string[]>;
  setDevices: Setter<Device[]>;
  setDevicePage: Setter<number>;
  query: string;
  setQuery: Setter<string>;
  devicePage: number;
  loadingDevices: boolean;
  loadError: string;
  retryLoad: () => void;
  devices: Device[];
  choose: (device: Device) => void;
};

export function DeviceStep({
  draft,
  patch,
  mirrors,
  versions,
  deviceVersion,
  setDeviceVersion,
  setProfile,
  setVersions,
  setDevices,
  setDevicePage,
  query,
  setQuery,
  devicePage,
  loadingDevices,
  loadError,
  retryLoad,
  devices,
  choose,
}: Props) {
  if (!draft.mirror) return <Skeleton variant="rounded" height={430} />;
  return (
    <Stack spacing={2}>
      <Box>
        <Typography component="h1" variant="h5">
          选择设备
        </Typography>
        <Typography color="text.secondary">
          选择版本并搜索设备型号或平台。
        </Typography>
      </Box>
      {loadError && (
        <Alert
          severity="error"
          action={<Button onClick={retryLoad}>重试</Button>}
        >
          加载设备资料失败：{loadError}
        </Alert>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 180px 1fr" },
          gap: 1.5,
        }}
      >
        <TextField
          select
          label="软件源"
          value={draft.mirror}
          onChange={(e) => {
            patch({
              mirror: e.target.value,
              profile: "",
              target: "",
              device: "",
              version: "",
            });
            setProfile(null);
            setDeviceVersion("");
            setVersions([]);
            setDevices([]);
            setDevicePage(1);
          }}
        >
          {mirrors.map((m) => (
            <MenuItem key={m.url} value={m.url}>
              {m.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="系统版本"
          value={deviceVersion}
          onChange={(e) => {
            setDevices([]);
            setDeviceVersion(e.target.value);
            patch({ version: "", profile: "", target: "", device: "" });
            setProfile(null);
            setDevicePage(1);
          }}
        >
          <MenuItem value="" disabled>
            选择版本
          </MenuItem>
          {versions.map((v) => (
            <MenuItem key={v} value={v}>
              {v}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="搜索设备"
          placeholder="品牌、型号或平台"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDevicePage(1);
          }}
        />
      </Box>
      {loadingDevices && devices.length === 0 ? (
        <Skeleton variant="rounded" height={430} />
      ) : (
        <TableContainer sx={{ height: 430 }}>
          <Table stickyHeader size="small" aria-label="设备列表">
            <TableHead>
              <TableRow>
                <TableCell width={72}>选择</TableCell>
                <TableCell>设备</TableCell>
                <TableCell>目标平台</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {devices
                .slice((devicePage - 1) * 100, devicePage * 100)
                .map((d) => (
                  <TableRow
                    key={`${d.target}/${d.id}`}
                    hover
                    selected={
                      draft.target === d.target && draft.profile === d.id
                    }
                    onClick={() => choose(d)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      <Radio
                        size="small"
                        checked={
                          draft.target === d.target && draft.profile === d.id
                        }
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => choose(d)}
                        slotProps={{
                          input: { "aria-label": `选择 ${d.title}` },
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography>{d.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {d.id}
                      </Typography>
                    </TableCell>
                    <TableCell>{d.target}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {!devices.length && (
            <Typography sx={{ p: 3 }} color="text.secondary">
              {loadingDevices ? "正在加载设备…" : "没有找到设备"}
            </Typography>
          )}
        </TableContainer>
      )}
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          共 {devices.length} 个设备
        </Typography>
        {devices.length > 100 && (
          <Pagination
            count={Math.ceil(devices.length / 100)}
            page={devicePage}
            onChange={(_, p) => setDevicePage(p)}
          />
        )}
      </Stack>
    </Stack>
  );
}
