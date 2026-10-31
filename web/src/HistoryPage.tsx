import {
  Button,
  Card,
  Empty,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import type { Job } from "./types";
const { Text } = Typography;
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
  return (
    <>
      <Card title="构建任务" extra={refresh}>
        <Table<Job>
          rowKey="id"
          dataSource={jobs}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description="暂无构建记录" /> }}
          columns={[
            {
              title: "设备",
              render: (_, j) => (
                <Space orientation="vertical" size={0}>
                  <Text>{j.request.device}</Text>
                  <Text type="secondary">
                    {j.request.version} · {j.request.target}
                  </Text>
                </Space>
              ),
            },
            {
              title: "创建时间",
              dataIndex: "created",
              render: (v) => new Date(v).toLocaleString(),
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (v) => (
                <Tag
                  color={
                    v === "success"
                      ? "success"
                      : v === "failed"
                        ? "error"
                        : "default"
                  }
                >
                  {statuses[v] || v}
                </Tag>
              ),
            },
            {
              title: "操作",
              render: (_, j) => (
                <Space>
                  <Tooltip title="查看详情">
                    <Button
                      type="text"
                      aria-label={"查看 " + j.request.device}
                      icon={<EyeOutlined />}
                      onClick={() => showJob(j)}
                    />
                  </Tooltip>
                  {!["queued", "running", "cleaned"].includes(j.status) && (
                    <Tooltip title="清理产物">
                      <Button
                        type="text"
                        danger
                        aria-label={"清理 " + j.request.device}
                        icon={<DeleteOutlined />}
                        onClick={() => cleanup(j)}
                      />
                    </Tooltip>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
