package main

import (
	"log/slog"
	"os"
	"strings"

	"github.com/ak/skewa/backend/internal/appserver"
	"github.com/ak/skewa/backend/internal/coordinator"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	gameServers := splitList(os.Getenv("GAME_SERVERS"))
	server, err := coordinator.New(gameServers, nil, logger, splitList(os.Getenv("ALLOWED_ORIGINS")))
	if err != nil {
		logger.Error("configure coordinator", "error", err)
		os.Exit(1)
	}
	if err := appserver.Run(address("8080"), server.Handler(), logger); err != nil {
		logger.Error("coordinator stopped", "error", err)
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
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			result = append(result, part)
		}
	}
	return result
}
