package runtime

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"strings"
)

func (d *Docker) RemoveImage(ctx context.Context, ref string) error {
	if err := d.negotiate(ctx); err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, "http://docker/"+d.api+"/images/"+url.PathEscape(ref)+"?force=0", nil)
	if err != nil {
		return err
	}
	r, err := d.http.Do(req)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if r.StatusCode == http.StatusNotFound {
		return nil
	}
	if r.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(r.Body, 8192))
		return fmt.Errorf("Docker API %d: %s", r.StatusCode, b)
	}
	return nil
}
func (*WSL) RemoveImage(ctx context.Context, ref string) error {
	out, err := exec.CommandContext(ctx, wslcPath(), "image", "remove", ref).CombinedOutput()
	if err != nil {
		if strings.Contains(string(out), "WSLC_E_IMAGE_NOT_FOUND") {
			return nil
		}
		return fmt.Errorf("镜像清理失败: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}
