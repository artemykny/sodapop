package snapshot

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

var ErrNotFound = errors.New("snapshot not found")

// Snapshot is the game-neutral persistence envelope. State is opaque to shared
// storage; each game module owns its serialization and restoration semantics.
type Snapshot struct {
	GameID    string          `json:"game_id"`
	RoomID    string          `json:"room_id"`
	RoomName  string          `json:"room_name"`
	Phase     string          `json:"phase"`
	Version   uint64          `json:"version"`
	State     json.RawMessage `json:"state"`
	UpdatedAt time.Time       `json:"updated_at"`
}

type Store interface {
	Save(ctx context.Context, snapshot Snapshot) error
}
