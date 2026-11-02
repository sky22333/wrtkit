import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Stack, Typography } from "@mui/material";
import { retryBody, type BuildAttempt } from "./buildRetry";
import { initialBuild } from "./defaults";
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
import { api, apiText } from "./api";
import {
  availableRecommendations,
  effectiveDefaultPackages,
  hasWirelessDriver,
  resolveChineseTranslations,
  visibleInCategory,
} from "./packageSelection";
import { formatBytes } from "./format";

export function useWorkspace() {
  const [notice, setNotice] = useState<{
    severity: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    detail: ReactNode;
    action: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const notify = useCallback(
    (severity: "success" | "warning" | "error", text: string) =>
      setNotice({ severity, text }),
    [],
  );
  const [starting, setStarting] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<BuildAttempt | null>(null);
  const [page, setPage] = useState("build");
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Build>(initialBuild);
  const [mirrors, setMirrors] = useState<MirrorSource[]>([]);
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
  const [devicePage, setDevicePage] = useState(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const [versionError, setVersionError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [deviceRetry, setDeviceRetry] = useState(0);
  const [packageData, setPackageData] = useState<Package[]>([]);
  const [packageWarnings, setPackageWarnings] = useState<string[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [packageError, setPackageError] = useState("");
  const [packageRetry, setPackageRetry] = useState(0);
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
      void notify("error", e instanceof Error ? e.message : "操作失败");
    },
    [notify],
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
        if (x.mirrors[0]) patch({ mirror: x.mirrors[0].url });
      })
      .catch(error);
  }, [error, patch]);
  useEffect(() => {
    if (!draft.mirror) return;
    const controller = new AbortController();
    api<{ stable: string; versions: string[] }>(
      "/versions?mirror=" + encodeURIComponent(draft.mirror),
      { signal: controller.signal },
    )
      .then((x) => {
        setVersionError("");
        setVersions(x.versions);
        setDeviceVersion((v) => (x.versions.includes(v) ? v : x.stable));
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setVersionError(e instanceof Error ? e.message : "读取版本失败");
      });
    return () => controller.abort();
  }, [draft.mirror, deviceRetry]);
  useEffect(() => {
    if (!deviceVersion || !draft.mirror) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoadingDevices(true);
      const p = new URLSearchParams({
        version: deviceVersion,
        mirror: draft.mirror,
      });
      api<{ items: Device[] }>("/devices?" + p, { signal: controller.signal })
        .then((x) => {
          setDeviceError("");
          setDevices(x.items);
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setDeviceError(e instanceof Error ? e.message : "读取设备失败");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingDevices(false);
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [deviceVersion, draft.mirror, deviceRetry]);
  const filteredDevices = useMemo(() => {
    const search = query.trim().toLowerCase();
    return search
      ? devices.filter((d) =>
          `${d.title} ${d.id} ${d.target}`.toLowerCase().includes(search),
        )
      : devices;
  }, [devices, query]);
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
      .then((value) => {
        setProfileError("");
        setProfile(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setProfile(null);
          setProfileError(e instanceof Error ? e.message : "读取设备配置失败");
        }
      });
    return () => controller.abort();
  }, [draft.version, draft.target, draft.profile, draft.mirror, deviceRetry]);
  useEffect(() => {
    if (step !== 1 || !draft.profile || initializedDevice.current) return;
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
          setPackageError(
            e instanceof Error ? e.message : "软件包目录加载失败",
          );
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
    packageRetry,
  ]);
  useEffect(() => {
    if (page === "history") api<Job[]>("/jobs").then(setJobs).catch(error);
  }, [page, error]);
  const jobId = job?.id;
  const jobStatus = job?.status;
  useEffect(() => {
    if (
      page !== "build" ||
      step !== 4 ||
      !jobId ||
      !jobStatus ||
      !["queued", "running"].includes(jobStatus)
    )
      return;
    const id = jobId;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const [current, text] = await Promise.all([
          api<Job>("/jobs/" + id, { signal: controller.signal }),
          apiText("/jobs/" + id + "/log", { signal: controller.signal }),
        ]);
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
  }, [jobId, jobStatus, page, step, error]);
  useEffect(() => {
    if (
      page !== "build" ||
      step !== 4 ||
      !jobId ||
      !jobStatus ||
      ["queued", "running"].includes(jobStatus)
    )
      return;
    const controller = new AbortController();
    apiText("/jobs/" + jobId + "/log", { signal: controller.signal })
      .then(setLog)
      .catch((e) => {
        if (!controller.signal.aborted) error(e);
      });
    return () => controller.abort();
  }, [jobId, jobStatus, page, step, error]);
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
    if (
      draft.version === deviceVersion &&
      draft.target === d.target &&
      draft.profile === d.id
    )
      return;
    initializedDevice.current = false;
    setProfileError("");
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
    if (step === 0) {
      setPackageError("");
      setLoadingPackages(!initializedDevice.current);
    }
    if (
      step === 1 &&
      (loadingPackages || packageError || packageData.length === 0)
    ) {
      void notify("warning", "请先加载软件包目录");
      return;
    }
    if (
      step === 1 &&
      selectedPackages.some((name) => draft.remove.includes(name))
    ) {
      void notify("warning", "已选软件与移除列表冲突，请先调整默认软件包");
      return;
    }
    if (
      step === 1 &&
      draft.theme &&
      packageData.length > 0 &&
      !availableNames.has(draft.theme)
    ) {
      void notify(
        "warning",
        "当前软件源没有所选主题，请在软件列表中取消或更换",
      );
      return;
    }
    if (step === 2) {
      const size = (s: string) => new TextEncoder().encode(s).length;
      if ((draft.wifi_ssid === "") !== (draft.wifi_password === "")) {
        void notify("warning", "请同时填写 Wi-Fi 名称和密码");
        return;
      }
      if (size(draft.wifi_ssid) > 32) {
        void notify("warning", "Wi-Fi 名称不能超过 32 字节");
        return;
      }
      if (
        draft.wifi_password &&
        (size(draft.wifi_password) < 8 || size(draft.wifi_password) > 63)
      ) {
        void notify("warning", "Wi-Fi 密码必须为 8 到 63 字节");
        return;
      }
      if ((draft.ppp_username === "") !== (draft.ppp_password === "")) {
        void notify("warning", "请同时填写 PPPoE 账号和密码");
        return;
      }
      if (
        draft.rootfs_size &&
        (draft.rootfs_size < 64 || draft.rootfs_size > 32768)
      ) {
        void notify("warning", "根分区大小应为 64 到 32768 MiB");
        return;
      }
      if (draft.remove.includes(draft.theme) && draft.theme) {
        void notify("warning", "不能同时选择和移除同一个主题");
        return;
      }
      if (draft.ppp_username && draft.remove.includes("ppp-mod-pppoe")) {
        void notify("warning", "PPPoE 配置需要 ppp-mod-pppoe 软件包");
        return;
      }
    }
    setStep(step + 1);
  };
  const start = async (previousBody?: string) => {
    if (starting) return;
    setStarting(true);
    try {
      const body =
        previousBody ??
        JSON.stringify({
          ...draft,
          ecosystem,
          packages: additionalPackages,
          ...(wirelessSupported ? {} : { wifi_ssid: "", wifi_password: "" }),
          ...(pppSupported ? {} : { ppp_username: "", ppp_password: "" }),
        });
      const x = await api<{ id: string }>("/jobs", { method: "POST", body });
      setLastAttempt({ jobId: x.id, body });
      setLog("");
      setArtifacts([]);
      const request = JSON.parse(body) as Build;
      setJob({
        id: x.id,
        status: "queued",
        stage: "等待构建",
        error: "",
        created: new Date().toISOString(),
        request: {
          ...request,
          root_password: "",
          wifi_password: "",
          ppp_username: "",
          ppp_password: "",
        },
      });
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
        setDevicePage(1);
      }
      void notify("success", "软件源已保存");
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
      void notify("success", "代理设置已保存");
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
      initializedDevice.current = false;
      setDraft({ ...initialBuild, mirror: settings.mirrors[0].url });
      setProfile(null);
      setPackageData([]);
      setPackageWarnings([]);
      setDeviceVersion("");
      setVersions([]);
      setDevices([]);
      setDevicePage(1);
      setStep(0);
      setJob(null);
      void notify("success", "固件生态已切换");
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
      void notify("success", "镜像加速设置已保存");
    } catch (e) {
      error(e);
    }
  };
  const cleanup = async (j: Job) => {
    try {
      const info = await api<Cleanup>("/jobs/" + j.id + "/cleanup");
      setConfirmation({
        title: "清理构建产物？",
        detail: (
          <Stack spacing={1}>
            <Typography>
              将删除 {formatBytes(info.bytes)} 产物；构建记录和日志保留。
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ overflowWrap: "anywhere" }}
            >
              {info.path}
            </Typography>
            {info.image && (
              <>
                <Typography>
                  将检查构建容器并删除该任务使用的镜像引用，包括此前已存在或其他任务使用的镜像。
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ overflowWrap: "anywhere" }}
                >
                  {info.image}
                </Typography>
              </>
            )}
          </Stack>
        ),
        action: async () => {
          await api("/jobs/" + j.id, { method: "DELETE" });
          notify("success", "清理完成");
          await loadJobs();
          if (job?.id === j.id) {
            setJob(null);
            setStep(0);
            setPage("history");
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
  const newBuild = () => {
    setLastAttempt(null);
    initializedDevice.current = false;
    setDraft({ ...initialBuild, mirror: draft.mirror });
    setProfile(null);
    setPackageData([]);
    setPackageWarnings([]);
    setPackageError("");
    setJob(null);
    setStep(0);
  };
  const retryRequest = job ? retryBody(lastAttempt, job.id) : null;
  return {
    notice,
    setNotice,
    confirmation,
    setConfirmation,
    confirmBusy,
    setConfirmBusy,
    drawerOpen,
    setDrawerOpen,
    starting,
    page,
    setPage,
    step,
    setStep,
    draft,
    patch,
    mirrors,
    savingMirrors,
    registry,
    setRegistry,
    ecosystem,
    switchingEcosystem,
    proxyType,
    setProxyType,
    proxyAddress,
    setProxyAddress,
    savingProxy,
    dataDir,
    versions,
    deviceVersion,
    setDeviceVersion,
    query,
    setQuery,
    setDevices,
    devicePage,
    setDevicePage,
    profile,
    setProfile,
    loadingDevices,
    deviceError,
    versionError,
    profileError,
    setDeviceRetry,
    packageData,
    packageWarnings,
    loadingPackages,
    setLoadingPackages,
    packageError,
    setPackageError,
    setPackageRetry,
    packageSearch,
    setPackageSearch,
    packageFeed,
    setPackageFeed,
    env,
    checkingEnv,
    jobs,
    job,
    artifacts,
    log,
    error,
    environment,
    loadJobs,
    filteredDevices,
    defaultSet,
    automaticTranslations,
    additionalCount,
    selectedPackages,
    wirelessSupported,
    pppSupported,
    availableNames,
    categorizedPackages,
    choose,
    toggleDefault,
    selectPackage,
    nextStep,
    start,
    saveMirrors,
    saveProxy,
    changeEcosystem,
    saveRegistry,
    cleanup,
    showJob,
    newBuild,
    retryRequest,
    setVersions,
  };
}
