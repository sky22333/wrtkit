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

func jobContainerName(id string) string { return "wrtkit-" + id }

func (d *Docker) RemoveJobContainer(ctx context.Context, id string) error {
	if err := d.negotiate(ctx); err != nil {
		return err
	}
	filters, _ := json.Marshal(map[string][]string{"label": {"io.wrtkit.job=" + id}})
	r, err := d.req(ctx, "GET", "/containers/json?all=1&filters="+url.QueryEscape(string(filters)), nil, "")
	if err != nil {
		return err
	}
	defer r.Body.Close()
	var containers []struct {
		ID     string            `json:"Id"`
		Names  []string          `json:"Names"`
		Labels map[string]string `json:"Labels"`
	}
	if err = json.NewDecoder(r.Body).Decode(&containers); err != nil {
		return err
	}
	for _, c := range containers {
		if c.Labels["io.wrtkit.job"] != id {
			continue
		}
		found := false
		for _, n := range c.Names {
			if n == "/"+jobContainerName(id) {
				found = true
			}
		}
		if !found {
			continue
		}
		res, e := d.req(ctx, "DELETE", "/containers/"+url.PathEscape(c.ID)+"?force=1", nil, "")
		if e != nil {
			return e
		}
		res.Body.Close()
	}
	return nil
}
func (*WSL) RemoveJobContainer(ctx context.Context, id string) error {
	binary := wslcPath()
	out, err := exec.CommandContext(ctx, binary, "container", "list", "--all", "--format", "json").Output()
	if err != nil {
		return fmt.Errorf("无法读取容器列表: %w", err)
	}
	dec := json.NewDecoder(strings.NewReader(string(out)))
	for {
		var c struct {
			Names string `json:"Names"`
		}
		err = dec.Decode(&c)
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if c.Names != jobContainerName(id) {
			continue
		}
		out, err = exec.CommandContext(ctx, binary, "container", "inspect", c.Names, "--format", "json").Output()
		if err != nil {
			return err
		}
		var details []struct {
			Config struct {
				Labels map[string]string `json:"Labels"`
			} `json:"Config"`
		}
		if err = json.Unmarshal(out, &details); err != nil {
			return err
		}
		if len(details) != 1 || details[0].Config.Labels["io.wrtkit.job"] != id {
			return fmt.Errorf("同名容器不属于此任务")
		}
		out, err = exec.CommandContext(ctx, binary, "container", "rm", "-f", c.Names).CombinedOutput()
		if err != nil {
			return fmt.Errorf("清理容器失败: %s: %w", strings.TrimSpace(string(out)), err)
		}
	}
}
