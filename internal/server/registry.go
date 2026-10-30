package server

import (
	"fmt"
	"regexp"
	"strings"
)

var registryPart = regexp.MustCompile(`^[a-z0-9]+(?:[._-][a-z0-9]+)*$`)
var registryHost = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?$`)

// Registry prefixes are image reference prefixes, not arbitrary URLs.
func normalizeRegistry(input string) (string, error) {
	v := strings.TrimSpace(input)
	if v == "" {
		return "", nil
	}
	v = strings.TrimPrefix(v, "https://")
	v = strings.TrimSuffix(v, "/")
	if len(v) > 255 || strings.Contains(v, "://") || strings.ContainsAny(v, "@?#%\\") {
		return "", fmt.Errorf("请输入 HTTPS 镜像仓库前缀")
	}
	parts := strings.Split(v, "/")
	host := parts[0]
	if !registryHost.MatchString(host) || (!strings.ContainsAny(host, ".:") && host != "localhost") || strings.Contains(host, "..") {
		return "", fmt.Errorf("镜像仓库地址无效")
	}
	for _, part := range parts[1:] {
		if !registryPart.MatchString(part) {
			return "", fmt.Errorf("镜像仓库路径无效")
		}
	}
	return v, nil
}
func imageReference(prefix, canonical string) string {
	if prefix == "" {
		return canonical
	}
	return prefix + "/" + canonical
}
