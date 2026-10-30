import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Collapse,
  ConfigProvider,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Layout,
  List,
  Menu,
  Select,
  Space,
  Steps,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  AppstoreOutlined,
  BuildOutlined,
  CloudServerOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  availableRecommendations,
  effectiveDefaultPackages,
  hasWirelessDriver,
  resolveChineseTranslations,
  visibleInCategory,
} from "./packageSelection";
import { formatBytes } from "./format";
import "./App.css";

const { Header, Content, Sider } = Layout;
const { Title, Text, Paragraph } = Typography;

type Device = { id: string; target: string; title: string };
type Profile = {
  default_packages: string[];
  device_packages: string[];
  arch: string;
  revision: string;
  rootfs_supported: boolean;
};
type Build = {
  version: string;
  target: string;
  profile: string;
  device: string;
  packages: string[];
  remove: string[];
  mirror: string;
  hostname: string;
  address: string;
  timezone: string;
  script: string;
  theme: string;
  wifi_ssid: string;
  wifi_password: string;
  root_password: string;
  ppp_username: string;
  ppp_password: string;
  rootfs_size: number;
};
type Job = {
  id: string;
  status: string;
  stage: string;
  error: string;
  created: string;
  request: Build;
};
type Artifact = { name: string; size: number };
type Cleanup = {
  id: string;
  path: string;
  bytes: number;
  image: string;
  image_action: string;
};
type Package = {
  name: string;
  version: string;
  feed: string;
  category: string;
};
type MirrorSource = { name: string; url: string };
type Environment = { name: string; available: boolean; message: string };

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch("/api" + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "请求失败");
  return data as T;
}
const initial: Build = {
  version: "",
  target: "",
  profile: "",
  device: "",
  packages: [],
  remove: [],
  mirror: "https://mirror.nju.edu.cn/immortalwrt",
  hostname: "",
  address: "",
  timezone: "",
  script: "",
  theme: "",
  wifi_ssid: "",
  wifi_password: "",
  root_password: "",
  ppp_username: "",
  ppp_password: "",
  rootfs_size: 0,
};
const statuses: Record<string, string> = {
  queued: "等待中",
  running: "构建中",
  success: "已完成",
  failed: "构建失败",
  cancelled: "已取消",
  interrupted: "已中断",
  cleaned: "产物已清理",
};
const nav = [
  { key: "build", icon: <BuildOutlined />, label: "固件构建" },
  { key: "history", icon: <HistoryOutlined />, label: "构建记录" },
  { key: "sources", icon: <CloudServerOutlined />, label: "软件源站" },
  { key: "environment", icon: <AppstoreOutlined />, label: "构建环境" },
  { key: "settings", icon: <SettingOutlined />, label: "系统设置" },
];

function Workspace() {
  const { message, modal } = AntApp.useApp();
  const [starting, setStarting] = useState(false);
  const [page, setPage] = useState("build");
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Build>(initial);
  const [mirrors, setMirrors] = useState<MirrorSource[]>([]);
  const [mirrorForm] = Form.useForm<{ mirrors: MirrorSource[] }>();
  const [savingMirrors, setSavingMirrors] = useState(false);
  const [registry, setRegistry] = useState("");
  const [proxyType, setProxyType] = useState("none");
  const [proxyAddress, setProxyAddress] = useState("");
  const [savingProxy, setSavingProxy] = useState(false);
  const [dataDir, setDataDir] = useState("");
  const [versions, setVersions] = useState<string[]>([]);
  const [deviceVersion, setDeviceVersion] = useState("");
  const [query, setQuery] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [total, setTotal] = useState(0);
  const [devicePage, setDevicePage] = useState(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [packageData, setPackageData] = useState<Package[]>([]);
  const [packageWarnings, setPackageWarnings] = useState<string[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [packageSearch, setPackageSearch] = useState("");
  const initializedDevice = useRef(false);
  const [packageFeed, setPackageFeed] = useState("all");
  const [env, setEnv] = useState<Environment | null>(null);
  const [checkingEnv, setCheckingEnv] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [log, setLog] = useState("");
  const patch = useCallback(
    (v: Partial<Build>) => setDraft((d) => ({ ...d, ...v })),
    [],
  );
  const error = useCallback(
    (e: unknown) => {
      void message.error(e instanceof Error ? e.message : "操作失败");
    },
    [message],
  );
  const environment = useCallback(async () => {
    setCheckingEnv(true);
    try {
      setEnv(await api("/environment"));
    } catch (e) {
      setEnv(null);
      error(e);
    } finally {
      setCheckingEnv(false);
    }
  }, [error]);
  const loadJobs = useCallback(async () => {
    try {
      setJobs(await api("/jobs"));
    } catch (e) {
      error(e);
    }
  }, [error]);
  useEffect(() => {
    api<Environment>("/environment")
      .then(setEnv)
      .catch(error)
      .finally(() => setCheckingEnv(false));
    api<{
      mirrors: MirrorSource[];
      registry: string;
      proxy: string;
      data_dir: string;
    }>("/settings")
      .then((x) => {
        setRegistry(x.registry);
        if (x.proxy) {
          const [kind, address] = x.proxy.split("://");
          setProxyType(kind);
          setProxyAddress(address);
        }
        setDataDir(x.data_dir);
        setMirrors(x.mirrors);
        mirrorForm.setFieldsValue({ mirrors: x.mirrors });
        if (x.mirrors[0]) patch({ mirror: x.mirrors[0].url });
      })
      .catch(error);
  }, [error, patch, mirrorForm]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ stable: string; versions: string[] }>(
      "/versions?mirror=" + encodeURIComponent(draft.mirror),
      { signal: controller.signal },
    )
      .then((x) => {
        setVersions(x.versions);
        setDeviceVersion((v) => (x.versions.includes(v) ? v : x.stable));
      })
      .catch((e) => {
        if (!controller.signal.aborted) error(e);
      });
    return () => controller.abort();
  }, [draft.mirror, error]);
  useEffect(() => {
    if (!deviceVersion) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoadingDevices(true);
      const p = new URLSearchParams({
        version: deviceVersion,
        mirror: draft.mirror,
        q: query,
        page: String(devicePage),
      });
      api<{ items: Device[]; total: number }>("/devices?" + p, {
        signal: controller.signal,
      })
        .then((x) => {
          setDevices(x.items);
          setTotal(x.total);
        })
        .catch((e) => {
          if (!controller.signal.aborted) error(e);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingDevices(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, deviceVersion, devicePage, draft.mirror, error]);
  useEffect(() => {
    if (!draft.version || !draft.profile) return;
    const controller = new AbortController();
    const p = new URLSearchParams({
      version: draft.version,
      target: draft.target,
      profile: draft.profile,
      mirror: draft.mirror,
    });
    api<Profile>("/profile?" + p, { signal: controller.signal })
      .then(setProfile)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setProfile(null);
          error(e);
        }
      });
    return () => controller.abort();
  }, [draft.version, draft.target, draft.profile, draft.mirror, error]);
  useEffect(() => {
    if (step !== 1 || !draft.profile) return;
    const controller = new AbortController();
    const p = new URLSearchParams({
      version: draft.version,
      target: draft.target,
      profile: draft.profile,
      mirror: draft.mirror,
    });
    api<{ items: Package[]; warnings: string[] }>("/packages?" + p, {
      signal: controller.signal,
    })
      .then((x) => {
        setPackageData(x.items);
        setPackageWarnings(x.warnings);
        if (!initializedDevice.current) {
          const defaults = availableRecommendations(
            new Set(x.items.map((p) => p.name)),
          );
          setDraft((d) => ({
            ...d,
            packages: defaults.packages,
            theme: defaults.theme,
          }));
          initializedDevice.current = true;
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setPackageData([]);
          error(e);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPackages(false);
      });
    return () => controller.abort();
  }, [step, draft.version, draft.target, draft.profile, draft.mirror, error]);
  useEffect(() => {
    if (page === "history") api<Job[]>("/jobs").then(setJobs).catch(error);
  }, [page, error]);
  const jobId = job?.id;
  const jobStatus = job?.status;
  useEffect(() => {
    if (!jobId || !jobStatus || !["queued", "running"].includes(jobStatus))
      return;
    const id = jobId;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const [current, response] = await Promise.all([
          api<Job>("/jobs/" + id, { signal: controller.signal }),
          fetch("/api/jobs/" + id + "/log", { signal: controller.signal }),
        ]);
        if (!response.ok) throw Error("读取构建日志失败");
        const text = await response.text();
        if (controller.signal.aborted) return;
        setLog(text);
        setJob(current);
        if (["queued", "running"].includes(current.status))
          timer = setTimeout(tick, 1500);
      } catch (e) {
        if (!controller.signal.aborted) {
          error(e);
          timer = setTimeout(tick, 5000);
        }
      }
    };
    void tick();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [jobId, jobStatus, error]);
  useEffect(() => {
    if (!jobId || !jobStatus || ["queued", "running"].includes(jobStatus))
      return;
    const controller = new AbortController();
    fetch("/api/jobs/" + jobId + "/log", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error("读取构建日志失败");
        return r.text();
      })
      .then(setLog)
      .catch((e) => {
        if (!controller.signal.aborted) error(e);
      });
    return () => controller.abort();
  }, [jobId, jobStatus, error]);
  useEffect(() => {
    if (!jobId || jobStatus !== "success") return;
    const controller = new AbortController();
    api<Artifact[]>("/jobs/" + jobId + "/files", { signal: controller.signal })
      .then(setArtifacts)
      .catch((e) => {
        if (!controller.signal.aborted) error(e);
      });
    return () => controller.abort();
  }, [jobId, jobStatus, error]);
  const availableNames = useMemo(
    () => new Set(packageData.map((p) => p.name)),
    [packageData],
  );
  const defaults = useMemo(
    () =>
      effectiveDefaultPackages(
        profile?.default_packages || [],
        profile?.device_packages || [],
      ),
    [profile],
  );
  const defaultSet = useMemo(() => new Set(defaults), [defaults]);
  const activeDefaults = useMemo(
    () => defaults.filter((name) => !draft.remove.includes(name)),
    [defaults, draft.remove],
  );
  const selectedManually = useMemo(
    () => [...draft.packages, ...(draft.theme ? [draft.theme] : [])],
    [draft.packages, draft.theme],
  );
  const translations = useMemo(
    () =>
      resolveChineseTranslations(
        [...activeDefaults, ...selectedManually],
        availableNames,
      ),
    [activeDefaults, selectedManually, availableNames],
  );
  const automaticTranslations = useMemo(
    () =>
      new Set(
        translations.automatic.filter(
          (name) =>
            !draft.packages.includes(name) &&
            !defaultSet.has(name) &&
            !draft.remove.includes(name),
        ),
      ),
    [translations.automatic, draft.packages, defaultSet, draft.remove],
  );
  const additionalPackages = useMemo(
    () =>
      [...new Set([...draft.packages, ...automaticTranslations])].filter(
        (name) => !defaultSet.has(name),
      ),
    [draft.packages, automaticTranslations, defaultSet],
  );
  const additionalCount =
    additionalPackages.length +
    (draft.theme && !defaultSet.has(draft.theme) ? 1 : 0);
  const selectedPackages = useMemo(
    () => [
      ...new Set([
        ...activeDefaults,
        ...selectedManually,
        ...automaticTranslations,
      ]),
    ],
    [activeDefaults, selectedManually, automaticTranslations],
  );
  const wirelessSupported = useMemo(
    () => hasWirelessDriver(selectedPackages),
    [selectedPackages],
  );
  const pppSupported =
    availableNames.has("ppp-mod-pppoe") &&
    !draft.remove.includes("ppp-mod-pppoe");
  const categorizedPackages = useMemo(
    () =>
      packageData.filter(
        (p) =>
          visibleInCategory(p.name, packageFeed, p.category) &&
          p.name.toLowerCase().includes(packageSearch.trim().toLowerCase()),
      ),
    [packageData, packageFeed, packageSearch],
  );
  const choose = (d: Device) => {
    initializedDevice.current = false;
    setProfile(null);
    setPackageData([]);
    patch({
      target: d.target,
      profile: d.id,
      device: d.title,
      version: deviceVersion,
      packages: [],
      theme: "",
      remove: [],
      rootfs_size: 0,
      wifi_ssid: "",
      wifi_password: "",
      ppp_username: "",
      ppp_password: "",
    });
  };
  const toggleDefault = (name: string, remove: boolean) =>
    setDraft((d) => ({
      ...d,
      remove: remove
        ? [...new Set([...d.remove, name])]
        : d.remove.filter((p) => p !== name),
      packages: remove ? d.packages.filter((p) => p !== name) : d.packages,
      theme: remove && d.theme === name ? "" : d.theme,
    }));
  const selectPackage = (name: string, value: boolean) =>
    setDraft((d) => {
      if (defaultSet.has(name))
        return {
          ...d,
          remove: value
            ? d.remove.filter((p) => p !== name)
            : [...new Set([...d.remove, name])],
          packages: d.packages.filter((p) => p !== name),
          theme: name.startsWith("luci-theme-")
            ? value
              ? name
              : d.theme === name
                ? ""
                : d.theme
            : d.theme,
        };
      if (name.startsWith("luci-theme-"))
        return {
          ...d,
          theme: value ? name : "",
          packages: d.packages.filter((p) => p !== name),
        };
      return {
        ...d,
        packages: value
          ? [...new Set([...d.packages, name])]
          : d.packages.filter((p) => p !== name),
      };
    });
  const nextStep = () => {
    if (step === 0) setLoadingPackages(true);
    if (step === 1 && loadingPackages) {
      void message.warning("软件包目录仍在加载");
      return;
    }
    if (
      step === 1 &&
      selectedPackages.some((name) => draft.remove.includes(name))
    ) {
      void message.warning("已选软件与移除列表冲突，请先调整默认软件包");
      return;
    }
    if (
      step === 1 &&
      draft.theme &&
      packageData.length > 0 &&
      !availableNames.has(draft.theme)
    ) {
      void message.warning("当前软件源没有所选主题，请在软件列表中取消或更换");
      return;
    }
    if (step === 2) {
      const size = (s: string) => new TextEncoder().encode(s).length;
      if ((draft.wifi_ssid === "") !== (draft.wifi_password === "")) {
        void message.warning("请同时填写 Wi-Fi 名称和密码");
        return;
      }
      if (size(draft.wifi_ssid) > 32) {
        void message.warning("Wi-Fi 名称不能超过 32 字节");
        return;
      }
      if (
        draft.wifi_password &&
        (size(draft.wifi_password) < 8 || size(draft.wifi_password) > 63)
      ) {
        void message.warning("Wi-Fi 密码必须为 8 到 63 字节");
        return;
      }
      if ((draft.ppp_username === "") !== (draft.ppp_password === "")) {
        void message.warning("请同时填写 PPPoE 账号和密码");
        return;
      }
      if (
        draft.rootfs_size &&
        (draft.rootfs_size < 64 || draft.rootfs_size > 32768)
      ) {
        void message.warning("根分区大小应为 64 到 32768 MiB");
        return;
      }
      if (draft.remove.includes(draft.theme) && draft.theme) {
        void message.warning("不能同时选择和移除同一个主题");
        return;
      }
      if (draft.ppp_username && draft.remove.includes("ppp-mod-pppoe")) {
        void message.warning("PPPoE 配置需要 ppp-mod-pppoe 软件包");
        return;
      }
    }
    setStep(step + 1);
  };
  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const x = await api<{ id: string }>("/jobs", {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          packages: additionalPackages,
          ...(wirelessSupported ? {} : { wifi_ssid: "", wifi_password: "" }),
          ...(pppSupported ? {} : { ppp_username: "", ppp_password: "" }),
        }),
      });
      setLog("");
      setArtifacts([]);
      setJob(await api("/jobs/" + x.id));
      setStep(4);
    } catch (e) {
      error(e);
    } finally {
      setStarting(false);
    }
  };
  const saveMirrors = async (values: { mirrors: MirrorSource[] }) => {
    setSavingMirrors(true);
    try {
      const result = await api<{ mirrors: MirrorSource[] }>("/settings", {
        method: "PUT",
        body: JSON.stringify(values),
      });
      const m = result.mirrors;
      setMirrors(m);
      mirrorForm.setFieldsValue({ mirrors: m });
      if (!m.some((source) => source.url === draft.mirror)) {
        patch({
          mirror: m[0].url,
          profile: "",
          target: "",
          device: "",
          version: "",
          packages: [],
          remove: [],
          theme: "",
          wifi_ssid: "",
          wifi_password: "",
          ppp_username: "",
          ppp_password: "",
          rootfs_size: 0,
        });
        setProfile(null);
        setPackageData([]);
        setLoadingPackages(false);
        setStep(0);
        setDeviceVersion("");
        setVersions([]);
        setDevices([]);
        setTotal(0);
        setDevicePage(1);
      }
      void message.success("软件源已保存");
    } catch (e) {
      error(e);
    } finally {
      setSavingMirrors(false);
    }
  };
  const saveProxy = async () => {
    setSavingProxy(true);
    try {
      await api("/settings/proxy", {
        method: "PUT",
        body: JSON.stringify({
          proxy:
            proxyType === "none" ? "" : `${proxyType}://${proxyAddress.trim()}`,
        }),
      });
      void message.success("代理设置已保存");
    } catch (e) {
      error(e);
    } finally {
      setSavingProxy(false);
    }
  };
  const saveRegistry = async () => {
    try {
      const result = await api<{ registry: string }>("/settings/registry", {
        method: "PUT",
        body: JSON.stringify({ registry }),
      });
      setRegistry(result.registry);
      void message.success("镜像加速设置已保存");
    } catch (e) {
      error(e);
    }
  };
  const cleanup = async (j: Job) => {
    try {
      const info = await api<Cleanup>("/jobs/" + j.id + "/cleanup");
      const labels: Record<string, string> = {
        remove: "清理此任务关联的 WrtKit 镜像",
        shared: "镜像仍被其他构建记录使用，将保留",
        preexisting: "镜像已存在或归属无法确认，将保留",
        unknown: "旧记录无镜像归属信息，将保留",
      };
      modal.confirm({
        title: "清理构建产物？",
        okText: "清理",
        cancelText: "取消",
        okButtonProps: { danger: true },
        content: (
          <Space orientation="vertical" size="small">
            <Text>
              将删除 {formatBytes(info.bytes)}{" "}
              产物并检查构建容器；构建记录和日志保留。
            </Text>
            <Text type="secondary">{info.path}</Text>
            <Text>{labels[info.image_action] || "镜像将保留"}</Text>
            {info.image && <Text type="secondary">{info.image}</Text>}
          </Space>
        ),
        onOk: async () => {
          try {
            const result = await api<{ image_result: string }>(
              "/jobs/" + j.id,
              {
                method: "DELETE",
                body: JSON.stringify({ remove_image: true }),
              },
            );
            const outcome: Record<string, string> = {
              removed: "产物和 ImageBuilder 镜像已清理",
              absent: "产物已清理，镜像已不存在",
              shared: "产物已清理；镜像被其他构建记录使用，已保留",
              preexisting: "产物已清理；原有或归属不明的镜像已保留",
              unknown: "产物已清理；旧记录的镜像已保留",
            };
            void message.success(outcome[result.image_result] || "产物已清理");
            await loadJobs();
            if (job?.id === j.id) {
              setJob(null);
              setStep(0);
              setPage("history");
            }
          } catch (e) {
            error(e);
            throw e;
          }
        },
      });
    } catch (e) {
      error(e);
    }
  };
  const showJob = (j: Job) => {
    setJob(j);
    setLog("");
    setArtifacts([]);
    setPage("build");
    setStep(4);
  };
  const refresh = (
    <Tooltip title="刷新">
      <Button
        aria-label="刷新"
        icon={<ReloadOutlined />}
        onClick={page === "history" ? loadJobs : environment}
      />
    </Tooltip>
  );
  return (
    <Layout className="app-layout">
      <Sider
        className="app-sider"
        theme="light"
        width={216}
        breakpoint="lg"
        collapsedWidth="0"
      >
        <div className="brand">
          <img className="brand-icon" src="/favicon.svg" alt="" />{" "}
          <Text strong>WrtKit</Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[page]}
          items={nav}
          onClick={({ key }) => {
            setPage(key);
            if (key === "environment") void environment();
          }}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Text type="secondary">{nav.find((x) => x.key === page)?.label}</Text>
          <Tooltip title="检查构建环境">
            <Button
              type="text"
              aria-label="检查构建环境"
              icon={<ReloadOutlined />}
              onClick={environment}
            />
          </Tooltip>
        </Header>
        <Content className="app-content">
          {page === "build" && (
            <>
              <Flex
                justify="space-between"
                align="start"
                className="page-title"
              >
                <div>
                  <Title level={3}>固件构建</Title>
                  <Text type="secondary">
                    选择设备与软件，配置并构建 ImmortalWrt 固件。
                  </Text>
                </div>
                <Button
                  icon={<HistoryOutlined />}
                  onClick={() => setPage("history")}
                >
                  构建记录
                </Button>
              </Flex>
              <Card>
                {step < 4 && (
                  <Steps
                    size="small"
                    current={Math.min(step, 3)}
                    items={[
                      { title: "选择设备" },
                      { title: "选择软件" },
                      { title: "配置固件" },
                      { title: "确认构建" },
                    ]}
                  />
                )}
                <div className="step-content">
                  {step === 0 && (
                    <Space
                      orientation="vertical"
                      size="middle"
                      className="full"
                    >
                      <div>
                        <Title level={4}>选择设备</Title>
                        <Text type="secondary">
                          选择系统版本，搜索设备型号或目标平台。
                        </Text>
                      </div>
                      <Flex gap={12} wrap>
                        <Select
                          aria-label="数据源"
                          value={draft.mirror}
                          options={mirrors.map((m) => ({
                            label: m.name,
                            value: m.url,
                            title: m.url,
                          }))}
                          className="mirror-select"
                          onChange={(m) => {
                            patch({
                              mirror: m,
                              profile: "",
                              target: "",
                              device: "",
                              version: "",
                            });
                            setProfile(null);
                            setDeviceVersion("");
                            setVersions([]);
                            setDevices([]);
                            setTotal(0);
                            setDevicePage(1);
                          }}
                        />
                        <Select
                          aria-label="系统版本"
                          value={deviceVersion || undefined}
                          placeholder="选择系统版本"
                          options={versions.map((v) => ({
                            label: v,
                            value: v,
                          }))}
                          className="version-select"
                          onChange={(v) => {
                            setDeviceVersion(v);
                            patch({
                              version: "",
                              profile: "",
                              target: "",
                              device: "",
                            });
                            setProfile(null);
                            setDevicePage(1);
                          }}
                        />
                        <Input.Search
                          className="search-input"
                          placeholder="搜索品牌、型号或平台"
                          value={query}
                          onChange={(e) => {
                            setQuery(e.target.value);
                            setDevicePage(1);
                          }}
                          allowClear
                        />
                      </Flex>
                      <Table<Device>
                        size="small"
                        rowKey={(d) => d.target + "/" + d.id}
                        loading={loadingDevices}
                        dataSource={devices}
                        pagination={{
                          current: devicePage,
                          pageSize: 100,
                          total,
                          showSizeChanger: false,
                          onChange: setDevicePage,
                        }}
                        scroll={{ y: 430 }}
                        rowSelection={{
                          type: "radio",
                          selectedRowKeys: draft.profile
                            ? [draft.target + "/" + draft.profile]
                            : [],
                          onChange: (_, rows) => rows[0] && choose(rows[0]),
                        }}
                        onRow={(d) => ({
                          onClick: () => choose(d),
                          style: { cursor: "pointer" },
                        })}
                        columns={[
                          {
                            title: "设备",
                            dataIndex: "title",
                            render: (v, d) => (
                              <Space orientation="vertical" size={0}>
                                <Text>{v}</Text>
                                <Text type="secondary">{d.id}</Text>
                              </Space>
                            ),
                          },
                          {
                            title: "目标平台",
                            dataIndex: "target",
                            width: 180,
                          },
                        ]}
                      />
                      <Text type="secondary">共 {total} 个设备。</Text>
                    </Space>
                  )}
                  {step === 1 && (
                    <Space
                      orientation="vertical"
                      size="middle"
                      className="full"
                    >
                      <div>
                        <Title level={4}>选择软件</Title>
                        <Text type="secondary">
                          软件目录来自当前镜像站，软件依赖由 ImageBuilder 处理。
                        </Text>
                      </div>
                      {packageWarnings.length > 0 && (
                        <Alert
                          type="warning"
                          showIcon
                          title="部分软件源索引不可用"
                          description={packageWarnings.join("；")}
                        />
                      )}
                      <Card
                        size="small"
                        title="已选择的软件包"
                        extra={
                          <Text type="secondary">
                            {selectedPackages.length} 项
                          </Text>
                        }
                      >
                        <Text type="secondary">
                          浅色为设备内置包；中文翻译随所选软件自动匹配。
                        </Text>
                        <div className="selected-packages">
                          {selectedPackages.map((name) => (
                            <Tooltip
                              key={name}
                              title={
                                defaultSet.has(name)
                                  ? "设备清单中的默认软件包"
                                  : automaticTranslations.has(name)
                                    ? "由已选软件自动匹配"
                                    : undefined
                              }
                            >
                              <Tag
                                className={
                                  defaultSet.has(name)
                                    ? "builtin-package"
                                    : undefined
                                }
                                closable={!automaticTranslations.has(name)}
                                onClose={(e) => {
                                  e.preventDefault();
                                  selectPackage(name, false);
                                }}
                              >
                                {name}
                              </Tag>
                            </Tooltip>
                          ))}
                        </div>
                        {draft.remove.length > 0 && (
                          <div className="removed-packages">
                            <Text type="secondary">
                              已移除的内置包，点击恢复：
                            </Text>
                            <Flex wrap gap={6}>
                              {draft.remove.map((name) => (
                                <Button
                                  key={name}
                                  size="small"
                                  icon={<PlusOutlined />}
                                  onClick={() => toggleDefault(name, false)}
                                >
                                  {name}
                                </Button>
                              ))}
                            </Flex>
                          </div>
                        )}
                      </Card>
                      <Card size="small" title="软件包目录">
                        <Space
                          orientation="vertical"
                          className="full"
                          size="middle"
                        >
                          <Text type="secondary">
                            软件来自所选设备的软件源，自动安装中文版本；依赖由构建环境解析。
                          </Text>
                          {draft.theme &&
                            packageData.length > 0 &&
                            !availableNames.has(draft.theme) && (
                              <Alert
                                type="warning"
                                showIcon
                                title="当前镜像没有所选主题，请在已选软件包中取消或更换。"
                              />
                            )}
                          <Tabs
                            activeKey={packageFeed}
                            onChange={setPackageFeed}
                            items={[
                              { key: "all", label: "全部" },
                              { key: "luci", label: "LuCI 界面" },
                              { key: "themes", label: "主题" },
                              { key: "proxy", label: "代理工具" },
                            ]}
                          />
                          <Input.Search
                            placeholder="搜索当前分类的软件包"
                            value={packageSearch}
                            onChange={(e) => setPackageSearch(e.target.value)}
                            allowClear
                          />
                          <Table<Package>
                            size="small"
                            loading={loadingPackages}
                            rowKey={(p) => p.feed + "/" + p.name}
                            dataSource={categorizedPackages}
                            pagination={{
                              pageSize: 10,
                              showSizeChanger: false,
                              showTotal: (n) => `共 ${n} 项`,
                            }}
                            columns={[
                              {
                                title: "选择",
                                width: 65,
                                render: (_, p) => (
                                  <Checkbox
                                    aria-label={"选择 " + p.name}
                                    disabled={automaticTranslations.has(p.name)}
                                    checked={selectedPackages.includes(p.name)}
                                    onChange={(e) =>
                                      selectPackage(p.name, e.target.checked)
                                    }
                                  />
                                ),
                              },
                              {
                                title: "软件包",
                                dataIndex: "name",
                                render: (name: string) => (
                                  <Space>
                                    {name}
                                    {defaultSet.has(name) &&
                                      !draft.remove.includes(name) && (
                                        <Tag>设备内置</Tag>
                                      )}
                                    {automaticTranslations.has(name) && (
                                      <Tag>自动匹配中文</Tag>
                                    )}
                                  </Space>
                                ),
                              },
                              {
                                title: "版本",
                                dataIndex: "version",
                                width: 240,
                              },
                              {
                                title: "软件源",
                                dataIndex: "feed",
                                width: 100,
                              },
                            ]}
                          />
                        </Space>
                      </Card>
                      <Text>
                        新增 {additionalCount} 项，移除 {draft.remove.length} 项
                      </Text>
                    </Space>
                  )}
                  {step === 2 && (
                    <Space
                      orientation="vertical"
                      size="middle"
                      className="full"
                    >
                      <div>
                        <Title level={4}>配置固件</Title>
                        <Text type="secondary">留空时使用固件默认配置。</Text>
                      </div>
                      <Form layout="vertical" className="quick-form">
                        <Form.Item label="主机名">
                          <Input
                            value={draft.hostname}
                            placeholder="例如 ImmortalWrt"
                            onChange={(e) =>
                              patch({ hostname: e.target.value })
                            }
                          />
                        </Form.Item>
                        <Form.Item
                          label="管理地址"
                          extra="使用 IPv4/CIDR 格式，例如 192.168.1.1/24。"
                        >
                          <Input
                            value={draft.address}
                            placeholder="192.168.1.1/24"
                            onChange={(e) => patch({ address: e.target.value })}
                          />
                        </Form.Item>
                        <Form.Item label="时区">
                          <Select
                            allowClear
                            value={draft.timezone || undefined}
                            placeholder="使用固件默认时区"
                            options={[
                              {
                                value: "Asia/Shanghai",
                                label: "中国标准时间（上海）",
                              },
                              {
                                value: "Asia/Hong_Kong",
                                label: "中国标准时间（香港）",
                              },
                              { value: "Asia/Tokyo", label: "日本标准时间" },
                              { value: "UTC", label: "UTC" },
                            ]}
                            onChange={(v) => patch({ timezone: v || "" })}
                          />
                        </Form.Item>
                        <Form.Item
                          label="管理员密码"
                          extra="在本机生成密码哈希后写入固件，不保存明文到构建记录。"
                        >
                          <Input.Password
                            autoComplete="new-password"
                            value={draft.root_password}
                            onChange={(e) =>
                              patch({ root_password: e.target.value })
                            }
                          />
                        </Form.Item>
                        {wirelessSupported && (
                          <>
                            <Form.Item
                              label="Wi-Fi 名称"
                              extra="首次启动时对已有的无线 AP 接口生效；没有无线接口的设备会跳过。"
                            >
                              <Input
                                value={draft.wifi_ssid}
                                onChange={(e) =>
                                  patch({ wifi_ssid: e.target.value })
                                }
                                maxLength={32}
                              />
                            </Form.Item>
                            <Form.Item
                              label="Wi-Fi 密码"
                              extra="填写 Wi-Fi 时需同时设置 8–63 字节的密码。"
                            >
                              <Input.Password
                                autoComplete="new-password"
                                value={draft.wifi_password}
                                onChange={(e) =>
                                  patch({ wifi_password: e.target.value })
                                }
                              />
                            </Form.Item>
                          </>
                        )}
                        {pppSupported && (
                          <>
                            <Form.Item
                              label="PPPoE 宽带账号"
                              extra="仅在设备存在 WAN 配置时生效；构建时会加入 PPPoE 支持。"
                            >
                              <Input
                                autoComplete="off"
                                value={draft.ppp_username}
                                onChange={(e) =>
                                  patch({ ppp_username: e.target.value })
                                }
                              />
                            </Form.Item>
                            <Form.Item label="PPPoE 宽带密码">
                              <Input.Password
                                autoComplete="new-password"
                                value={draft.ppp_password}
                                onChange={(e) =>
                                  patch({ ppp_password: e.target.value })
                                }
                              />
                            </Form.Item>
                          </>
                        )}
                        {profile?.rootfs_supported && (
                          <Form.Item
                            label="根分区大小（MiB）"
                            extra="根据上游镜像文件格式推断；效果需以设备和镜像实际构建结果为准。"
                          >
                            <InputNumber
                              min={64}
                              max={32768}
                              precision={0}
                              value={draft.rootfs_size || null}
                              onChange={(v) => patch({ rootfs_size: v || 0 })}
                            />
                          </Form.Item>
                        )}
                        <Alert
                          type="info"
                          showIcon
                          title="固件包含设备配置"
                          description="Wi-Fi 与 PPPoE 凭据需要写入固件，分享固件前请确认接收者可信。"
                        />
                      </Form>
                      <Collapse
                        items={[
                          {
                            key: "script",
                            label: "高级选项：首次启动脚本",
                            children: (
                              <Form layout="vertical">
                                <Form.Item
                                  label="/etc/uci-defaults/99-custom.sh"
                                  extra="可选；路由器首次启动时执行。"
                                >
                                  <Input.TextArea
                                    rows={10}
                                    className="mono"
                                    placeholder={"#!/bin/sh\n\nexit 0"}
                                    value={draft.script}
                                    onChange={(e) =>
                                      patch({ script: e.target.value })
                                    }
                                  />
                                </Form.Item>
                              </Form>
                            ),
                          },
                        ]}
                      />
                    </Space>
                  )}
                  {step === 3 && (
                    <Space
                      orientation="vertical"
                      size="middle"
                      className="full"
                    >
                      <Title level={4}>确认构建</Title>
                      <Descriptions
                        bordered
                        size="small"
                        column={1}
                        items={[
                          {
                            key: "device",
                            label: "设备",
                            children: draft.device,
                          },
                          {
                            key: "target",
                            label: "目标平台",
                            children: `${draft.target} / ${draft.profile}`,
                          },
                          {
                            key: "version",
                            label: "系统版本",
                            children: draft.version,
                          },
                          {
                            key: "packages",
                            label: "软件包",
                            children: `新增 ${additionalCount} 项，移除 ${draft.remove.length} 项`,
                          },
                          {
                            key: "theme",
                            label: "LuCI 主题",
                            children: draft.theme || "固件默认",
                          },
                          {
                            key: "rootfs",
                            label: "根分区",
                            children: draft.rootfs_size
                              ? `${draft.rootfs_size} MiB`
                              : "固件默认",
                          },
                          ...(wirelessSupported
                            ? [
                                {
                                  key: "wifi",
                                  label: "无线网络",
                                  children: draft.wifi_ssid || "默认",
                                },
                              ]
                            : []),
                          ...(pppSupported
                            ? [
                                {
                                  key: "ppp",
                                  label: "PPPoE",
                                  children: draft.ppp_username
                                    ? "已配置"
                                    : "默认",
                                },
                              ]
                            : []),
                          {
                            key: "address",
                            label: "管理地址",
                            children: draft.address || "默认",
                          },
                          {
                            key: "script",
                            label: "初始化脚本",
                            children: draft.script ? "已填写" : "未填写",
                          },
                          {
                            key: "mirror",
                            label: "构建及固件默认软件源",
                            children: draft.mirror,
                          },
                        ]}
                      />
                      {draft.mirror === "https://downloads.immortalwrt.org" && (
                        <Alert
                          type="warning"
                          showIcon
                          title="当前选择的是 ImmortalWrt 官方服务器"
                        />
                      )}
                      <Alert
                        type="warning"
                        showIcon
                        title="网络隔离尚未完成"
                        description="当前会检查并改写软件源，但尚不能阻止容器内重定向或其他程序访问上游服务器。"
                      />
                      {!env?.available && (
                        <Alert
                          type="warning"
                          showIcon
                          title="构建环境不可用，请先检查。"
                        />
                      )}
                    </Space>
                  )}
                  {step === 4 && job && (
                    <Space
                      orientation="vertical"
                      size="middle"
                      className="full"
                    >
                      <Flex justify="space-between">
                        <div>
                          <Title level={4}>
                            {statuses[job.status] || job.status}
                          </Title>
                          <Text type="secondary">
                            {job.stage} · {job.request.device}
                          </Text>
                        </div>
                      </Flex>
                      {job.error && (
                        <Alert type="error" showIcon title={job.error} />
                      )}
                      <Card
                        size="small"
                        title={
                          <Space>
                            <FileTextOutlined />
                            构建日志
                          </Space>
                        }
                      >
                        <pre className="log">{log || "正在等待构建输出…"}</pre>
                      </Card>
                      {job.status === "success" && (
                        <List
                          className="artifact-list"
                          size="small"
                          header={
                            <Space>
                              <FolderOpenOutlined />
                              构建产物
                            </Space>
                          }
                          bordered
                          dataSource={artifacts}
                          renderItem={(a) => (
                            <List.Item
                              actions={[
                                <Tooltip key="download" title="下载">
                                  <Button
                                    type="text"
                                    aria-label={"下载 " + a.name}
                                    icon={<DownloadOutlined />}
                                    href={
                                      "/api/jobs/" +
                                      job.id +
                                      "/files/" +
                                      encodeURIComponent(a.name)
                                    }
                                  />
                                </Tooltip>,
                              ]}
                            >
                              <List.Item.Meta
                                avatar={<FileOutlined />}
                                title={
                                  <Text className="artifact-name">
                                    {a.name}
                                  </Text>
                                }
                                description={formatBytes(a.size)}
                              />
                            </List.Item>
                          )}
                        />
                      )}
                      {["queued", "running"].includes(job.status) && (
                        <Button
                          danger
                          icon={<StopOutlined />}
                          onClick={() =>
                            modal.confirm({
                              title: "取消当前构建？",
                              onOk: () =>
                                api("/jobs/" + job.id + "/cancel", {
                                  method: "POST",
                                }).catch(error),
                            })
                          }
                        >
                          取消构建
                        </Button>
                      )}
                    </Space>
                  )}
                </div>
                <Flex
                  justify="space-between"
                  align="center"
                  className="step-footer"
                >
                  <Text type="secondary">
                    {draft.device && `${draft.device} · ${draft.version}`}
                  </Text>
                  <Space>
                    {step > 0 && step < 4 && (
                      <Button onClick={() => setStep(step - 1)}>上一步</Button>
                    )}
                    {step < 3 && (
                      <Button
                        type="primary"
                        disabled={
                          (step === 0 && (!draft.profile || !profile)) ||
                          (step === 1 && loadingPackages)
                        }
                        onClick={nextStep}
                      >
                        下一步
                      </Button>
                    )}
                    {step === 3 && (
                      <Button
                        type="primary"
                        loading={starting}
                        disabled={!env?.available}
                        onClick={start}
                      >
                        开始构建
                      </Button>
                    )}
                    {step === 4 &&
                      job &&
                      !["queued", "running", "cleaned"].includes(
                        job.status,
                      ) && (
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => cleanup(job)}
                        >
                          清理产物
                        </Button>
                      )}
                    {step === 4 &&
                      !["queued", "running"].includes(job?.status || "") && (
                        <Button
                          onClick={() => {
                            setStep(0);
                            setJob(null);
                          }}
                        >
                          新建构建
                        </Button>
                      )}
                  </Space>
                </Flex>
              </Card>
            </>
          )}
          {page === "history" && (
            <>
              <Flex justify="space-between" className="page-title">
                <div>
                  <Title level={3}>构建记录</Title>
                  <Text type="secondary">查看构建状态和固件产物。</Text>
                </div>
                {refresh}
              </Flex>
              <Card>
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
                          {!["queued", "running", "cleaned"].includes(
                            j.status,
                          ) && (
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
          )}
          {page === "sources" && (
            <>
              <div className="page-title">
                <Title level={3}>软件源站</Title>
                <Text type="secondary">
                  管理设备目录、构建和固件默认软件源。
                </Text>
              </div>
              <Card
                title="软件源列表"
                extra={<Text type="secondary">第一项为默认源</Text>}
              >
                <Form
                  form={mirrorForm}
                  layout="vertical"
                  onFinish={saveMirrors}
                >
                  <Form.List
                    name="mirrors"
                    rules={[
                      {
                        validator: async (_, list: MirrorSource[]) => {
                          if (!list?.length)
                            throw new Error("请至少保留一个软件源");
                          if (list.length > 32)
                            throw new Error("最多添加 32 个软件源");
                        },
                      },
                    ]}
                  >
                    {(fields, { add, remove }, { errors }) => (
                      <>
                        <div className="mirror-list-header">
                          <span>镜像名称</span>
                          <span>HTTPS 地址</span>
                          <span />
                        </div>
                        {fields.map(({ key, name, ...rest }) => (
                          <div className="mirror-row" key={key}>
                            <Form.Item
                              {...rest}
                              name={[name, "name"]}
                              rules={[
                                {
                                  required: true,
                                  whitespace: true,
                                  message: "请填写名称",
                                },
                                { max: 80 },
                              ]}
                            >
                              <Input
                                aria-label="镜像名称"
                                placeholder="例如 南京大学"
                                maxLength={80}
                              />
                            </Form.Item>
                            <Form.Item
                              {...rest}
                              name={[name, "url"]}
                              rules={[
                                {
                                  required: true,
                                  whitespace: true,
                                  message: "请填写地址",
                                },
                                { type: "url", message: "请输入有效地址" },
                                {
                                  pattern: /^https:\/\//,
                                  message: "请使用 HTTPS",
                                },
                              ]}
                            >
                              <Input
                                aria-label="镜像地址"
                                placeholder="https://example.com/immortalwrt"
                              />
                            </Form.Item>
                            <Tooltip title="删除">
                              <Button
                                aria-label="删除软件源"
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                disabled={fields.length === 1}
                                onClick={() => remove(name)}
                              />
                            </Tooltip>
                          </div>
                        ))}
                        <Form.ErrorList errors={errors} />
                        <Button
                          icon={<PlusOutlined />}
                          onClick={() => add({ name: "", url: "" })}
                          disabled={fields.length >= 32}
                        >
                          添加软件源
                        </Button>
                      </>
                    )}
                  </Form.List>
                  <div className="mirror-actions">
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={savingMirrors}
                    >
                      保存设置
                    </Button>
                  </div>
                </Form>
              </Card>
            </>
          )}
          {page === "environment" && (
            <>
              <Flex justify="space-between" className="page-title">
                <div>
                  <Title level={3}>构建环境</Title>
                  <Text type="secondary">检查本机容器环境。</Text>
                </div>
                {refresh}
              </Flex>
              <Card
                title={env?.name || "容器环境"}
                extra={
                  <Tag color={env?.available ? "success" : "default"}>
                    {checkingEnv
                      ? "检查中"
                      : !env
                        ? "未检查"
                        : env.available
                          ? "基本可访问"
                          : "需要处理"}
                  </Tag>
                }
              >
                <Space orientation="vertical" className="full" size="middle">
                  {!checkingEnv && env && !env.available && (
                    <Alert
                      type="info"
                      showIcon
                      title={
                        env.name === "WSL Containers"
                          ? "请安装或更新 WSL Containers。"
                          : "请检查 Docker 是否已安装、启动且当前用户有访问权限。"
                      }
                      description={env?.message}
                    />
                  )}
                  {env?.name === "WSL Containers" && (
                    <Paragraph type="secondary">
                      无需单独安装 Linux 发行版；安装可能需要管理员权限并重启。
                    </Paragraph>
                  )}
                  {env?.name === "WSL Containers" && !env.available && (
                    <Button
                      loading={installing}
                      onClick={async () => {
                        setInstalling(true);
                        try {
                          const x = await api<{ message: string }>(
                            "/environment/install-wsl",
                            { method: "POST" },
                          );
                          void message.info(x.message);
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
                  )}
                </Space>
              </Card>
            </>
          )}
          {page === "settings" && (
            <>
              <div className="page-title">
                <Title level={3}>设置</Title>
                <Text type="secondary">配置网络访问并查看本地数据目录。</Text>
              </div>
              <Space orientation="vertical" size="middle" className="full">
                <Card title="查询代理">
                  <Form layout="vertical">
                    <Form.Item label="代理类型">
                      <Select
                        value={proxyType}
                        onChange={setProxyType}
                        options={[
                          { value: "none", label: "不使用" },
                          { value: "http", label: "HTTP" },
                          { value: "socks5", label: "SOCKS5" },
                        ]}
                      />
                    </Form.Item>
                    {proxyType !== "none" && (
                      <Form.Item
                        label="代理地址"
                        extra="填写地址和端口，例如 127.0.0.1:7890。"
                      >
                        <Input
                          value={proxyAddress}
                          onChange={(e) => setProxyAddress(e.target.value)}
                          placeholder="127.0.0.1:7890"
                        />
                      </Form.Item>
                    )}
                    <Paragraph type="secondary">
                      用于查询版本、设备、软件索引和 Docker Hub
                      摘要；容器镜像拉取不使用此代理。
                    </Paragraph>
                    <Button
                      type="primary"
                      loading={savingProxy}
                      onClick={saveProxy}
                    >
                      保存设置
                    </Button>
                  </Form>
                </Card>
                <Card title="Docker Hub 镜像加速">
                  <Form layout="vertical">
                    <Form.Item
                      label="镜像仓库前缀"
                      extra="可选，例如 mirror.example.com；留空直接使用 Docker Hub。加速失败时不会自动回退；获取镜像摘要仍需访问 Docker Hub。"
                    >
                      <Input
                        value={registry}
                        placeholder="留空使用 Docker Hub"
                        onChange={(e) => setRegistry(e.target.value)}
                      />
                    </Form.Item>
                    <Button type="primary" onClick={saveRegistry}>
                      保存设置
                    </Button>
                  </Form>
                </Card>
                <Card title="本地数据">
                  <Descriptions
                    column={1}
                    items={[
                      { key: "data", label: "数据目录", children: dataDir },
                      {
                        key: "mirror",
                        label: "当前软件源",
                        children: draft.mirror,
                      },
                      {
                        key: "env",
                        label: "构建环境",
                        children: env?.name || "未检查",
                      },
                    ]}
                  />
                </Card>
              </Space>
            </>
          )}
        </Content>
      </Layout>
    </Layout>
  );
}
export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <Workspace />
      </AntApp>
    </ConfigProvider>
  );
}
