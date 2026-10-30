package server

import (
	"database/sql"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func parseProxy(value string) (*url.URL, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	u, err := url.Parse(value)
	if err != nil || (u.Scheme != "http" && u.Scheme != "socks5") || u.User != nil || u.Hostname() == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return nil, fmt.Errorf("请输入 HTTP 或 SOCKS5 代理地址和端口")
	}
	_, port, err := net.SplitHostPort(u.Host)
	n, portErr := strconv.Atoi(port)
	if err != nil || portErr != nil || n < 1 || n > 65535 {
		return nil, fmt.Errorf("请输入有效的代理地址和端口")
	}
	return u, nil
}

func (a *App) loadProxy() error {
	var value string
	err := a.db.QueryRow(`SELECT value FROM settings WHERE key='proxy'`).Scan(&value)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	a.proxyURL, err = parseProxy(value)
	return err
}

func (a *App) putProxy(c *gin.Context) {
	var input struct {
		Proxy string `json:"proxy"`
	}
	if c.ShouldBindJSON(&input) != nil {
		fail(c, 400, "请求格式无效")
		return
	}
	u, err := parseProxy(input.Proxy)
	if err != nil {
		fail(c, 400, err)
		return
	}
	value := ""
	if u != nil {
		value = u.String()
	}
	if _, err = a.db.Exec(`INSERT INTO settings VALUES('proxy',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, value); err != nil {
		fail(c, 500, err)
		return
	}
	a.proxyMu.Lock()
	a.proxyURL = u
	a.proxyMu.Unlock()
	if t, ok := a.client.Transport.(userAgentTransport); ok {
		if transport, ok := t.base.(*http.Transport); ok {
			transport.CloseIdleConnections()
		}
	}
	c.JSON(200, gin.H{"proxy": value})
}
