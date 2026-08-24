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

CREATE TABLE IF NOT EXISTS question_packs (
    id text PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    questions jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS question_packs_name_idx
    ON question_packs (lower(name), id);
