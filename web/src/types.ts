export type Device = { id: string; target: string; title: string };
export type Profile = {
  default_packages: string[];
  device_packages: string[];
  arch: string;
  revision: string;
  rootfs_supported: boolean;
};
export type Build = {
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
export type Job = {
  id: string;
  status: string;
  stage: string;
  error: string;
  created: string;
  request: Build;
};
export type Artifact = { name: string; size: number };
export type Cleanup = {
  id: string;
  path: string;
  bytes: number;
  image: string;
};
export type Package = {
  name: string;
  version: string;
  feed: string;
  category: string;
};
export type MirrorSource = { name: string; url: string };
export type Environment = { name: string; available: boolean; message: string };
