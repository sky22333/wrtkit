package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

var imageDigest = regexp.MustCompile(`^sha256:[a-f0-9]{64}$`)

func imageTag(b Build) string {
	version := b.Version
	if b.Ecosystem != openwrt {
		version = "openwrt-" + b.Version
	}
	if strings.HasSuffix(b.Version, "-SNAPSHOT") {
		version = b.Version
	}
	return strings.ReplaceAll(b.Target, "/", "-") + "-" + version
}

// Preflight verifies that the selected profile exists and pins the image pulled by the runtime.
func (a *App) preflight(ctx context.Context, b Build) (string, string, error) {
	var profile struct {
		Profiles map[string]json.RawMessage `json:"profiles"`
		Revision string                     `json:"version_code"`
		Arch     string                     `json:"arch_packages"`
	}
	if err := a.fetch(ctx, b.Mirror+"/releases/"+b.Version+"/targets/"+b.Target+"/profiles.json", &profile); err != nil {
		return "", "", fmt.Errorf("读取设备资料失败: %w", err)
	}
	if _, ok := profile.Profiles[b.Profile]; !ok {
		return "", "", fmt.Errorf("所选版本与平台不包含设备 %s", b.Profile)
	}
	if b.RootFSSize > 0 && !diskImage(profile.Profiles[b.Profile]) {
		return "", "", fmt.Errorf("此设备资料中没有可调整根分区的磁盘镜像")
	}
	if !validPart.MatchString(profile.Revision) {
		return "", "", fmt.Errorf("设备资料未提供有效的版本修订号")
	}
	if b.Theme != "" {
		if !validPart.MatchString(profile.Arch) {
			return "", "", fmt.Errorf("设备资料缺少软件包架构")
		}
		var idx packageIndex
		if err := a.fetch(ctx, b.Mirror+"/releases/"+b.Version+"/packages/"+profile.Arch+"/luci/index.json", &idx); err != nil {
			return "", "", fmt.Errorf("读取主题目录失败: %w", err)
		}
		if _, ok := idx.Packages[b.Theme]; !ok {
			return "", "", fmt.Errorf("当前版本的软件源没有主题 %s", b.Theme)
		}
	}
	tag := imageTag(b)
	var image struct {
		Digest string `json:"digest"`
	}
	repo := "immortalwrt/imagebuilder"
	if b.Ecosystem == openwrt {
		repo = "openwrt/imagebuilder"
	}
	if err := a.fetch(ctx, a.hubBase+"/v2/repositories/"+repo+"/tags/"+url.PathEscape(tag), &image); err != nil {
		return "", "", fmt.Errorf("Docker Hub 中无法确认镜像 %s: %w", tag, err)
	}
	if !imageDigest.MatchString(image.Digest) {
		return "", "", fmt.Errorf("Docker Hub 未返回有效的镜像摘要")
	}
	return repo + "@" + image.Digest, profile.Revision, nil
}
