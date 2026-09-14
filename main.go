package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"launchpad/internal/server"
)

//go:embed web/dist
var frontend embed.FS

func main() {
	assets, err := fs.Sub(frontend, "web/dist")
	if err != nil {
		log.Fatal(err)
	}
	cfg, err := server.ConfigFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	app, err := server.New(cfg, assets)
	if err != nil {
		log.Fatal(err)
	}
	srv := &http.Server{Addr: cfg.Addr, Handler: app, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16384}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdown); err != nil {
			log.Printf("shutdown: %v", err)
		}
	}()
	log.Printf("Launchpad listening on %s (PIN protection: %t)", cfg.Addr, cfg.PIN != "")
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
