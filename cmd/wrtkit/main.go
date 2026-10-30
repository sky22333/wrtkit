package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
	"wrtkit/internal/server"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8088", "管理地址")
	data := flag.String("data-dir", "./data", "数据目录")
	flag.Parse()
	p, e := filepath.Abs(*data)
	if e != nil {
		log.Fatal(e)
	}
	a, e := server.New(p)
	if e != nil {
		log.Fatal(e)
	}
	defer a.Close()
	s := &http.Server{Addr: *addr, Handler: a.Router(), ReadHeaderTimeout: 10 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		c, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		s.Shutdown(c)
	}()
	fmt.Println("WrtKit: http://" + *addr)
	if e = s.ListenAndServe(); e != nil && e != http.ErrServerClosed {
		log.Fatal(e)
	}
}
