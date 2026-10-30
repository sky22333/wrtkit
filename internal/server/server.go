package server

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	_ "modernc.org/sqlite"
	"wrtkit/internal/runtime"
	"wrtkit/internal/web"
)

var zones = map[string]string{"UTC": "UTC0", "Asia/Shanghai": "CST-8", "Asia/Tokyo": "JST-9", "Asia/Hong_Kong": "HKT-8"}

var validPart = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._+,-]*$`)
var validVersion = regexp.MustCompile(`^(23\.(?:0[5-9]|1[0-2])|(?:2[4-9]|[3-9][0-9])\.(?:0[1-9]|1[0-2]))(\.[0-9]+|-SNAPSHOT)$`)

type App struct {
	db      *sql.DB
	dir     string
	client  *http.Client
	hubBase string
	mu      sync.Mutex
	wg      sync.WaitGroup
	closing bool
	active  map[string]context.CancelFunc
	engine  func() runtime.Engine
}
type Build struct {
	Version      string   `json:"version"`
	Target       string   `json:"target"`
	Profile      string   `json:"profile"`
	Device       string   `json:"device"`
	Packages     []string `json:"packages"`
	Remove       []string `json:"remove"`
	Mirror       string   `json:"mirror"`
	Registry     string   `json:"registry"`
	Hostname     string   `json:"hostname"`
	Address      string   `json:"address"`
	Timezone     string   `json:"timezone"`
	Script       string   `json:"script"`
	Theme        string   `json:"theme"`
	WifiSSID     string   `json:"wifi_ssid"`
	WifiPassword string   `json:"wifi_password"`
	RootPassword string   `json:"root_password"`
	PPPUsername  string   `json:"ppp_username"`
	PPPPassword  string   `json:"ppp_password"`
	RootFSSize   int      `json:"rootfs_size"`
}
type Job struct {
	ID      string `json:"id"`
	Status  string `json:"status"`
	Stage   string `json:"stage"`
	Error   string `json:"error"`
	Created string `json:"created"`
	Request Build  `json:"request"`
}

type userAgentTransport struct{ base http.RoundTripper }

func (t userAgentTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	r := req.Clone(req.Context())
	r.Header = req.Header.Clone()
	if r.Header.Get("User-Agent") == "" {
		r.Header.Set("User-Agent", "WrtKit/1.0")
	}
	return t.base.RoundTrip(r)
}

func New(dir string) (*App, error) {
	if e := os.MkdirAll(filepath.Join(dir, "builds"), 0700); e != nil {
		return nil, e
	}
	db, e := sql.Open("sqlite", filepath.Join(dir, "wrtkit.db"))
	if e != nil {
		return nil, e
	}
	db.SetMaxOpenConns(1)
	_, e = db.Exec(`CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,status TEXT NOT NULL,stage TEXT NOT NULL,error TEXT NOT NULL,created TEXT NOT NULL,request TEXT NOT NULL);CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS managed_images(ref TEXT PRIMARY KEY, owned INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS job_images(job_id TEXT PRIMARY KEY, ref TEXT NOT NULL);UPDATE jobs SET status='interrupted',stage='程序中断',error='程序退出，任务未完成' WHERE status IN ('running','queued');`)
	if e != nil {
		return nil, e
	}
	a := &App{db: db, dir: dir, hubBase: "https://hub.docker.com", engine: runtime.Current, client: &http.Client{Transport: userAgentTransport{http.DefaultTransport}, Timeout: 25 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if forbidden(req.URL.Hostname()) && !(strings.EqualFold(req.URL.Hostname(), "downloads.immortalwrt.org") && len(via) > 0 && strings.EqualFold(via[0].URL.Hostname(), "downloads.immortalwrt.org")) {
			return fmt.Errorf("镜像重定向到未选择的上游服务器")
		}
		if len(via) > 5 {
			return fmt.Errorf("重定向次数过多")
		}
		return nil
	}}, active: map[string]context.CancelFunc{}}
	return a, nil
}
func (a *App) Close() {
	a.mu.Lock()
	a.closing = true
	for _, cancel := range a.active {
		cancel()
	}
	a.mu.Unlock()
	a.wg.Wait()
	a.db.Close()
}
func forbidden(s string) bool {
	h := strings.ToLower(s)
	return h == "immortalwrt.org" || strings.HasSuffix(h, ".immortalwrt.org") || h == "openwrt.ai" || strings.HasSuffix(h, ".openwrt.ai") || h == "immortalwrt.kyarucloud.moe" || h == "sysupgrade.kyarucloud.moe"
}
func validMirror(s string) bool {
	u, e := url.Parse(s)
	return e == nil && u.Scheme == "https" && u.Hostname() != "" && (!forbidden(u.Hostname()) || strings.EqualFold(u.Hostname(), "downloads.immortalwrt.org")) && u.User == nil && u.RawQuery == "" && u.Fragment == "" && regexp.MustCompile(`^/?[A-Za-z0-9._/-]*$`).MatchString(u.EscapedPath()) && !strings.Contains(u.Path, "..")
}
func (a *App) fetch(ctx context.Context, u string, v any) error {
	req, e := http.NewRequestWithContext(ctx, "GET", u, nil)
	if e != nil {
		return e
	}
	resp, e := a.client.Do(req)
	if e != nil {
		return e
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("数据源响应 HTTP %d", resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 24<<20)).Decode(v)
}
func mirror(c *gin.Context) string {
	s := strings.TrimRight(c.Query("mirror"), "/")
	if s == "" {
		s = "https://mirror.nju.edu.cn/immortalwrt"
	}
	return s
}
func (a *App) Router() http.Handler {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery(), func(c *gin.Context) {
		if c.Request.Method != "GET" && c.Request.Method != "HEAD" {
			origin := c.Request.Header.Get("Origin")
			if origin != "" {
				u, e := url.Parse(origin)
				if e != nil || !strings.EqualFold(u.Host, c.Request.Host) {
					c.AbortWithStatusJSON(403, gin.H{"error": "请求来源不匹配"})
					return
				}
			}
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2<<20)
		c.Next()
	})
	api := r.Group("/api")
	api.GET("/environment", a.environment)
	api.POST("/environment/install-wsl", func(c *gin.Context) {
		if e := launchWSLInstall(); e != nil {
			fail(c, 500, e)
			return
		}
		c.JSON(200, gin.H{"message": "已请求启动安装，请完成系统提示，结束后重新检查。"})
	})
	api.GET("/versions", a.versions)
	api.GET("/devices", a.devices)
	api.GET("/profile", a.profile)
	api.GET("/packages", a.packages)
	api.GET("/settings", a.getSettings)
	api.PUT("/settings", a.putSettings)
	api.PUT("/settings/registry", a.putRegistry)
	api.GET("/jobs", a.listJobs)
	api.POST("/jobs", a.createJob)
	api.GET("/jobs/:id", a.getJob)
	api.GET("/jobs/:id/cleanup", a.cleanupPreview)
	api.DELETE("/jobs/:id", a.cleanupJob)
	api.POST("/jobs/:id/cancel", a.cancelJob)
	api.GET("/jobs/:id/log", a.log)
	api.GET("/jobs/:id/files", a.files)
	api.GET("/jobs/:id/files/:name", a.file)
	sub, _ := fs.Sub(web.Assets, "dist")
	server := http.FileServer(http.FS(sub))
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.AbortWithStatusJSON(404, gin.H{"error": "接口不存在"})
			return
		}
		p := strings.TrimPrefix(c.Request.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if _, e := fs.Stat(sub, p); e != nil {
			c.Request.URL.Path = "/"
		}
		server.ServeHTTP(c.Writer, c.Request)
	})
	return r
}
func fail(c *gin.Context, code int, e any) { c.JSON(code, gin.H{"error": fmt.Sprint(e)}) }
func (a *App) environment(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 4*time.Second)
	defer cancel()
	e := a.engine().Check(ctx)
	name := "Docker Engine"
	if os.PathSeparator == '\\' {
		name = "WSL Containers"
	}
	c.JSON(200, gin.H{"name": name, "available": e == nil, "message": fmt.Sprint(e)})
}
func (a *App) versions(c *gin.Context) {
	m := mirror(c)
	if !validMirror(m) {
		fail(c, 400, "镜像地址无效或已禁止")
		return
	}
	var v struct {
		Stable   string   `json:"stable_version"`
		Versions []string `json:"versions_list"`
	}
	if e := a.fetch(c.Request.Context(), m+"/.versions.json", &v); e != nil {
		fail(c, 502, e)
		return
	}
	out := []string{}
	for _, x := range v.Versions {
		if validVersion.MatchString(x) {
			out = append(out, x)
		}
	}
	seen := map[string]bool{}
	candidates := []string{}
	for _, x := range out {
		if i := strings.LastIndex(x, "."); i > 0 {
			candidate := x[:i] + "-SNAPSHOT"
			if !seen[candidate] {
				seen[candidate] = true
				candidates = append(candidates, candidate)
			}
		}
	}
	// Branch snapshots are not listed in .versions.json. Include only branches whose
	// actual overview exists at the selected mirror, preserving release order.
	available := make([]bool, len(candidates))
	var wg sync.WaitGroup
	for i, candidate := range candidates {
		wg.Add(1)
		go func(i int, candidate string) {
			defer wg.Done()
			req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodHead, m+"/releases/"+candidate+"/.overview.json", nil)
			if err != nil {
				return
			}
			resp, err := a.client.Do(req)
			if err != nil {
				return
			}
			defer resp.Body.Close()
			available[i] = resp.StatusCode == http.StatusOK
		}(i, candidate)
	}
	wg.Wait()
	for i, candidate := range candidates {
		if available[i] {
			out = append(out, candidate)
		}
	}
	c.JSON(200, gin.H{"stable": v.Stable, "versions": out})
}
func (a *App) devices(c *gin.Context) {
	m := mirror(c)
	v := c.Query("version")
	q := strings.ToLower(strings.TrimSpace(c.Query("q")))
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page < 1 || page > 100000 {
		fail(c, 400, "页码无效")
		return
	}
	if !validMirror(m) || !validVersion.MatchString(v) {
		fail(c, 400, "版本或镜像地址无效")
		return
	}
	var data struct {
		Profiles []struct {
			ID     string `json:"id"`
			Target string `json:"target"`
			Titles []struct {
				Vendor  string `json:"vendor"`
				Model   string `json:"model"`
				Variant string `json:"variant"`
				Title   string `json:"title"`
			} `json:"titles"`
		} `json:"profiles"`
	}
	if e := a.fetch(c.Request.Context(), m+"/releases/"+v+"/.overview.json", &data); e != nil {
		fail(c, 502, e)
		return
	}
	out := []gin.H{}
	total := 0
	for _, p := range data.Profiles {
		title := p.ID
		if len(p.Titles) > 0 {
			t := p.Titles[0]
			title = strings.TrimSpace(t.Vendor + " " + t.Model + " " + t.Variant)
			if t.Title != "" {
				title = t.Title
			}
		}
		if q != "" && !strings.Contains(strings.ToLower(title+" "+p.ID+" "+p.Target), q) {
			continue
		}
		total++
		if total > (page-1)*100 && len(out) < 100 {
			out = append(out, gin.H{"id": p.ID, "target": p.Target, "title": title})
		}
	}
	c.JSON(200, gin.H{"items": out, "total": total, "page": page, "page_size": 100})
}
func (a *App) profile(c *gin.Context) {
	m := mirror(c)
	v := c.Query("version")
	target := c.Query("target")
	id := c.Query("profile")
	parts := strings.Split(target, "/")
	if !validMirror(m) || !validVersion.MatchString(v) || len(parts) != 2 || !validPart.MatchString(parts[0]) || !validPart.MatchString(parts[1]) || !validPart.MatchString(id) {
		fail(c, 400, "设备参数无效")
		return
	}
	var data struct {
		Default  []string                   `json:"default_packages"`
		Profiles map[string]json.RawMessage `json:"profiles"`
		Arch     string                     `json:"arch_packages"`
		Revision string                     `json:"version_code"`
	}
	if e := a.fetch(c.Request.Context(), m+"/releases/"+v+"/targets/"+target+"/profiles.json", &data); e != nil {
		fail(c, 502, e)
		return
	}
	raw, ok := data.Profiles[id]
	if !ok {
		fail(c, 404, "该版本不包含此设备")
		return
	}
	var p struct {
		Packages []string          `json:"device_packages"`
		Images   []json.RawMessage `json:"images"`
	}
	json.Unmarshal(raw, &p)
	c.JSON(200, gin.H{"default_packages": data.Default, "device_packages": p.Packages, "images": p.Images, "arch": data.Arch, "revision": data.Revision, "rootfs_supported": diskImage(raw)})
}
func (a *App) getSettings(c *gin.Context) {
	var raw string
	err := a.db.QueryRow(`SELECT value FROM settings WHERE key='mirror_sources'`).Scan(&raw)
	sources := defaultMirrors()
	if err == nil {
		if err = json.Unmarshal([]byte(raw), &sources); err != nil {
			fail(c, 500, "软件源配置损坏")
			return
		}
	} else if err != sql.ErrNoRows {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"mirrors": sources, "registry": a.registry(), "data_dir": a.dir})
}
func (a *App) putSettings(c *gin.Context) {
	var input struct {
		Mirrors []mirrorSource `json:"mirrors"`
	}
	if c.ShouldBindJSON(&input) != nil || len(input.Mirrors) == 0 || len(input.Mirrors) > 32 {
		fail(c, 400, "请填写 1 到 32 个软件源")
		return
	}
	seen := make(map[string]bool, len(input.Mirrors))
	for i := range input.Mirrors {
		item := &input.Mirrors[i]
		item.Name = strings.TrimSpace(item.Name)
		item.URL = strings.TrimRight(strings.TrimSpace(item.URL), "/")
		if item.Name == "" || utf8.RuneCountInString(item.Name) > 80 || !validMirror(item.URL) {
			fail(c, 400, "请填写有效的软件源名称和 HTTPS 地址")
			return
		}
		if seen[item.URL] {
			fail(c, 400, "软件源地址不能重复")
			return
		}
		seen[item.URL] = true
	}
	b, err := json.Marshal(input.Mirrors)
	if err != nil {
		fail(c, 500, err)
		return
	}
	if _, err = a.db.Exec(`INSERT INTO settings VALUES('mirror_sources',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, string(b)); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"mirrors": input.Mirrors})
}
func validate(b Build) error {
	parts := strings.Split(b.Target, "/")
	if !validVersion.MatchString(b.Version) || len(parts) != 2 || !validPart.MatchString(parts[0]) || !validPart.MatchString(parts[1]) || !validPart.MatchString(b.Profile) || !validMirror(b.Mirror) {
		return fmt.Errorf("版本、平台、设备或镜像地址无效")
	}
	if len(b.Script) > 128<<10 || !utf8.ValidString(b.Script) {
		return fmt.Errorf("脚本必须为不超过 128 KiB 的 UTF-8 文本")
	}
	for _, p := range append(b.Packages, b.Remove...) {
		if !validPart.MatchString(p) || len(p) > 128 {
			return fmt.Errorf("软件包名称无效: %s", p)
		}
	}
	selected := make(map[string]bool, len(b.Packages))
	for _, p := range b.Packages {
		selected[p] = true
	}
	for _, p := range b.Remove {
		if selected[p] {
			return fmt.Errorf("软件包不能同时添加和移除: %s", p)
		}
	}
	if b.Hostname != "" && (!regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9-]{0,62}$`).MatchString(b.Hostname)) {
		return fmt.Errorf("主机名无效")
	}
	if b.Address != "" {
		ip, _, e := net.ParseCIDR(b.Address)
		if e != nil || ip.To4() == nil {
			return fmt.Errorf("管理地址需使用 IPv4/CIDR 格式")
		}
	}
	if b.Timezone != "" {
		if _, ok := zones[b.Timezone]; !ok {
			return fmt.Errorf("不支持此时区")
		}
	}
	return validateQuick(b)
}
func (a *App) createJob(c *gin.Context) {
	var b Build
	if e := c.ShouldBindJSON(&b); e != nil {
		fail(c, 400, "请求格式无效")
		return
	}
	b.Mirror = strings.TrimRight(b.Mirror, "/")
	b.Registry = a.registry()
	if e := validate(b); e != nil {
		fail(c, 400, e)
		return
	}
	a.mu.Lock()
	if a.closing || len(a.active) > 0 {
		a.mu.Unlock()
		fail(c, 409, "已有构建任务正在运行")
		return
	}
	randb := make([]byte, 12)
	if _, e := rand.Read(randb); e != nil {
		a.mu.Unlock()
		fail(c, 500, e)
		return
	}
	id := hex.EncodeToString(randb)
	ctx, cancel := context.WithCancel(context.Background())
	a.active[id] = cancel
	a.wg.Add(1)
	a.mu.Unlock()
	stored := b
	stored.RootPassword = ""
	stored.WifiPassword = ""
	stored.PPPPassword = ""
	stored.PPPUsername = ""
	raw, _ := json.Marshal(stored)
	_, e := a.db.Exec(`INSERT INTO jobs VALUES(?,?,?,?,?,?)`, id, "queued", "等待构建", "", time.Now().UTC().Format(time.RFC3339), string(raw))
	if e != nil {
		a.mu.Lock()
		delete(a.active, id)
		a.mu.Unlock()
		a.wg.Done()
		cancel()
		fail(c, 500, e)
		return
	}
	go a.execute(ctx, id, b)
	c.JSON(201, gin.H{"id": id})
}
func (a *App) update(id, status, stage, msg string) {
	a.db.Exec(`UPDATE jobs SET status=?,stage=?,error=? WHERE id=?`, status, stage, msg, id)
}
func (a *App) execute(ctx context.Context, id string, b Build) {
	defer a.wg.Done()
	defer func() { a.mu.Lock(); delete(a.active, id); a.mu.Unlock() }()
	dir := filepath.Join(a.dir, "builds", id)
	os.MkdirAll(dir, 0700)
	f, e := os.Create(filepath.Join(dir, "build.log"))
	if e != nil {
		a.update(id, "failed", "准备失败", e.Error())
		return
	}
	defer f.Close()
	a.update(id, "running", "检查设备和构建镜像", "")
	image, revision, e := a.preflight(ctx, b)
	if e != nil {
		status := "failed"
		if ctx.Err() != nil {
			status = "cancelled"
		}
		a.update(id, status, "构建前检查失败", e.Error())
		return
	}
	image = imageReference(b.Registry, image)
	fmt.Fprintln(f, "已确认构建镜像:", image)
	engine := a.engine()
	present, inspectErr := engine.ImagePresent(ctx, image)
	// An unavailable inspection never grants ownership of an existing image.
	ownable := inspectErr == nil && !present
	if inspectErr != nil {
		fmt.Fprintln(f, "无法确认镜像归属，清理时将保留镜像:", inspectErr)
	}
	result, e := a.db.Exec(`INSERT INTO managed_images(ref,owned) VALUES(?,0) ON CONFLICT(ref) DO NOTHING`, image)
	if e != nil {
		a.update(id, "failed", "记录镜像失败", e.Error())
		return
	}
	inserted, e := result.RowsAffected()
	if e != nil {
		a.update(id, "failed", "记录镜像失败", e.Error())
		return
	}
	if _, e = a.db.Exec(`INSERT INTO job_images(job_id,ref) VALUES(?,?)`, id, image); e != nil {
		a.update(id, "failed", "记录镜像失败", e.Error())
		return
	}
	a.update(id, "running", "下载镜像并构建", "")
	pack := append([]string{}, b.Packages...)
	for _, p := range b.Remove {
		pack = append(pack, "-"+p)
	}
	sort.Strings(pack)
	if b.Theme != "" {
		pack = append(pack, b.Theme)
	}
	if b.PPPUsername != "" {
		pack = append(pack, "ppp-mod-pppoe")
	}
	files, e := firmwareFiles(b)
	if e != nil {
		a.update(id, "failed", "生成配置失败", e.Error())
		return
	}
	spec := runtime.Spec{JobID: id, Image: image, Revision: revision, RootFSSize: b.RootFSSize, Profile: b.Profile, Packages: strings.Join(pack, " "), Mirror: b.Mirror, Files: files}
	if ownable && inserted == 1 {
		spec.OnPulled = func() error {
			_, err := a.db.Exec(`UPDATE managed_images SET owned=1 WHERE ref=?`, image)
			return err
		}
	}
	e = engine.Run(ctx, spec, f, filepath.Join(dir, "output"))
	if e != nil {
		status := "failed"
		if ctx.Err() != nil {
			status = "cancelled"
		}
		a.update(id, status, "构建未完成", e.Error())
		return
	}
	entries, readErr := os.ReadDir(filepath.Join(dir, "output"))
	foundFirmware := false
	for _, entry := range entries {
		if !entry.IsDir() && isFirmware(entry.Name()) {
			foundFirmware = true
			break
		}
	}
	if readErr != nil || !foundFirmware {
		a.update(id, "failed", "产物检查失败", "构建结束但没有找到可识别的固件文件")
		return
	}
	a.update(id, "success", "构建完成", "")
}

func firmwareFiles(b Build) (map[string][]byte, error) {
	script, err := quickScript(b)
	if err != nil {
		return nil, err
	}
	files := map[string][]byte{
		"wrtkit/run.sh": []byte(runScript),
		"wrtkit/files/etc/uci-defaults/09-wrtkit-mirror": []byte(mirrorScript(b.Mirror)),
		"wrtkit/files/etc/uci-defaults/10-wrtkit":        []byte(script),
	}
	if b.Theme != "" {
		files["wrtkit/files/etc/uci-defaults/95-wrtkit-theme"] = []byte(themeScript(b.Theme))
	}
	if b.Script != "" {
		files["wrtkit/files/etc/uci-defaults/99-custom.sh"] = []byte(strings.ReplaceAll(b.Script, "\r\n", "\n"))
	}
	return files, nil
}

func isFirmware(name string) bool {
	name = strings.ToLower(name)
	for _, ext := range []string{".bin", ".img", ".img.gz", ".img.zst", ".itb", ".ubi", ".trx", ".chk", ".tar", ".tar.gz", ".tar.zst", ".iso", ".vmdk", ".vdi", ".qcow2", ".zip"} {
		if strings.HasSuffix(name, ext) {
			return true
		}
	}
	return false
}

const runScript = `set -eu
cd /home/build/immortalwrt
if ! grep -Fqx "REVISION:=${WRT_REVISION}" include/version.mk; then echo "构建镜像与软件源的修订号不一致，请更换镜像或稍后重试"; exit 1; fi
mkdir -p /tmp/wrtkit-work/output
cp -R /tmp/wrtkit/files /tmp/wrtkit-work/files
for f in repositories repositories.conf; do
 if [ -f "$f" ]; then
  sed -i "s|https://downloads.immortalwrt.org|${WRT_MIRROR}|g;s|https://immortalwrt.kyarucloud.moe|${WRT_MIRROR}|g;s|https://mirrors.vsean.net/openwrt|${WRT_MIRROR}|g" "$f"
  for url in $(grep -Eo 'https?://[^[:space:]]+' "$f" || true); do
   case "$url" in "$WRT_MIRROR"/*) ;; *) echo "软件源地址不属于所选镜像: $url"; exit 1 ;; esac
  done
 fi
done
chmod 755 /tmp/wrtkit-work/files/etc/uci-defaults/*
if [ "$WRT_ROOTFS_SIZE" -gt 0 ]; then
 make image PROFILE="$WRT_PROFILE" PACKAGES="$WRT_PACKAGES" FILES=/tmp/wrtkit-work/files BIN_DIR=/tmp/wrtkit-work/output ROOTFS_PARTSIZE="$WRT_ROOTFS_SIZE"
else
 make image PROFILE="$WRT_PROFILE" PACKAGES="$WRT_PACKAGES" FILES=/tmp/wrtkit-work/files BIN_DIR=/tmp/wrtkit-work/output
fi
`

func (a *App) job(id string) (Job, error) {
	var j Job
	var raw string
	e := a.db.QueryRow(`SELECT id,status,stage,error,created,request FROM jobs WHERE id=?`, id).Scan(&j.ID, &j.Status, &j.Stage, &j.Error, &j.Created, &raw)
	if e == nil {
		e = json.Unmarshal([]byte(raw), &j.Request)
	}
	return j, e
}
func (a *App) getJob(c *gin.Context) {
	j, e := a.job(c.Param("id"))
	if e != nil {
		fail(c, 404, "任务不存在")
		return
	}
	c.JSON(200, j)
}
func (a *App) listJobs(c *gin.Context) {
	rows, e := a.db.Query(`SELECT id,status,stage,error,created,request FROM jobs ORDER BY created DESC LIMIT 100`)
	if e != nil {
		fail(c, 500, e)
		return
	}
	defer rows.Close()
	out := []Job{}
	for rows.Next() {
		var j Job
		var raw string
		if rows.Scan(&j.ID, &j.Status, &j.Stage, &j.Error, &j.Created, &raw) == nil {
			json.Unmarshal([]byte(raw), &j.Request)
			j.Request.Script = ""
			out = append(out, j)
		}
	}
	c.JSON(200, out)
}
func (a *App) cancelJob(c *gin.Context) {
	a.mu.Lock()
	cancel := a.active[c.Param("id")]
	a.mu.Unlock()
	if cancel == nil {
		fail(c, 409, "任务未运行")
		return
	}
	cancel()
	c.JSON(200, gin.H{"ok": true})
}
func (a *App) log(c *gin.Context) {
	id := c.Param("id")
	if _, e := a.job(id); e != nil {
		fail(c, 404, "任务不存在")
		return
	}
	f, e := os.Open(filepath.Join(a.dir, "builds", id, "build.log"))
	if e != nil {
		c.String(200, "")
		return
	}
	defer f.Close()
	if info, err := f.Stat(); err == nil && info.Size() > 256<<10 {
		_, _ = f.Seek(-(256 << 10), io.SeekEnd)
	}
	data, _ := io.ReadAll(io.LimitReader(f, 256<<10))
	c.Data(200, "text/plain; charset=utf-8", data)
}
func (a *App) files(c *gin.Context) {
	id := c.Param("id")
	j, e := a.job(id)
	if e != nil || j.Status != "success" {
		fail(c, 404, "构建产物不可用")
		return
	}
	entries, e := os.ReadDir(filepath.Join(a.dir, "builds", id, "output"))
	if e != nil {
		fail(c, 500, e)
		return
	}
	out := []gin.H{}
	for _, x := range entries {
		if !x.IsDir() {
			info, err := x.Info()
			if err != nil {
				fail(c, 500, fmt.Errorf("读取产物信息失败: %w", err))
				return
			}
			out = append(out, gin.H{"name": x.Name(), "size": info.Size()})
		}
	}
	c.JSON(200, out)
}
func (a *App) file(c *gin.Context) {
	id := c.Param("id")
	j, e := a.job(id)
	name := c.Param("name")
	if e != nil || j.Status != "success" || name != filepath.Base(name) || strings.ContainsAny(name, "/\\") {
		fail(c, 404, "文件不存在")
		return
	}
	p := filepath.Join(a.dir, "builds", id, "output", name)
	if _, e = os.Stat(p); e != nil {
		fail(c, 404, "文件不存在")
		return
	}
	c.Header("Content-Disposition", "attachment; filename="+strconv.Quote(name))
	c.File(p)
}
