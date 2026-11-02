import { useState, type ReactNode } from "react";
import {
  Box,
  Chip,
  IconButton,
  Pagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import type { Job } from "./types";
type Props = {
  jobs: Job[];
  refresh: ReactNode;
  statuses: Record<string, string>;
  showJob: (job: Job) => void;
  cleanup: (job: Job) => void;
};
export function HistoryPage({
  jobs,
  refresh,
  statuses,
  showJob,
  cleanup,
}: Props) {
  const [page, setPage] = useState(1);
  const current = Math.min(page, Math.max(1, Math.ceil(jobs.length / 10)));
  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <Typography component="h1" variant="h5">
          构建任务
        </Typography>
        {refresh}
      </Stack>
      <TableContainer>
        <Table size="small" aria-label="构建记录">
          <TableHead>
            <TableRow>
              <TableCell>设备</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell>状态</TableCell>
              <TableCell align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.slice((current - 1) * 10, current * 10).map((j) => (
              <TableRow key={j.id}>
                <TableCell>
                  <Typography>{j.request.device}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {j.request.version} · {j.request.target}
                  </Typography>
                </TableCell>
                <TableCell>{new Date(j.created).toLocaleString()}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={statuses[j.status] || j.status}
                    color={
                      j.status === "success"
                        ? "success"
                        : j.status === "failed"
                          ? "error"
                          : "default"
                    }
                  />
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="查看详情">
                    <IconButton
                      aria-label={`查看 ${j.request.device} 的构建详情`}
                      onClick={() => showJob(j)}
                    >
                      <VisibilityOutlinedIcon />
                    </IconButton>
                  </Tooltip>
                  {!["queued", "running", "cleaned"].includes(j.status) && (
                    <Tooltip title="清理产物">
                      <IconButton
                        aria-label={`清理 ${j.request.device} 的构建产物`}
                        onClick={() => cleanup(j)}
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!jobs.length && (
          <Typography sx={{ p: 3 }} color="text.secondary">
            暂无构建记录
          </Typography>
        )}
      </TableContainer>
      {jobs.length > 10 && (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Pagination
            count={Math.ceil(jobs.length / 10)}
            page={current}
            onChange={(_, v) => setPage(v)}
          />
        </Box>
      )}
    </Stack>
  );
}
