package server

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"
)

var validJobID = regexp.MustCompile(`^[0-9a-f]{24}$`)

type cleanupInfo struct {
	ID          string `json:"id"`
	Path        string `json:"path"`
	Bytes       int64  `json:"bytes"`
	Image       string `json:"image"`
	ImageAction string `json:"image_action"`
}

func (a *App) cleanupDetails(id string) (cleanupInfo, error) {
	info := cleanupInfo{ID: id, ImageAction: "unknown"}
	if !validJobID.MatchString(id) {
		return info, fmt.Errorf("任务不存在")
	}
	job, err := a.job(id)
	if err != nil {
		return info, fmt.Errorf("任务不存在")
	}
	if job.Status == "cleaned" {
		return info, fmt.Errorf("该任务产物已清理")
	}
	info.Path = filepath.Join(a.dir, "builds", id, "output")
	err = filepath.WalkDir(info.Path, func(_ string, d fs.DirEntry, err error) error {
		if os.IsNotExist(err) {
			return nil
		}
		if err != nil {
			return err
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
	var owned bool
	var users int
	err = a.db.QueryRow(`SELECT j.ref,m.owned,(SELECT count(*) FROM job_images x WHERE x.ref=j.ref AND x.job_id<>j.job_id) FROM job_images j JOIN managed_images m ON m.ref=j.ref WHERE j.job_id=?`, id).Scan(&info.Image, &owned, &users)
	if err == sql.ErrNoRows {
		return info, nil
	}
	if err != nil {
		return info, err
	}
	switch {
	case !owned:
		info.ImageAction = "preexisting"
	case users > 0:
		info.ImageAction = "shared"
	default:
		info.ImageAction = "remove"
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
	var input struct {
		RemoveImage bool `json:"remove_image"`
	}
	if c.ShouldBindJSON(&input) != nil {
		fail(c, 400, "请求格式无效")
		return
	}
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
	result := info.ImageAction
	// Only jobs created with image tracking may have a labelled managed container.
	if info.Image != "" {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		e := a.engine().RemoveJobContainer(ctx, info.ID)
		cancel()
		if e != nil {
			fail(c, 502, fmt.Errorf("无法确认构建容器已清理，产物已保留: %w", e))
			return
		}
	}
	if input.RemoveImage && info.ImageAction == "remove" {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		engine := a.engine()
		present, e := engine.ImagePresent(ctx, info.Image)
		if e != nil {
			fail(c, 502, fmt.Errorf("无法检查镜像，未删除产物: %w", e))
			return
		}
		if present {
			if e = engine.RemoveImage(ctx, info.Image); e != nil {
				fail(c, 409, fmt.Errorf("镜像未清理，产物已保留: %w", e))
				return
			}
			result = "removed"
		} else {
			result = "absent"
		}
	}
	if err = os.RemoveAll(info.Path); err != nil {
		fail(c, 500, fmt.Errorf("无法删除任务文件: %w", err))
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
	if err == nil && info.Image != "" && input.RemoveImage && (result == "removed" || result == "absent") {
		_, err = tx.Exec(`DELETE FROM managed_images WHERE ref=?`, info.Image)
	}
	if err != nil {
		fail(c, 500, err)
		return
	}
	if err = tx.Commit(); err != nil {
		fail(c, 500, err)
		return
	}
	if !input.RemoveImage {
		result = "kept"
	}
	c.JSON(200, gin.H{"ok": true, "bytes": info.Bytes, "image_result": result})
}
