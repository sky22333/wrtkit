package runtime

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type Spec struct {
	Image, Profile, Packages, Mirror, Revision string
	RootFSSize                                 int
	JobID                                      string
	Files                                      map[string][]byte
}
type Engine interface {
	Check(context.Context) error
	RemoveImage(context.Context, string) error
	RemoveJobContainer(context.Context, string) error
	Run(context.Context, Spec, io.Writer, string) error
}

func Current() Engine {
	if runtime.GOOS == "windows" {
		return &WSL{}
	}
	return NewDocker()
}

type Docker struct {
	http      *http.Client
	api       string
	configErr error
}

func NewDocker() *Docker {
	host := os.Getenv("DOCKER_HOST")
	if host != "" && !strings.HasPrefix(host, "unix://") {
		return &Docker{configErr: fmt.Errorf("只支持 Unix socket 形式的 DOCKER_HOST")}
	}
	path := strings.TrimPrefix(host, "unix://")
	if path == "" {
		path = "/var/run/docker.sock"
	}
	t := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", path)
	}}
	return &Docker{http: &http.Client{Transport: t}, api: "v1.41"}
}
func (d *Docker) req(ctx context.Context, method, path string, body io.Reader, typ string) (*http.Response, error) {
	if d.configErr != nil {
		return nil, d.configErr
	}
	r, e := http.NewRequestWithContext(ctx, method, "http://docker/"+d.api+path, body)
	if e != nil {
		return nil, e
	}
	if typ != "" {
		r.Header.Set("Content-Type", typ)
	}
	res, e := d.http.Do(r)
	if e != nil {
		return nil, e
	}
	if res.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 8192))
		res.Body.Close()
		return nil, fmt.Errorf("Docker API %d: %s", res.StatusCode, b)
	}
	return res, nil
}
func (d *Docker) negotiate(ctx context.Context) error {
	if d.configErr != nil {
		return d.configErr
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://docker/version", nil)
	if err != nil {
		return err
	}
	res, err := d.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("读取 Docker API 版本失败: HTTP %d", res.StatusCode)
	}
	var v struct {
		API string `json:"ApiVersion"`
		Min string `json:"MinAPIVersion"`
	}
	if err = json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&v); err != nil {
		return err
	}
	var major, minor int
	if _, err = fmt.Sscanf(v.API, "%d.%d", &major, &minor); err != nil || major != 1 || minor < 41 || minor > 999 {
		return fmt.Errorf("不支持的 Docker API 版本 %q", v.API)
	}
	d.api = fmt.Sprintf("v%d.%d", major, minor)
	return nil
}
func (d *Docker) Check(ctx context.Context) error {
	if err := d.negotiate(ctx); err != nil {
		return err
	}
	r, e := d.req(ctx, "GET", "/_ping", nil, "")
	if e == nil {
		r.Body.Close()
	}
	return e
}
func (d *Docker) Run(ctx context.Context, s Spec, logs io.Writer, out string) error {
	if err := d.negotiate(ctx); err != nil {
		return err
	}
	r, e := d.req(ctx, "POST", "/images/create?fromImage="+url.QueryEscape(s.Image), nil, "")
	if e != nil {
		return e
	}
	dec := json.NewDecoder(r.Body)
	for {
		var event struct {
			Status      string `json:"status"`
			Error       string `json:"error"`
			ErrorDetail struct {
				Message string `json:"message"`
			} `json:"errorDetail"`
		}
		e = dec.Decode(&event)
		if e == io.EOF {
			e = nil
			break
		}
		if e != nil {
			break
		}
		if event.Status != "" {
			fmt.Fprintln(logs, event.Status)
		}
		if event.Error != "" {
			e = fmt.Errorf("拉取镜像失败: %s", event.Error)
			break
		}
		if event.ErrorDetail.Message != "" {
			e = fmt.Errorf("拉取镜像失败: %s", event.ErrorDetail.Message)
			break
		}
	}
	r.Body.Close()
	if e != nil {
		return e
	}
	payload := map[string]any{"Labels": map[string]string{"io.wrtkit.job": s.JobID}, "Image": s.Image, "Cmd": []string{"sh", "/tmp/wrtkit/run.sh"}, "Env": []string{fmt.Sprintf("WRT_ROOTFS_SIZE=%d", s.RootFSSize), "WRT_REVISION=" + s.Revision, "WRT_PROFILE=" + s.Profile, "WRT_PACKAGES=" + s.Packages, "WRT_MIRROR=" + s.Mirror}, "HostConfig": map[string]any{"CapDrop": []string{"ALL"}, "SecurityOpt": []string{"no-new-privileges"}}}
	b, _ := json.Marshal(payload)
	createPath := "/containers/create"
	if s.JobID != "" {
		createPath += "?name=" + url.QueryEscape(jobContainerName(s.JobID))
	}
	r, e = d.req(ctx, "POST", createPath, bytes.NewReader(b), "application/json")
	if e != nil {
		return e
	}
	var created struct {
		ID string `json:"Id"`
	}
	e = json.NewDecoder(r.Body).Decode(&created)
	r.Body.Close()
	if e != nil {
		return e
	}
	id := created.ID
	defer func() {
		c, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		r, e := d.req(c, "DELETE", "/containers/"+id+"?force=1", nil, "")
		if e == nil {
			r.Body.Close()
		}
	}()
	var data bytes.Buffer
	tw := tar.NewWriter(&data)
	for name, contents := range s.Files {
		if e = tw.WriteHeader(&tar.Header{Name: name, Mode: 0644, Size: int64(len(contents))}); e != nil {
			return e
		}
		if _, e = tw.Write(contents); e != nil {
			return e
		}
	}
	tw.Close()
	r, e = d.req(ctx, "PUT", "/containers/"+id+"/archive?path=/tmp", &data, "application/x-tar")
	if e != nil {
		return e
	}
	r.Body.Close()
	r, e = d.req(ctx, "POST", "/containers/"+id+"/start", nil, "")
	if e != nil {
		return e
	}
	r.Body.Close()
	r, e = d.req(ctx, "GET", "/containers/"+id+"/logs?stdout=1&stderr=1&follow=1", nil, "")
	if e != nil {
		return e
	}
	_, e = io.Copy(&dockerLog{w: logs}, r.Body)
	r.Body.Close()
	if e != nil {
		return e
	}
	r, e = d.req(ctx, "POST", "/containers/"+id+"/wait?condition=not-running", nil, "")
	if e != nil {
		return e
	}
	var status struct {
		StatusCode int `json:"StatusCode"`
	}
	e = json.NewDecoder(r.Body).Decode(&status)
	r.Body.Close()
	if e != nil {
		return e
	}
	if status.StatusCode != 0 {
		return fmt.Errorf("构建容器退出，状态码 %d", status.StatusCode)
	}
	r, e = d.req(ctx, "GET", "/containers/"+id+"/archive?path=/tmp/wrtkit-work/output", nil, "")
	if e != nil {
		return e
	}
	defer r.Body.Close()
	return extract(r.Body, out)
}

type dockerLog struct {
	w   io.Writer
	buf []byte
}

func (l *dockerLog) Write(p []byte) (int, error) {
	n := len(p)
	l.buf = append(l.buf, p...)
	for len(l.buf) >= 8 {
		size := int(l.buf[4])<<24 | int(l.buf[5])<<16 | int(l.buf[6])<<8 | int(l.buf[7])
		if size < 0 || size > 16<<20 {
			return n, fmt.Errorf("invalid log frame")
		}
		if len(l.buf) < 8+size {
			break
		}
		if _, err := l.w.Write(l.buf[8 : 8+size]); err != nil {
			return n, err
		}
		l.buf = l.buf[8+size:]
	}
	return n, nil
}
func extract(r io.Reader, out string) error {
	tr := tar.NewReader(r)
	if e := os.MkdirAll(out, 0755); e != nil {
		return e
	}
	for {
		h, e := tr.Next()
		if e == io.EOF {
			return nil
		}
		if e != nil {
			return e
		}
		if h.Typeflag != tar.TypeReg {
			continue
		}
		name := filepath.Base(h.Name)
		if name == "." || name == "" || h.Size > 4<<30 {
			continue
		}
		f, e := os.Create(filepath.Join(out, name))
		if e != nil {
			return e
		}
		_, e = io.Copy(f, tr)
		f.Close()
		if e != nil {
			return e
		}
	}
}

// Hide *os.File from os/exec so child output flows through a parent-owned pipe.
// On Windows this keeps subsequent parent log writes at the actual end of file.
type processLogWriter struct{ io.Writer }

type WSL struct{}

func wslcPath() string {
	if path, err := exec.LookPath("wslc.exe"); err == nil {
		return path
	}
	if runtime.GOOS == "windows" {
		path := filepath.Join(os.Getenv("ProgramFiles"), "WSL", "wslc.exe")
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path
		}
	}
	return "wslc.exe"
}

func (*WSL) Check(ctx context.Context) error {
	c := exec.CommandContext(ctx, wslcPath(), "info")
	out, e := c.CombinedOutput()
	if e != nil {
		return fmt.Errorf("wslc 不可用: %s: %w", strings.TrimSpace(string(out)), e)
	}
	return nil
}
func (*WSL) Run(ctx context.Context, s Spec, logs io.Writer, out string) error {
	binary := wslcPath()
	stream := &processLogWriter{Writer: logs}
	run := func(args ...string) error {
		c := exec.CommandContext(ctx, binary, args...)
		c.Stdout = stream
		c.Stderr = stream
		return c.Run()
	}
	if e := run("pull", s.Image); e != nil {
		return e
	}
	name := fmt.Sprintf("wrtkit-%d", time.Now().UnixNano())
	if s.JobID != "" {
		name = jobContainerName(s.JobID)
	}
	e := run("create", "--name", name, "--label", "io.wrtkit.job="+s.JobID, "-e", fmt.Sprintf("WRT_ROOTFS_SIZE=%d", s.RootFSSize), "-e", "WRT_REVISION="+s.Revision, "-e", "WRT_PROFILE="+s.Profile, "-e", "WRT_PACKAGES="+s.Packages, "-e", "WRT_MIRROR="+s.Mirror, s.Image, "sh", "/tmp/wrtkit/run.sh")
	if e != nil {
		return e
	}
	defer func() {
		c, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		output, err := exec.CommandContext(c, binary, "container", "rm", "-f", name).CombinedOutput()
		if err != nil {
			fmt.Fprintf(logs, "\n清理构建容器失败：%v %s\n", err, strings.TrimSpace(string(output)))
		} else {
			fmt.Fprintln(logs, "\n构建容器已清理")
		}
	}()
	dir, e := os.MkdirTemp("", "wrtkit-input-")
	if e != nil {
		return e
	}
	defer os.RemoveAll(dir)
	for name, b := range s.Files {
		path := filepath.Join(dir, filepath.FromSlash(name))
		if e = os.MkdirAll(filepath.Dir(path), 0755); e != nil {
			return e
		}
		if e = os.WriteFile(path, b, 0600); e != nil {
			return e
		}
	}
	if e = run("container", "cp", filepath.Join(dir, "wrtkit"), name+":/tmp"); e != nil {
		return e
	}
	if e = run("start", "-a", name); e != nil {
		return e
	}
	if e = os.MkdirAll(out, 0755); e != nil {
		return e
	}
	return run("container", "cp", name+":/tmp/wrtkit-work/output/.", out)
}
