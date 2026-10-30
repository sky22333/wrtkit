# WrtKit

WrtKit 是一个本地运行的 ImmortalWrt 固件可视化构建工具。选择设备和软件包，配置网络与系统选项，即可使用 ImageBuilder 构建固件。


## 使用

- Windows：安装支持 WSL Containers 的 WSL，无需安装 Linux 发行版。
- Linux：安装并启动 Docker Engine，确保当前用户可以访问 Docker socket。
- 运行 WrtKit 后，在浏览器打开 `http://127.0.0.1:8088`，按页面提示选择软件源、版本、设备和软件包，然后开始构建。

构建记录、日志和固件默认保存在运行目录的 `data` 文件夹，可在历史记录中查看和清理。可通过 `-data-dir` 指定数据目录。管理页面没有用户认证，请仅在本机使用。

## 网络设置

- 软件源可在页面选择和管理，构建及固件运行时默认使用所选软件源。
- 系统设置支持 HTTP 和 SOCKS5 查询代理，用于获取版本、设备、软件索引和 Docker Hub 镜像摘要。
- 拉取 ImageBuilder 镜像由 WSLc 或 Docker Engine 完成，不使用查询代理；可设置 Docker Hub 镜像加速地址。

## 从源码构建

需要 Go 1.26、Node.js 24 和 npm：

```sh
cd web
npm ci
npm run build
cd ..
go build -o dist/wrtkit ./cmd/wrtkit
```

Windows 可将输出文件名改为 `dist/wrtkit.exe`。
