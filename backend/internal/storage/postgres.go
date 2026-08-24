package storage

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/ak/sodapop/backend/internal/games/oddoneout/questionpacks"
	"github.com/ak/sodapop/backend/internal/snapshot"
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

func (p *Postgres) Save(ctx context.Context, value snapshot.Snapshot) error {
	if strings.TrimSpace(value.GameID) == "" {
		return errors.New("save room snapshot: game id is required")
	}
	_, err := p.pool.Exec(ctx, `
		INSERT INTO room_snapshots (game_id, room_id, room_name, phase, version, state, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (game_id, room_id) DO UPDATE SET
			room_name = EXCLUDED.room_name,
			phase = EXCLUDED.phase,
			version = EXCLUDED.version,
			state = EXCLUDED.state,
			updated_at = EXCLUDED.updated_at
		WHERE room_snapshots.version < EXCLUDED.version`,
		value.GameID, value.RoomID, value.RoomName, value.Phase, value.Version,
		[]byte(value.State), value.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("save room snapshot: %w", err)
	}
	return nil
}

func (p *Postgres) Load(ctx context.Context, gameID, roomID string) (snapshot.Snapshot, error) {
	var value snapshot.Snapshot
	err := p.pool.QueryRow(ctx, `
		SELECT game_id, room_id, room_name, phase, version, state, updated_at
		FROM room_snapshots
		WHERE game_id = $1 AND room_id = $2`, gameID, roomID,
	).Scan(
		&value.GameID, &value.RoomID, &value.RoomName, &value.Phase, &value.Version,
		&value.State, &value.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return snapshot.Snapshot{}, snapshot.ErrNotFound
	}
	if err != nil {
		return snapshot.Snapshot{}, fmt.Errorf("load room snapshot: %w", err)
	}
	return value, nil
}

func (p *Postgres) Close() {
	p.pool.Close()
}

func (p *Postgres) ListQuestionPacks(ctx context.Context) ([]questionpacks.Pack, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT id, name, description, questions
		FROM oddoneout_question_packs
		ORDER BY lower(name), id`)
	if err != nil {
		return nil, fmt.Errorf("list question packs: %w", err)
	}
	defer rows.Close()
	result := make([]questionpacks.Pack, 0)
	for rows.Next() {
		var pack questionpacks.Pack
		var questions []byte
		if err := rows.Scan(&pack.ID, &pack.Name, &pack.Description, &questions); err != nil {
			return nil, fmt.Errorf("scan question pack: %w", err)
		}
		if err := json.Unmarshal(questions, &pack.Questions); err != nil {
			return nil, fmt.Errorf("decode question pack %q: %w", pack.ID, err)
		}
		result = append(result, pack)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate question packs: %w", err)
	}
	return result, nil
}

func (p *Postgres) GetQuestionPack(ctx context.Context, id string) (questionpacks.Pack, error) {
	var pack questionpacks.Pack
	var questions []byte
	err := p.pool.QueryRow(ctx, `
		SELECT id, name, description, questions
		FROM oddoneout_question_packs
		WHERE id = $1`, id,
	).Scan(&pack.ID, &pack.Name, &pack.Description, &questions)
	if errors.Is(err, pgx.ErrNoRows) {
		return questionpacks.Pack{}, questionpacks.ErrNotFound
	}
	if err != nil {
		return questionpacks.Pack{}, fmt.Errorf("get question pack: %w", err)
	}
	if err := json.Unmarshal(questions, &pack.Questions); err != nil {
		return questionpacks.Pack{}, fmt.Errorf("decode question pack %q: %w", pack.ID, err)
	}
	return pack, nil
}

func (p *Postgres) SaveQuestionPack(ctx context.Context, pack questionpacks.Pack) error {
	pack = questionpacks.Normalize(pack)
	if err := questionpacks.Validate(pack); err != nil {
		return err
	}
	questions, err := json.Marshal(pack.Questions)
	if err != nil {
		return fmt.Errorf("encode question pack: %w", err)
	}
	_, err = p.pool.Exec(ctx, `
		INSERT INTO oddoneout_question_packs (id, name, description, questions)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			questions = EXCLUDED.questions,
			updated_at = now()`, pack.ID, pack.Name, pack.Description, questions)
	if err != nil {
		return fmt.Errorf("save question pack: %w", err)
	}
	return nil
}

func (p *Postgres) DeleteQuestionPack(ctx context.Context, id string) error {
	result, err := p.pool.Exec(ctx, `DELETE FROM oddoneout_question_packs WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete question pack: %w", err)
	}
	if result.RowsAffected() == 0 {
		return questionpacks.ErrNotFound
	}
	return nil
}

var _ questionpacks.Store = (*Postgres)(nil)
