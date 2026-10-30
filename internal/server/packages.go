package server

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

type packageItem struct {
	Name     string `json:"name"`
	Version  string `json:"version"`
	Feed     string `json:"feed"`
	Category string `json:"category"`
}
type packageIndex struct {
	Architecture string            `json:"architecture"`
	Packages     map[string]string `json:"packages"`
}

// Package indexes contain no category field; this searchable label is inferred from names.
var proxyName = regexp.MustCompile(`(?i)(proxy|passwall|shadowsocks|ssr|sing-box|singbox|v2ray|xray|hysteria|trojan|tuic|clash|mihomo|nikki|(^|-)dae(d)?($|-)|brook|redsocks|microsocks|socks)`)

func categoryFor(name string) string {
	if proxyName.MatchString(name) {
		return "proxy"
	}
	return ""
}

// Load indexes directly from the selected mirror. Package files are never stored here.
func (a *App) packages(c *gin.Context) {
	m, v, target, id := mirror(c), c.Query("version"), c.Query("target"), c.Query("profile")
	parts := strings.Split(target, "/")
	if !validMirror(m) || !validVersion.MatchString(v) || len(parts) != 2 || !validPart.MatchString(parts[0]) || !validPart.MatchString(parts[1]) || !validPart.MatchString(id) {
		fail(c, 400, "设备参数无效")
		return
	}
	var p struct {
		Arch   string `json:"arch_packages"`
		Kernel struct {
			Version  string `json:"version"`
			Release  string `json:"release"`
			Vermagic string `json:"vermagic"`
		} `json:"linux_kernel"`
		Profiles map[string]any `json:"profiles"`
	}
	if e := a.fetch(c.Request.Context(), m+"/releases/"+v+"/targets/"+target+"/profiles.json", &p); e != nil {
		fail(c, 502, e)
		return
	}
	if _, ok := p.Profiles[id]; !ok || !validPart.MatchString(p.Arch) {
		fail(c, 404, "无法找到设备或软件包架构")
		return
	}
	type result struct {
		feed  string
		index packageIndex
		err   error
	}
	feeds, discoveryWarning := a.discoverFeeds(c.Request.Context(), m+"/releases/"+v+"/packages/"+p.Arch+"/feeds.conf")
	ch := make(chan result, len(feeds)+2)
	var wg sync.WaitGroup
	get := func(ctx context.Context, feed, u string) {
		defer wg.Done()
		var idx packageIndex
		e := a.fetch(ctx, u, &idx)
		if e == nil && idx.Packages == nil {
			e = fmt.Errorf("索引格式无效")
		}
		ch <- result{feed, idx, e}
	}
	for _, feed := range feeds {
		wg.Add(1)
		go get(c.Request.Context(), feed, m+"/releases/"+v+"/packages/"+p.Arch+"/"+feed+"/index.json")
	}
	wg.Add(1)
	go get(c.Request.Context(), "target", m+"/releases/"+v+"/targets/"+target+"/packages/index.json")
	if validPart.MatchString(p.Kernel.Version) && validPart.MatchString(p.Kernel.Release) && validPart.MatchString(p.Kernel.Vermagic) {
		kernel := p.Kernel.Version + "-" + p.Kernel.Release + "-" + p.Kernel.Vermagic
		wg.Add(1)
		go get(c.Request.Context(), "kmods", m+"/releases/"+v+"/targets/"+target+"/kmods/"+kernel+"/index.json")
	}
	wg.Wait()
	close(ch)
	items := make([]packageItem, 0)
	warnings := make([]string, 0)
	if discoveryWarning != "" {
		warnings = append(warnings, discoveryWarning)
	}
	for r := range ch {
		if r.err != nil {
			warnings = append(warnings, r.feed+": "+r.err.Error())
			continue
		}
		for name, version := range r.index.Packages {
			if validPart.MatchString(name) {
				items = append(items, packageItem{name, version, r.feed, categoryFor(name)})
			}
		}
	}
	if len(items) == 0 {
		fail(c, http.StatusBadGateway, "未能读取软件包索引："+strings.Join(warnings, "；"))
		return
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Name == items[j].Name {
			return items[i].Feed < items[j].Feed
		}
		return items[i].Name < items[j].Name
	})
	sort.Strings(warnings)
	c.JSON(200, gin.H{"arch": p.Arch, "items": items, "warnings": warnings})
}

func parseFeeds(data string) []string {
	seen := map[string]bool{}
	var out []string
	for _, line := range strings.Split(data, "\n") {
		f := strings.Fields(line)
		if len(f) < 3 || !strings.HasPrefix(f[0], "src-") || !validPart.MatchString(f[1]) || seen[f[1]] {
			continue
		}
		seen[f[1]] = true
		out = append(out, f[1])
		if len(out) == 32 {
			break
		}
	}
	return out
}
func (a *App) discoverFeeds(ctx context.Context, u string) ([]string, string) {
	fallback := []string{"base", "luci", "packages", "routing", "telephony"}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err == nil {
		var resp *http.Response
		resp, err = a.client.Do(req)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				var data []byte
				data, err = io.ReadAll(io.LimitReader(resp.Body, 256<<10))
				if err == nil {
					feeds := parseFeeds(string(data))
					if len(feeds) > 0 {
						return feeds, ""
					}
				}
			}
		}
	}
	return fallback, "未能读取上游软件源清单，使用常见源列表"
}
