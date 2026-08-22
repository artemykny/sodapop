package main

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/ak/skewa/backend/internal/appserver"
	"github.com/ak/skewa/backend/internal/game"
	"github.com/ak/skewa/backend/internal/httpapi"
	"github.com/ak/skewa/backend/internal/storage"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	var snapshotStore game.SnapshotStore
	var postgres *storage.Postgres
	if databaseURL := os.Getenv("DATABASE_URL"); databaseURL != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		var err error
		postgres, err = storage.OpenPostgres(ctx, databaseURL)
		cancel()
		if err != nil {
			logger.Error("initialize postgres", "error", err)
			os.Exit(1)
		}
		defer postgres.Close()
		snapshotStore = postgres
	} else {
		logger.Warn("DATABASE_URL is unset; room snapshots will not be persisted")
	}

	manager := game.NewManager(snapshotStore, logger)
	defer manager.Close()
	origins := splitList(os.Getenv("ALLOWED_ORIGINS"))
	handler := httpapi.New(manager, logger, origins).Handler()
	if err := appserver.Run(address("8081"), handler, logger); err != nil {
		logger.Error("game server stopped", "error", err)
		os.Exit(1)
	}
}

func address(defaultPort string) string {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}
	return ":" + port
}

func splitList(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			result = append(result, part)
		}
	}
	return result
}
