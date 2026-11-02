import { useState, type Dispatch, type SetStateAction } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Pagination,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { Build, Package } from "./types";
type Props = {
  draft: Build;
  packageWarnings: string[];
  selectedPackages: string[];
  defaultSet: Set<string>;
  automaticTranslations: Set<string>;
  selectPackage: (name: string, value: boolean) => void;
  toggleDefault: (name: string, remove: boolean) => void;
  packageData: Package[];
  availableNames: Set<string>;
  packageFeed: string;
  setPackageFeed: Dispatch<SetStateAction<string>>;
  packageSearch: string;
  setPackageSearch: Dispatch<SetStateAction<string>>;
  loadingPackages: boolean;
  packageError: string;
  retryPackages: () => void;
  categorizedPackages: Package[];
  additionalCount: number;
};
export function PackagesStep({
  draft,
  packageWarnings,
  selectedPackages,
  defaultSet,
  automaticTranslations,
  selectPackage,
  toggleDefault,
  packageData,
  availableNames,
  packageFeed,
  setPackageFeed,
  packageSearch,
  setPackageSearch,
  loadingPackages,
  packageError,
  retryPackages,
  categorizedPackages,
  additionalCount,
}: Props) {
  const [page, setPage] = useState(1);
  if (loadingPackages)
    return (
      <Stack spacing={2}>
        <Skeleton height={80} />
        <Skeleton variant="rounded" height={430} />
      </Stack>
    );
  if (packageError)
    return (
      <Alert
        severity="error"
        action={<Button onClick={retryPackages}>重试</Button>}
      >
        软件包目录加载失败：{packageError}
      </Alert>
    );
  const selected = new Set(selectedPackages);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(categorizedPackages.length / 20)),
  );
  return (
    <Stack spacing={2}>
      <Box>
        <Typography component="h1" variant="h5">
          选择软件
        </Typography>
        <Typography color="text.secondary">
          从所选软件源选择软件，依赖由构建环境处理。
        </Typography>
      </Box>
      {packageWarnings.length > 0 && (
        <Alert severity="warning">
          部分软件源索引不可用：{packageWarnings.join("；")}
        </Alert>
      )}
      <Box>
        <Typography variant="subtitle1">
          已选择 {selectedPackages.length} 项
        </Typography>
        <Typography variant="body2" color="text.secondary">
          设备内置包与自动匹配的中文翻译会一并展示。
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1 }}>
          {selectedPackages.map((name) => (
            <Tooltip
              key={name}
              title={
                defaultSet.has(name)
                  ? "设备内置"
                  : automaticTranslations.has(name)
                    ? "自动匹配中文"
                    : name
              }
            >
              <Chip
                size="small"
                label={name}
                variant={defaultSet.has(name) ? "outlined" : "filled"}
                onDelete={
                  automaticTranslations.has(name)
                    ? undefined
                    : () => selectPackage(name, false)
                }
              />
            </Tooltip>
          ))}
        </Box>
      </Box>
      {draft.remove.length > 0 && (
        <Box>
          <Typography variant="body2" color="text.secondary">
            已移除的内置包，点击恢复：
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1 }}>
            {draft.remove.map((name) => (
              <Chip
                key={name}
                size="small"
                label={name}
                onClick={() => toggleDefault(name, false)}
              />
            ))}
          </Box>
        </Box>
      )}
      {draft.theme &&
        packageData.length > 0 &&
        !availableNames.has(draft.theme) && (
          <Alert severity="warning">
            当前软件源没有所选主题，请取消或更换。
          </Alert>
        )}
      <Tabs
        value={packageFeed}
        onChange={(_, value: string) => {
          setPackageFeed(value);
          setPage(1);
        }}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="软件分类"
      >
        <Tab value="all" label="全部" />
        <Tab value="luci" label="LuCI 界面" />
        <Tab value="themes" label="主题" />
        <Tab value="proxy" label="代理工具" />
      </Tabs>
      <TextField
        label="搜索软件包"
        value={packageSearch}
        onChange={(e) => {
          setPackageSearch(e.target.value);
          setPage(1);
        }}
      />
      <TableContainer>
        <Table size="small" aria-label="软件包目录">
          <TableHead>
            <TableRow>
              <TableCell>选择</TableCell>
              <TableCell>软件包</TableCell>
              <TableCell>版本</TableCell>
              <TableCell>软件源</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {categorizedPackages
              .slice((currentPage - 1) * 20, currentPage * 20)
              .map((p) => (
                <TableRow key={`${p.feed}/${p.name}`}>
                  <TableCell>
                    <Checkbox
                      size="small"
                      checked={selected.has(p.name)}
                      disabled={automaticTranslations.has(p.name)}
                      onChange={(e) => selectPackage(p.name, e.target.checked)}
                      slotProps={{ input: { "aria-label": `选择 ${p.name}` } }}
                    />
                  </TableCell>
                  <TableCell>
                    {p.name}{" "}
                    {defaultSet.has(p.name) &&
                      !draft.remove.includes(p.name) && (
                        <Chip size="small" label="设备内置" />
                      )}{" "}
                    {automaticTranslations.has(p.name) && (
                      <Chip size="small" label="自动匹配中文" />
                    )}
                  </TableCell>
                  <TableCell>{p.version}</TableCell>
                  <TableCell>{p.feed}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {categorizedPackages.length === 0 && (
          <Typography sx={{ p: 3 }} color="text.secondary">
            没有找到软件包
          </Typography>
        )}
      </TableContainer>
      <Stack
        direction="row"
        sx={{
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          共 {categorizedPackages.length} 项 · 新增 {additionalCount} 项，移除{" "}
          {draft.remove.length} 项
        </Typography>
        {categorizedPackages.length > 20 && (
          <Pagination
            count={Math.ceil(categorizedPackages.length / 20)}
            page={currentPage}
            onChange={(_, value) => setPage(value)}
          />
        )}
      </Stack>
    </Stack>
  );
}
