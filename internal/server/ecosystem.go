package server

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
)

const immortal = "immortalwrt"
const openwrt = "openwrt"

func (a *App) mirrorsFor(ecosystem string) ([]mirrorSource, error) {
	var raw string
	err := a.db.QueryRow(`SELECT value FROM settings WHERE key=?`, "mirror_sources_"+ecosystem).Scan(&raw)
	if err == sql.ErrNoRows {
		return ecosystemMirrors(ecosystem), nil
	}
	if err != nil {
		return nil, err
	}
	var mirrors []mirrorSource
	if err := json.Unmarshal([]byte(raw), &mirrors); err != nil {
		return nil, fmt.Errorf("软件源配置损坏: %w", err)
	}
	return mirrors, nil
}

func (a *App) ecosystem() (string, error) {
	var value string
	err := a.db.QueryRow(`SELECT value FROM settings WHERE key='ecosystem'`).Scan(&value)
	if err == sql.ErrNoRows {
		return immortal, nil
	}
	if err != nil {
		return "", err
	}
	if value != immortal && value != openwrt {
		return "", fmt.Errorf("生态配置无效")
	}
	return value, nil
}

func (a *App) putEcosystem(c *gin.Context) {
	var input struct {
		Ecosystem string `json:"ecosystem"`
	}
	if c.ShouldBindJSON(&input) != nil || (input.Ecosystem != immortal && input.Ecosystem != openwrt) {
		fail(c, 400, "生态无效")
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if len(a.active) > 0 {
		fail(c, 409, "构建进行中，无法切换生态")
		return
	}
	mirrors, err := a.mirrorsFor(input.Ecosystem)
	if err != nil {
		fail(c, 500, err)
		return
	}
	if _, err := a.db.Exec(`INSERT INTO settings VALUES('ecosystem',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, input.Ecosystem); err != nil {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"ecosystem": input.Ecosystem, "mirrors": mirrors})
}

func ecosystemMirrors(ecosystem string) []mirrorSource {
	if ecosystem == immortal {
		return defaultMirrors()
	}
	return []mirrorSource{
		{"南京大学", "https://mirror.nju.edu.cn/openwrt"},
		{"OpenWrt 官方", "https://downloads.openwrt.org"},
	}
}
