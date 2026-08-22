package storage

import (
	"context"
	_ "embed"
	"errors"
	"fmt"

	"github.com/ak/skewa/backend/internal/game"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/000001_room_snapshots.sql
var schema string

type Postgres struct {
	pool *pgxpool.Pool
}

func OpenPostgres(ctx context.Context, databaseURL string) (*Postgres, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database URL: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("open postgres pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	store := &Postgres{pool: pool}
	if err := store.Migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return store, nil
}

func (p *Postgres) Migrate(ctx context.Context) error {
	if _, err := p.pool.Exec(ctx, schema); err != nil {
		return fmt.Errorf("apply postgres schema: %w", err)
	}
	return nil
}

func (p *Postgres) Save(ctx context.Context, snapshot game.Snapshot) error {
	_, err := p.pool.Exec(ctx, `
		INSERT INTO room_snapshots (room_id, room_name, phase, version, state, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (room_id) DO UPDATE SET
			room_name = EXCLUDED.room_name,
			phase = EXCLUDED.phase,
			version = EXCLUDED.version,
			state = EXCLUDED.state,
			updated_at = EXCLUDED.updated_at
		WHERE room_snapshots.version < EXCLUDED.version`,
		snapshot.RoomID, snapshot.RoomName, snapshot.Phase, snapshot.Version,
		[]byte(snapshot.State), snapshot.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("save room snapshot: %w", err)
	}
	return nil
}

func (p *Postgres) Load(ctx context.Context, roomID string) (game.Snapshot, error) {
	var snapshot game.Snapshot
	var phase string
	err := p.pool.QueryRow(ctx, `
		SELECT room_id, room_name, phase, version, state, updated_at
		FROM room_snapshots
		WHERE room_id = $1`, roomID,
	).Scan(
		&snapshot.RoomID, &snapshot.RoomName, &phase, &snapshot.Version,
		&snapshot.State, &snapshot.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return game.Snapshot{}, game.ErrRoomNotFound
	}
	if err != nil {
		return game.Snapshot{}, fmt.Errorf("load room snapshot: %w", err)
	}
	snapshot.Phase = game.Phase(phase)
	return snapshot, nil
}

func (p *Postgres) Close() {
	p.pool.Close()
}
