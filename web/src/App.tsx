import { initialBuild } from "./defaults";
import { ReviewStep } from "./ReviewStep";
import { PackagesStep } from "./PackagesStep";
import { DeviceStep } from "./DeviceStep";
import { FirmwareConfigStep } from "./FirmwareConfigStep";
import { HistoryPage } from "./HistoryPage";
import { SourcesPage } from "./SourcesPage";
import { EnvironmentPage } from "./EnvironmentPage";
import type {
  Device,
  Profile,
  Build,
  Job,
  Artifact,
  Cleanup,
  Package,
  MirrorSource,
  Environment,
} from "./types";
import { api } from "./api";
import { SettingsPage } from "./SettingsPage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  ConfigProvider,
  Flex,
  Form,
  Layout,
  List,
  Menu,
  Space,
  Steps,
  Tooltip,
  Typography,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  AppstoreOutlined,
  BuildOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  HddOutlined,
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
const { Title, Text } = Typography;

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
  const [draft, setDraft] = useState<Build>(initialBuild);
  const [mirrors, setMirrors] = useState<MirrorSource[]>([]);
  const [mirrorForm] = Form.useForm<{ mirrors: MirrorSource[] }>();
  const [savingMirrors, setSavingMirrors] = useState(false);
  const [registry, setRegistry] = useState("");
  const [ecosystem, setEcosystem] = useState("immortalwrt");
  const [switchingEcosystem, setSwitchingEcosystem] = useState(false);
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
      ecosystem: string;
      mirrors: MirrorSource[];
      registry: string;
      proxy: string;
      data_dir: string;
    }>("/settings")
      .then((x) => {
        setEcosystem(x.ecosystem);
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
    if (!draft.mirror) return;
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
          if (ecosystem === "openwrt" && x.items.some((p) => p.name === "luci"))
            defaults.packages.push("luci");
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
  }, [
    step,
    draft.version,
    draft.target,
    draft.profile,
    draft.mirror,
    ecosystem,
    error,
  ]);
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
          ecosystem,
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
  const changeEcosystem = async (value: string) => {
    setSwitchingEcosystem(true);
    try {
      const settings = await api<{
        ecosystem: string;
        mirrors: MirrorSource[];
      }>("/settings/ecosystem", {
        method: "PUT",
        body: JSON.stringify({ ecosystem: value }),
      });
      setEcosystem(settings.ecosystem);
      setMirrors(settings.mirrors);
      mirrorForm.setFieldsValue({ mirrors: settings.mirrors });
      initializedDevice.current = false;
      setDraft({ ...initialBuild, mirror: settings.mirrors[0].url });
      setProfile(null);
      setPackageData([]);
      setPackageWarnings([]);
      setDeviceVersion("");
      setVersions([]);
      setDevices([]);
      setTotal(0);
      setDevicePage(1);
      setStep(0);
      setJob(null);
      void message.success("固件生态已切换");
    } catch (e) {
      error(e);
    } finally {
      setSwitchingEcosystem(false);
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
          <Space size="small">
            <Badge
              status={
                checkingEnv
                  ? "processing"
                  : env?.available
                    ? "success"
                    : env
                      ? "error"
                      : "default"
              }
              text={
                checkingEnv
                  ? "检查中"
                  : env?.available
                    ? "环境就绪"
                    : env
                      ? "环境不可用"
                      : "环境待检查"
              }
            />
            <Tooltip title="检查构建环境">
              <Button
                type="text"
                aria-label="检查构建环境"
                icon={<ReloadOutlined />}
                onClick={environment}
              />
            </Tooltip>
          </Space>
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
                    选择设备与软件，配置并构建{" "}
                    {ecosystem === "openwrt" ? "OpenWrt" : "ImmortalWrt"} 固件。
                  </Text>
                </div>
                <Button
                  icon={<HistoryOutlined />}
                  onClick={() => setPage("history")}
                >
                  构建记录
                </Button>
              </Flex>
              <Card className="build-workspace">
                {step < 4 && (
                  <Steps
                    size="small"
                    className="build-steps"
                    current={Math.min(step, 3)}
                    items={[
                      { title: "选择设备", icon: <HddOutlined /> },
                      { title: "选择软件", icon: <AppstoreOutlined /> },
                      { title: "配置固件", icon: <SettingOutlined /> },
                      { title: "确认构建", icon: <CheckCircleOutlined /> },
                    ]}
                  />
                )}
                <div className="step-content" key={step}>
                  {step === 0 && (
                    <DeviceStep
                      draft={draft}
                      patch={patch}
                      mirrors={mirrors}
                      versions={versions}
                      deviceVersion={deviceVersion}
                      setDeviceVersion={setDeviceVersion}
                      setProfile={setProfile}
                      setVersions={setVersions}
                      setDevices={setDevices}
                      setTotal={setTotal}
                      setDevicePage={setDevicePage}
                      query={query}
                      setQuery={setQuery}
                      devicePage={devicePage}
                      loadingDevices={loadingDevices}
                      devices={devices}
                      total={total}
                      choose={choose}
                    />
                  )}
                  {step === 1 && (
                    <PackagesStep
                      draft={draft}
                      packageWarnings={packageWarnings}
                      selectedPackages={selectedPackages}
                      defaultSet={defaultSet}
                      automaticTranslations={automaticTranslations}
                      selectPackage={selectPackage}
                      toggleDefault={toggleDefault}
                      packageData={packageData}
                      availableNames={availableNames}
                      packageFeed={packageFeed}
                      setPackageFeed={setPackageFeed}
                      packageSearch={packageSearch}
                      setPackageSearch={setPackageSearch}
                      loadingPackages={loadingPackages}
                      categorizedPackages={categorizedPackages}
                      additionalCount={additionalCount}
                    />
                  )}
                  {step === 2 && (
                    <FirmwareConfigStep
                      draft={draft}
                      patch={patch}
                      profile={profile}
                      wirelessSupported={wirelessSupported}
                      pppSupported={pppSupported}
                    />
                  )}
                  {step === 3 && (
                    <ReviewStep
                      draft={draft}
                      additionalCount={additionalCount}
                      wirelessSupported={wirelessSupported}
                      pppSupported={pppSupported}
                      env={env}
                    />
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
            <HistoryPage
              jobs={jobs}
              refresh={refresh}
              statuses={statuses}
              showJob={showJob}
              cleanup={cleanup}
            />
          )}
          {page === "sources" && (
            <SourcesPage
              mirrorForm={mirrorForm}
              saveMirrors={saveMirrors}
              savingMirrors={savingMirrors}
            />
          )}
          {page === "environment" && (
            <EnvironmentPage
              env={env}
              checkingEnv={checkingEnv}
              environment={environment}
              error={error}
              refresh={refresh}
            />
          )}
          {page === "settings" && (
            <SettingsPage
              ecosystem={ecosystem}
              switchingEcosystem={switchingEcosystem}
              changeEcosystem={changeEcosystem}
              proxyType={proxyType}
              setProxyType={setProxyType}
              proxyAddress={proxyAddress}
              setProxyAddress={setProxyAddress}
              savingProxy={savingProxy}
              saveProxy={saveProxy}
              registry={registry}
              setRegistry={setRegistry}
              saveRegistry={saveRegistry}
              dataDir={dataDir}
              mirror={draft.mirror}
              environmentName={env?.name || "未检查"}
            />
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
