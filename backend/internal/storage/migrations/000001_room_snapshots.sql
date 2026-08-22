CREATE TABLE IF NOT EXISTS room_snapshots (
    room_id text PRIMARY KEY,
    room_name text NOT NULL,
    phase text NOT NULL,
    version bigint NOT NULL CHECK (version >= 0),
    state jsonb NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS room_snapshots_name_idx
    ON room_snapshots (lower(room_name));

CREATE INDEX IF NOT EXISTS room_snapshots_updated_at_idx
    ON room_snapshots (updated_at DESC);
