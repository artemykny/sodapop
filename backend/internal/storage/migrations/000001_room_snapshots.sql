CREATE TABLE IF NOT EXISTS room_snapshots (
    game_id text NOT NULL,
    room_id text NOT NULL,
    room_name text NOT NULL,
    phase text NOT NULL,
    version bigint NOT NULL CHECK (version >= 0),
    state jsonb NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT room_snapshots_game_room_pkey PRIMARY KEY (game_id, room_id)
);

-- Upgrade the original single-game snapshot table in place. Existing rows
-- predate game_id and therefore belong to Odd One Out.
ALTER TABLE room_snapshots ADD COLUMN IF NOT EXISTS game_id text;
UPDATE room_snapshots SET game_id = 'oddoneout' WHERE game_id IS NULL OR game_id = '';
ALTER TABLE room_snapshots ALTER COLUMN game_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'room_snapshots'::regclass
          AND conname = 'room_snapshots_game_room_pkey'
    ) THEN
        ALTER TABLE room_snapshots DROP CONSTRAINT IF EXISTS room_snapshots_pkey;
        ALTER TABLE room_snapshots
            ADD CONSTRAINT room_snapshots_game_room_pkey PRIMARY KEY (game_id, room_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'room_snapshots'::regclass
          AND conname = 'room_snapshots_game_id_not_empty'
    ) THEN
        ALTER TABLE room_snapshots
            ADD CONSTRAINT room_snapshots_game_id_not_empty CHECK (game_id <> '');
    END IF;
END $$;

DROP INDEX IF EXISTS room_snapshots_name_idx;
DROP INDEX IF EXISTS room_snapshots_updated_at_idx;

CREATE INDEX IF NOT EXISTS room_snapshots_game_name_idx
    ON room_snapshots (game_id, lower(room_name));

CREATE INDEX IF NOT EXISTS room_snapshots_game_updated_at_idx
    ON room_snapshots (game_id, updated_at DESC);

-- Question packs are an Odd One Out concept. Rename the original generic
-- table and index when upgrading an existing installation.
DO $$
BEGIN
    IF to_regclass('oddoneout_question_packs') IS NULL
       AND to_regclass('question_packs') IS NOT NULL THEN
        ALTER TABLE question_packs RENAME TO oddoneout_question_packs;
    END IF;
    IF to_regclass('oddoneout_question_packs_name_idx') IS NULL
       AND to_regclass('question_packs_name_idx') IS NOT NULL THEN
        ALTER INDEX question_packs_name_idx RENAME TO oddoneout_question_packs_name_idx;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS oddoneout_question_packs (
    id text PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    questions jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oddoneout_question_packs_name_idx
    ON oddoneout_question_packs (lower(name), id);
