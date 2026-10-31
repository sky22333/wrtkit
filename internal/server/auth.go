package server

import (
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/alexedwards/argon2id"
	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

var passwordParams = &argon2id.Params{Memory: 19 * 1024, Iterations: 2, Parallelism: 1, SaltLength: 16, KeyLength: 32}

var usernamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$`)

func (a *App) authStatus(c *gin.Context) {
	var exists bool
	if err := a.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM admin WHERE id=1)`).Scan(&exists); err != nil {
		fail(c, 500, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(200, gin.H{"initialized": exists, "authenticated": a.sessions.GetString(c.Request.Context(), "admin") != ""})
}

func (a *App) login(c *gin.Context) {
	if !a.loginLimiter.Allow() {
		fail(c, http.StatusTooManyRequests, "登录尝试过于频繁，请稍后重试")
		return
	}
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !strings.HasPrefix(c.ContentType(), "application/json") || c.ShouldBindJSON(&input) != nil {
		fail(c, 400, "请求格式无效")
		return
	}
	passwordLength := utf8.RuneCountInString(input.Password)
	if !usernamePattern.MatchString(input.Username) || !utf8.ValidString(input.Password) || passwordLength < 6 || passwordLength > 64 {
		fail(c, 400, "用户名需为 3–32 位字母、数字，密码需为 6–64 个字符")
		return
	}
	var username string
	var hash string
	err := a.db.QueryRow(`SELECT username,password_hash FROM admin WHERE id=1`).Scan(&username, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		hash, err = argon2id.CreateHash(input.Password, passwordParams)
		if err != nil {
			fail(c, 500, "无法创建管理员")
			return
		}
		res, e := a.db.Exec(`INSERT INTO admin(id,username,password_hash) VALUES(1,?,?) ON CONFLICT(id) DO NOTHING`, input.Username, hash)
		if e != nil {
			fail(c, 500, "无法创建管理员")
			return
		}
		n, e := res.RowsAffected()
		if e != nil {
			fail(c, 500, "无法创建管理员")
			return
		}
		if n == 1 {
			username = input.Username
		} else {
			err = a.db.QueryRow(`SELECT username,password_hash FROM admin WHERE id=1`).Scan(&username, &hash)
			if err != nil {
				fail(c, 500, "登录失败")
				return
			}
		}
	} else if err != nil {
		fail(c, 500, "登录失败")
		return
	}
	match, err := argon2id.ComparePasswordAndHash(input.Password, hash)
	if err != nil {
		fail(c, 500, "无法验证管理员密码")
		return
	}
	if !match || username != input.Username {
		fail(c, 401, "用户名或密码错误")
		return
	}
	if err := a.sessions.RenewToken(c.Request.Context()); err != nil {
		fail(c, 500, "无法创建会话")
		return
	}
	a.sessions.Put(c.Request.Context(), "admin", username)
	c.JSON(200, gin.H{"ok": true})
}
func (a *App) logout(c *gin.Context) {
	if err := a.sessions.Destroy(c.Request.Context()); err != nil {
		fail(c, 500, "退出失败")
		return
	}
	c.JSON(200, gin.H{"ok": true})
}
func (a *App) requireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if a.sessions.GetString(c.Request.Context(), "admin") == "" {
			c.AbortWithStatusJSON(401, gin.H{"error": "请先登录"})
			return
		}
		c.Next()
	}
}
func newLoginLimiter() *rate.Limiter { return rate.NewLimiter(rate.Every(time.Second), 5) }
