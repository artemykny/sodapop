package storage

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/ak/sodapop/backend/internal/games/oddoneout"
	"github.com/ak/sodapop/backend/internal/games/oddoneout/questionpacks"
	"github.com/ak/sodapop/backend/internal/snapshot"
	"github.com/jackc/pgx/v5"
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
		tcpostgres.WithDatabase("sodapop"),
		tcpostgres.WithUsername("sodapop"),
		tcpostgres.WithPassword("sodapop"),
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
	legacy, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		t.Fatalf("connect for legacy schema: %v", err)
	}
	_, err = legacy.Exec(ctx, `
		CREATE TABLE room_snapshots (
			room_id text PRIMARY KEY, room_name text NOT NULL, phase text NOT NULL,
			version bigint NOT NULL, state jsonb NOT NULL, updated_at timestamptz NOT NULL
		);
		CREATE INDEX room_snapshots_name_idx ON room_snapshots (lower(room_name));
		CREATE INDEX room_snapshots_updated_at_idx ON room_snapshots (updated_at DESC);
		INSERT INTO room_snapshots VALUES
			('legacy_room', 'Legacy room', 'lobby', 1, '{"phase":"lobby"}', now());
		CREATE TABLE question_packs (
			id text PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '',
			questions jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
			updated_at timestamptz NOT NULL DEFAULT now()
		);
		CREATE INDEX question_packs_name_idx ON question_packs (lower(name), id);
		INSERT INTO question_packs (id, name, description, questions) VALUES
			('legacy-pack', 'Legacy pack', 'Migrated', '[{"real":"Old real?","fake":"Old fake?"}]');
	`)
	if err != nil {
		legacy.Close(ctx)
		t.Fatalf("create legacy schema: %v", err)
	}
	legacy.Close(ctx)
	store, err := OpenPostgres(ctx, databaseURL)
	if err != nil {
		t.Fatalf("OpenPostgres() error = %v", err)
	}
	t.Cleanup(store.Close)
	legacySnapshot, err := store.Load(ctx, "oddoneout", "legacy_room")
	if err != nil || legacySnapshot.GameID != "oddoneout" {
		t.Fatalf("migrated legacy snapshot = %+v, %v", legacySnapshot, err)
	}
	legacyPack, err := store.GetQuestionPack(ctx, "legacy-pack")
	if err != nil || legacyPack.Name != "Legacy pack" {
		t.Fatalf("migrated legacy pack = %+v, %v", legacyPack, err)
	}

	now := time.Now().UTC().Truncate(time.Microsecond)
	value := snapshot.Snapshot{
		GameID: "oddoneout", RoomID: "room_1", RoomName: "Friday Game", Phase: "lobby",
		Version: 2, State: json.RawMessage(`{"phase":"lobby"}`), UpdatedAt: now,
	}
	if err := store.Save(ctx, value); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	loaded, err := store.Load(ctx, value.GameID, value.RoomID)
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
	loaded, err = store.Load(ctx, value.GameID, value.RoomID)
	if err != nil {
		t.Fatalf("Load(after older save) error = %v", err)
	}
	if loaded.Version != 2 || !jsonEqual(loaded.State, value.State) {
		t.Fatalf("older snapshot replaced newer state: %+v", loaded)
	}

	otherGame := value
	otherGame.GameID = "trivia"
	otherGame.Version = 1
	otherGame.State = json.RawMessage(`{"phase":"question"}`)
	if err := store.Save(ctx, otherGame); err != nil {
		t.Fatalf("Save(other game) error = %v", err)
	}
	loadedOther, err := store.Load(ctx, otherGame.GameID, otherGame.RoomID)
	if err != nil || loadedOther.GameID != "trivia" || !jsonEqual(loadedOther.State, otherGame.State) {
		t.Fatalf("Load(other game) = %+v, %v", loadedOther, err)
	}
	loaded, err = store.Load(ctx, value.GameID, value.RoomID)
	if err != nil || loaded.Version != 2 || !jsonEqual(loaded.State, value.State) {
		t.Fatalf("other game overwrote Odd One Out snapshot: %+v, %v", loaded, err)
	}

	pack := questionpacks.Pack{
		ID: "database-pack", Name: "Database pack", Description: "Persistent",
		Questions: []oddoneout.Question{{Real: "Best database?", Fake: "Worst database?"}},
	}
	if err := store.SaveQuestionPack(ctx, pack); err != nil {
		t.Fatalf("SaveQuestionPack() error = %v", err)
	}
	loadedPack, err := store.GetQuestionPack(ctx, pack.ID)
	if err != nil || loadedPack.Name != pack.Name || len(loadedPack.Questions) != 1 {
		t.Fatalf("GetQuestionPack() = %+v, %v", loadedPack, err)
	}

	var sharedSnapshots, namespacedPacks, legacyPacks bool
	err = store.pool.QueryRow(ctx, `SELECT
		to_regclass('room_snapshots') IS NOT NULL,
		to_regclass('oddoneout_question_packs') IS NOT NULL,
		to_regclass('question_packs') IS NOT NULL`,
	).Scan(&sharedSnapshots, &namespacedPacks, &legacyPacks)
	if err != nil {
		t.Fatalf("inspect schema: %v", err)
	}
	if !sharedSnapshots || !namespacedPacks || legacyPacks {
		t.Fatalf("schema tables: room_snapshots=%v oddoneout_question_packs=%v question_packs=%v", sharedSnapshots, namespacedPacks, legacyPacks)
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
