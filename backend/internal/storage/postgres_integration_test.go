package storage

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/ak/skewa/backend/internal/snapshot"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestPostgresSaveAndLoad(t *testing.T) {
	if testing.Short() || os.Getenv("SKIP_INTEGRATION_TESTS") != "" {
		t.Skip("skipping Testcontainers integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	container, err := tcpostgres.Run(
		ctx, "postgres:17-alpine",
		tcpostgres.WithDatabase("skewa"),
		tcpostgres.WithUsername("skewa"),
		tcpostgres.WithPassword("skewa"),
		tcpostgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatalf("start postgres container: %v", err)
	}
	testcontainers.CleanupContainer(t, container)
	databaseURL, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("postgres connection string: %v", err)
	}
	store, err := OpenPostgres(ctx, databaseURL)
	if err != nil {
		t.Fatalf("OpenPostgres() error = %v", err)
	}
	t.Cleanup(store.Close)

	now := time.Now().UTC().Truncate(time.Microsecond)
	value := snapshot.Snapshot{
		RoomID: "room_1", RoomName: "Friday Game", Phase: "lobby",
		Version: 2, State: json.RawMessage(`{"phase":"lobby"}`), UpdatedAt: now,
	}
	if err := store.Save(ctx, value); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	loaded, err := store.Load(ctx, value.RoomID)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if loaded.RoomID != value.RoomID || loaded.Version != value.Version || !jsonEqual(loaded.State, value.State) {
		t.Fatalf("Load() = %+v, want %+v", loaded, value)
	}

	older := value
	older.Version = 1
	older.State = json.RawMessage(`{"phase":"stale"}`)
	if err := store.Save(ctx, older); err != nil {
		t.Fatalf("Save(older) error = %v", err)
	}
	loaded, err = store.Load(ctx, value.RoomID)
	if err != nil {
		t.Fatalf("Load(after older save) error = %v", err)
	}
	if loaded.Version != 2 || !jsonEqual(loaded.State, value.State) {
		t.Fatalf("older snapshot replaced newer state: %+v", loaded)
	}
}

func jsonEqual(left, right json.RawMessage) bool {
	var leftValue any
	var rightValue any
	if json.Unmarshal(left, &leftValue) != nil || json.Unmarshal(right, &rightValue) != nil {
		return false
	}
	return reflect.DeepEqual(leftValue, rightValue)
}
