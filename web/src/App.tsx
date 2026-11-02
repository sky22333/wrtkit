import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Fade,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Tooltip,
  Typography,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import treasuryTheme from "./mui-treasury/theme";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import GitHubIcon from "@mui/icons-material/GitHub";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { LoginPage } from "./LoginPage";
import { ReviewStep } from "./ReviewStep";
import { PackagesStep } from "./PackagesStep";
import { DeviceStep } from "./DeviceStep";
import { FirmwareConfigStep } from "./FirmwareConfigStep";
import { HistoryPage } from "./HistoryPage";
import { SourcesPage } from "./SourcesPage";
import { EnvironmentPage } from "./EnvironmentPage";
import { SettingsPage } from "./SettingsPage";
import { api } from "./api";
import { formatBytes } from "./format";
import { useWorkspace } from "./useWorkspace";
import TreasuryRoot from "./mui-treasury/layout/Root";
import TreasuryContent from "./mui-treasury/layout/Content";
import "./App.css";

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
  { key: "build", icon: <BuildOutlinedIcon />, label: "固件构建" },
  { key: "history", icon: <HistoryOutlinedIcon />, label: "构建记录" },
  { key: "sources", icon: <CloudOutlinedIcon />, label: "软件源站" },
  { key: "environment", icon: <StorageOutlinedIcon />, label: "构建环境" },
  { key: "settings", icon: <SettingsOutlinedIcon />, label: "系统设置" },
];
function Workspace({ onLogout }: { onLogout: () => void }) {
  const {
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
  } = useWorkspace();
  const refresh = (
    <Tooltip title="刷新">
      <IconButton
        aria-label="刷新"
        onClick={page === "history" ? loadJobs : environment}
      >
        <RefreshOutlinedIcon />
      </IconButton>
    </Tooltip>
  );
  const navigation = (
    <Box
      sx={{
        width: 232,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.sidebar",
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", px: 3, py: 2.5 }}
      >
        <Box
          component="img"
          src="/favicon.svg"
          alt=""
          sx={{ width: 30, height: 30 }}
        />
        <Typography variant="h6">WrtKit</Typography>
      </Stack>
      <Divider />
      <List sx={{ px: 1, py: 2 }}>
        {nav.map((item) => (
          <ListItem key={item.key} disablePadding>
            <ListItemButton
              selected={page === item.key}
              onClick={() => {
                setPage(item.key);
                setDrawerOpen(false);
                if (item.key === "environment") void environment();
              }}
              sx={{ mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Box sx={{ flex: 1 }} />
      <Divider />
      <Stack direction="row" sx={{ px: 2, py: 1 }}>
        <Tooltip title="退出登录">
          <IconButton
            aria-label="退出登录"
            onClick={() =>
              void api("/auth/logout", { method: "POST" })
                .then(onLogout)
                .catch(error)
            }
          >
            <LogoutOutlinedIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="项目 GitHub">
          <IconButton
            aria-label="打开项目 GitHub"
            component="a"
            href="https://github.com/sky22333/wrtkit"
            target="_blank"
            rel="noopener noreferrer"
          >
            <GitHubIcon />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
  return (
    <>
      <TreasuryRoot disableTransition>
        <TreasuryContent>
          <Box sx={{ display: "flex", minHeight: "100dvh" }}>
            <Box
              component="nav"
              aria-label="主导航"
              sx={{
                display: { xs: "none", md: "block" },
                borderRight: 1,
                borderColor: "divider",
                flexShrink: 0,
              }}
            >
              {navigation}
            </Box>
            <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
              {navigation}
            </Drawer>
            <Box
              sx={{
                width: "100%",
                minWidth: 0,
                px: { xs: 2, md: 4 },
                py: { xs: 2, md: 4 },
                bgcolor: "background.paper",
              }}
            >
              <Fade key={page} in timeout={120}>
                <Box sx={{ maxWidth: 1120, mx: "auto" }}>
                  <Box sx={{ display: { xs: "block", md: "none" }, mb: 2 }}>
                    <Tooltip title="打开导航">
                      <IconButton
                        aria-label="打开导航"
                        onClick={() => setDrawerOpen(true)}
                      >
                        <MenuIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  {page === "build" && (
                    <Box>
                      {step < 4 && (
                        <Box
                          sx={{
                            overflowX: "auto",
                            pb: 3,
                            mb: 3,
                            borderBottom: 1,
                            borderColor: "divider",
                          }}
                        >
                          <Stepper activeStep={step} sx={{ minWidth: 520 }}>
                            {[
                              "选择设备",
                              "选择软件",
                              "配置固件",
                              "确认构建",
                            ].map((label) => (
                              <Step key={label}>
                                <StepLabel>{label}</StepLabel>
                              </Step>
                            ))}
                          </Stepper>
                        </Box>
                      )}
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
                          setDevicePage={setDevicePage}
                          query={query}
                          setQuery={setQuery}
                          devicePage={devicePage}
                          loadingDevices={loadingDevices}
                          loadError={
                            versionError || deviceError || profileError
                          }
                          retryLoad={() => setDeviceRetry((value) => value + 1)}
                          devices={filteredDevices}
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
                          packageError={packageError}
                          retryPackages={() => {
                            setPackageError("");
                            setLoadingPackages(true);
                            setPackageRetry((n) => n + 1);
                          }}
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
                        <Stack spacing={2}>
                          <Box>
                            <Stack
                              direction="row"
                              spacing={1}
                              sx={{ alignItems: "center" }}
                            >
                              <Typography variant="h5">
                                {statuses[job.status] || job.status}
                              </Typography>
                              <Chip size="small" label={job.stage} />
                            </Stack>
                            <Typography color="text.secondary">
                              {job.request.device}
                            </Typography>
                          </Box>
                          {["queued", "running"].includes(job.status) && (
                            <LinearProgress />
                          )}
                          {job.error && (
                            <Alert severity="error">{job.error}</Alert>
                          )}
                          {["failed", "cancelled", "interrupted"].includes(
                            job.status,
                          ) &&
                            !retryRequest && (
                              <Alert severity="info">
                                原构建的敏感配置未保存，请新建构建并重新填写配置。
                              </Alert>
                            )}
                          <Box>
                            <Typography variant="subtitle1" sx={{ mb: 1 }}>
                              构建日志
                            </Typography>
                            <Paper
                              component="pre"
                              variant="outlined"
                              className="build-log"
                            >
                              {log || "正在等待构建输出…"}
                            </Paper>
                          </Box>
                          {job.status === "success" && (
                            <Box>
                              <Typography variant="subtitle1">
                                构建产物
                              </Typography>
                              <List>
                                {artifacts.map((a) => (
                                  <ListItem
                                    key={a.name}
                                    disableGutters
                                    secondaryAction={
                                      <Tooltip title="下载">
                                        <IconButton
                                          aria-label={`下载 ${a.name}`}
                                          component="a"
                                          href={`/api/jobs/${job.id}/files/${encodeURIComponent(a.name)}`}
                                        >
                                          <DownloadOutlinedIcon />
                                        </IconButton>
                                      </Tooltip>
                                    }
                                  >
                                    <ListItemText
                                      primary={a.name}
                                      secondary={formatBytes(a.size)}
                                      sx={{ overflowWrap: "anywhere" }}
                                    />
                                  </ListItem>
                                ))}
                              </List>
                              {!artifacts.length && (
                                <Typography color="text.secondary">
                                  没有可下载的产物
                                </Typography>
                              )}
                            </Box>
                          )}
                          {["queued", "running"].includes(job.status) && (
                            <Box>
                              <Button
                                color="error"
                                variant="outlined"
                                onClick={() =>
                                  setConfirmation({
                                    title: "取消当前构建？",
                                    detail: (
                                      <Typography>当前构建将停止。</Typography>
                                    ),
                                    action: async () => {
                                      await api("/jobs/" + job.id + "/cancel", {
                                        method: "POST",
                                      });
                                    },
                                  })
                                }
                              >
                                取消构建
                              </Button>
                            </Box>
                          )}
                        </Stack>
                      )}
                      <Divider sx={{ my: 3 }} />
                      <Stack
                        direction="row"
                        sx={{
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 2,
                        }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          {draft.device && `${draft.device} · ${draft.version}`}
                        </Typography>
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ flexWrap: "wrap", rowGap: 1 }}
                        >
                          {step > 0 && step < 4 && (
                            <Button onClick={() => setStep(step - 1)}>
                              上一步
                            </Button>
                          )}
                          {step < 3 && (
                            <Button
                              variant="contained"
                              disabled={
                                (step === 0 && (!draft.profile || !profile)) ||
                                (step === 1 &&
                                  (loadingPackages ||
                                    !!packageError ||
                                    packageData.length === 0))
                              }
                              onClick={nextStep}
                            >
                              下一步
                            </Button>
                          )}
                          {step === 3 && (
                            <Button
                              variant="contained"
                              disabled={!env?.available || starting}
                              onClick={() => void start()}
                            >
                              {starting ? "正在开始…" : "开始构建"}
                            </Button>
                          )}
                          {step === 4 &&
                            job &&
                            retryRequest &&
                            ["failed", "cancelled", "interrupted"].includes(
                              job.status,
                            ) && (
                              <Button
                                variant="contained"
                                disabled={starting}
                                onClick={() => void start(retryRequest)}
                              >
                                重新构建
                              </Button>
                            )}
                          {step === 4 &&
                            job &&
                            !["queued", "running", "cleaned"].includes(
                              job.status,
                            ) && (
                              <Button
                                color="error"
                                onClick={() => void cleanup(job)}
                              >
                                清理产物
                              </Button>
                            )}
                          {step === 4 &&
                            !["queued", "running"].includes(
                              job?.status || "",
                            ) && <Button onClick={newBuild}>新建构建</Button>}
                        </Stack>
                      </Stack>
                    </Box>
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
                      key={JSON.stringify(mirrors)}
                      mirrors={mirrors}
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
                </Box>
              </Fade>
            </Box>
          </Box>
        </TreasuryContent>
      </TreasuryRoot>
      <Snackbar
        open={!!notice}
        autoHideDuration={5000}
        onClose={() => setNotice(null)}
      >
        {notice ? (
          <Alert severity={notice.severity} onClose={() => setNotice(null)}>
            {notice.text}
          </Alert>
        ) : undefined}
      </Snackbar>
      <Dialog
        open={!!confirmation}
        onClose={() => {
          if (!confirmBusy) setConfirmation(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{confirmation?.title}</DialogTitle>
        <DialogContent>{confirmation?.detail}</DialogContent>
        <DialogActions>
          <Button disabled={confirmBusy} onClick={() => setConfirmation(null)}>
            取消
          </Button>
          <Button
            color="error"
            disabled={confirmBusy}
            onClick={async () => {
              if (!confirmation) return;
              setConfirmBusy(true);
              try {
                await confirmation.action();
                setConfirmation(null);
              } catch (e) {
                error(e);
              } finally {
                setConfirmBusy(false);
              }
            }}
          >
            确认
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
function Authentication() {
  const [status, setStatus] = useState<{
    initialized: boolean;
    authenticated: boolean;
  } | null>(null);
  const [failure, setFailure] = useState("");
  const refresh = useCallback(() => {
    api<{ initialized: boolean; authenticated: boolean }>("/auth/status")
      .then((value) => {
        setFailure("");
        setStatus(value);
      })
      .catch((e: unknown) =>
        setFailure(e instanceof Error ? e.message : "连接失败"),
      );
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("wrtkit-unauthorized", refresh);
    return () => window.removeEventListener("wrtkit-unauthorized", refresh);
  }, [refresh]);
  if (failure)
    return (
      <Box sx={{ p: 3 }}>
        <Alert
          severity="error"
          action={<Button onClick={refresh}>重试</Button>}
        >
          {failure}
        </Alert>
      </Box>
    );
  if (!status)
    return (
      <Box sx={{ p: 4 }}>
        <LinearProgress aria-label="加载中" />
      </Box>
    );
  return status.authenticated ? (
    <Workspace onLogout={refresh} />
  ) : (
    <LoginPage initialized={status.initialized} onLogin={refresh} />
  );
}
export default function App() {
  return (
    <ThemeProvider theme={treasuryTheme}>
      <CssBaseline />
      <Authentication />
    </ThemeProvider>
  );
}
