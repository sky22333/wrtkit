package server

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"github.com/gin-gonic/gin"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

var validJobID = regexp.MustCompile(`^[0-9a-f]{24}$`)

type cleanupInfo struct {
	ID    string `json:"id"`
	Path  string `json:"path"`
	Bytes int64  `json:"bytes"`
	Image string `json:"image"`
}

func (a *App) cleanupDetails(id string) (cleanupInfo, error) {
	info := cleanupInfo{ID: id}
	if !validJobID.MatchString(id) {
		return info, fmt.Errorf("任务不存在")
	}
	j, err := a.job(id)
	if err != nil {
		return info, fmt.Errorf("任务不存在")
	}
	if j.Status == "cleaned" {
		return info, fmt.Errorf("该任务产物已清理")
	}
	info.Path = filepath.Join(a.dir, "builds", id, "output")
	err = filepath.WalkDir(info.Path, func(_ string, d fs.DirEntry, e error) error {
		if os.IsNotExist(e) {
			return nil
		}
		if e != nil {
			return e
		}
		if d.Type().IsRegular() {
			i, e := d.Info()
			if e != nil {
				return e
			}
			info.Bytes += i.Size()
		}
		return nil
	})
	if err != nil && !os.IsNotExist(err) {
		return info, err
	}
	err = a.db.QueryRow(`SELECT ref FROM job_images WHERE job_id=?`, id).Scan(&info.Image)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return info, err
	}
	return info, nil
}
func (a *App) cleanupPreview(c *gin.Context) {
	info, err := a.cleanupDetails(c.Param("id"))
	if err != nil {
		fail(c, 404, err)
		return
	}
	c.JSON(200, info)
}
func (a *App) cleanupJob(c *gin.Context) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if len(a.active) > 0 || a.closing {
		fail(c, 409, "构建任务运行期间不能清理")
		return
	}
	info, err := a.cleanupDetails(c.Param("id"))
	if err != nil {
		fail(c, 404, err)
		return
	}
	var failures []error
	if err = os.RemoveAll(info.Path); err != nil {
		failures = append(failures, fmt.Errorf("删除产物失败: %w", err))
	}
	if info.Image != "" {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		engine := a.engine()
		if err = engine.RemoveJobContainer(ctx, info.ID); err != nil {
			failures = append(failures, fmt.Errorf("删除容器失败: %w", err))
		}
		if err = engine.RemoveImage(ctx, info.Image); err != nil {
			failures = append(failures, fmt.Errorf("删除镜像失败: %w", err))
		}
	}
	if len(failures) > 0 {
		fail(c, 502, errors.Join(failures...))
		return
	}
	tx, err := a.db.Begin()
	if err != nil {
		fail(c, 500, err)
		return
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`DELETE FROM job_images WHERE job_id=?`, info.ID); err == nil {
		_, err = tx.Exec(`UPDATE jobs SET status='cleaned',stage='产物已清理',error='' WHERE id=?`, info.ID)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"ok": true, "bytes": info.Bytes})
}
