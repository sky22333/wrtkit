package server

import (
	"database/sql"
	"strings"

	"github.com/gin-gonic/gin"
)

func (a *App) registry() string {
	var s string
	if err := a.db.QueryRow(`SELECT value FROM settings WHERE key='registry'`).Scan(&s); err != nil {
		return ""
	}
	return s
}
func (a *App) putRegistry(c *gin.Context) {
	var input struct {
		Registry string `json:"registry"`
	}
	if c.ShouldBindJSON(&input) != nil {
		fail(c, 400, "请求格式无效")
		return
	}
	value, err := normalizeRegistry(strings.TrimSpace(input.Registry))
	if err != nil {
		fail(c, 400, err)
		return
	}
	_, err = a.db.Exec(`INSERT INTO settings VALUES('registry',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, value)
	if err != nil && err != sql.ErrNoRows {
		fail(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"registry": value})
}
