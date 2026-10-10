-- Catalog: users, artists, and artworks.
-- Every rule the database can check is a constraint here, so no code path (a seed, a script,
-- a future bug) can store a row the application would reject.

-- Trigram indexes make substring search (`ILIKE '%term%'`) indexable.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  TEXT NOT NULL,
  handle        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT users_handle_unique UNIQUE (handle),
  -- Lowercase only, so uniqueness cannot be dodged with "Ada" vs "ada".
  CONSTRAINT users_handle_format CHECK (handle ~ '^[a-z0-9][a-z0-9_]{2,31}$'),
  CONSTRAINT users_display_name_length CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80)
);

CREATE TABLE artists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- An artist is also a user, so they can sell their own work. One profile per user.
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  slug         TEXT NOT NULL,
  name         TEXT NOT NULL,
  bio          TEXT NOT NULL DEFAULT '',
  -- Resale royalty in basis points: 500 = 5%, capped at 20%.
  royalty_bps  INTEGER NOT NULL DEFAULT 500,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT artists_user_id_unique UNIQUE (user_id),
  CONSTRAINT artists_slug_unique UNIQUE (slug),
  CONSTRAINT artists_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  CONSTRAINT artists_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT artists_bio_length CHECK (char_length(bio) <= 4000),
  CONSTRAINT artists_royalty_bps_range CHECK (royalty_bps BETWEEN 0 AND 2000)
);

CREATE TABLE artworks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT NOT NULL,
  artist_id      UUID NOT NULL REFERENCES artists (id) ON DELETE RESTRICT,
  title          TEXT NOT NULL,
  year           INTEGER,
  medium         TEXT NOT NULL,
  dimensions     TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  -- The current owner. The artist for a primary sale, a collector for a resale; resale
  -- royalties (phase 5) depend on telling the two apart.
  owner_user_id  UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT artworks_slug_unique UNIQUE (slug),
  CONSTRAINT artworks_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  CONSTRAINT artworks_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  -- A CHECK must be immutable, so "not in the future" is enforced by the application; this
  -- only rejects values that are clearly wrong.
  CONSTRAINT artworks_year_range CHECK (year IS NULL OR year BETWEEN 1400 AND 2100),
  -- TEXT + CHECK rather than an ENUM type: adding a medium later is a constraint swap inside a
  -- normal migration transaction, not an ALTER TYPE.
  CONSTRAINT artworks_medium_known CHECK (
    medium IN ('Painting', 'Print', 'Photography', 'Sculpture', 'Drawing', 'Digital')
  ),
  CONSTRAINT artworks_dimensions_length CHECK (char_length(btrim(dimensions)) BETWEEN 1 AND 120),
  CONSTRAINT artworks_description_length CHECK (char_length(description) <= 8000)
);

-- Catalog filters: ?artist= (joins through artist_id), ?medium=, and ?query= on title and
-- artist name. Foreign keys are not indexed automatically in Postgres.
CREATE INDEX artworks_artist_id_index ON artworks (artist_id);
CREATE INDEX artworks_medium_index ON artworks (medium);
CREATE INDEX artworks_owner_user_id_index ON artworks (owner_user_id);
CREATE INDEX artworks_title_trigram_index ON artworks USING gin (title gin_trgm_ops);
CREATE INDEX artists_name_trigram_index ON artists USING gin (name gin_trgm_ops);
-- The list is ordered newest first.
CREATE INDEX artworks_created_at_index ON artworks (created_at DESC, id);
