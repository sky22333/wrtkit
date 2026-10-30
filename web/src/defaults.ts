import type { Build } from "./types";

export const initialBuild: Build = {
  version: "",
  target: "",
  profile: "",
  device: "",
  packages: [],
  remove: [],
  mirror: "",
  hostname: "WrtKit",
  address: "192.168.2.1/24",
  timezone: "Asia/Shanghai",
  script: "",
  theme: "",
  wifi_ssid: "",
  wifi_password: "",
  root_password: "",
  ppp_username: "",
  ppp_password: "",
  rootfs_size: 0,
};
