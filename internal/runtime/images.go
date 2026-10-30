package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os/exec"
	"strings"
)

type imageRecord struct {
	RepoDigests []string `json:"RepoDigests"`
	Digest      string   `json:"Digest"`
}

func sameDigest(ref, candidate string) bool {
	i := strings.LastIndex(ref, "@sha256:")
	if i < 0 {
		return false
	}
	digest := ref[i+1:]
	return candidate == digest || strings.HasSuffix(candidate, "@"+digest)
}

// ImagePresent checks all local image references by digest so an image already
// used under another registry name is never marked as ours.
func (d *Docker) ImagePresent(ctx context.Context, ref string) (bool, error) {
	if err := d.negotiate(ctx); err != nil {
		return false, err
	}
	r, err := d.req(ctx, "GET", "/images/json?all=1&digests=1", nil, "")
	if err != nil {
		return false, err
	}
	defer r.Body.Close()
	var images []imageRecord
	if err = json.NewDecoder(r.Body).Decode(&images); err != nil {
		return false, err
	}
	for _, image := range images {
		for _, digest := range image.RepoDigests {
			if sameDigest(ref, digest) {
				return true, nil
			}
		}
	}
	return false, nil
}
func (d *Docker) RemoveImage(ctx context.Context, ref string) error {
	if err := d.negotiate(ctx); err != nil {
		return err
	}
	r, err := d.req(ctx, "DELETE", "/images/"+url.PathEscape(ref)+"?force=0&noprune=1", nil, "")
	if err != nil {
		return err
	}
	r.Body.Close()
	return nil
}
func (*WSL) ImagePresent(ctx context.Context, ref string) (bool, error) {
	cmd := exec.CommandContext(ctx, wslcPath(), "image", "list", "--all", "--digests", "--no-trunc", "--format", "json")
	out, err := cmd.Output()
	if err != nil {
		return false, fmt.Errorf("无法读取 WSL 镜像列表: %w", err)
	}
	dec := json.NewDecoder(strings.NewReader(string(out)))
	for {
		var r imageRecord
		err = dec.Decode(&r)
		if err == io.EOF {
			return false, nil
		}
		if err != nil {
			return false, fmt.Errorf("无法解析 WSL 镜像列表: %w", err)
		}
		if sameDigest(ref, r.Digest) {
			return true, nil
		}
	}
}
func (*WSL) RemoveImage(ctx context.Context, ref string) error {
	out, err := exec.CommandContext(ctx, wslcPath(), "image", "remove", "--no-prune", ref).CombinedOutput()
	if err != nil {
		return fmt.Errorf("镜像清理失败: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}
