-- Owned by the images module.

CREATE TABLE artwork_images (
  id                     UUID PRIMARY KEY,
  artwork_id             UUID NOT NULL REFERENCES artworks (id) ON DELETE RESTRICT,
  uploaded_by_user_id    UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status                 TEXT NOT NULL DEFAULT 'pending',
  declared_content_type  TEXT NOT NULL,
  declared_byte_size     BIGINT NOT NULL,
  original_storage_key   TEXT NOT NULL,
  position               INTEGER NOT NULL,
  is_cover               BOOLEAN NOT NULL DEFAULT false,
  rejection_reason       TEXT,
  created_at             TIMESTAMPTZ NOT NULL,
  completed_at           TIMESTAMPTZ,
  processed_at           TIMESTAMPTZ,

  CONSTRAINT artwork_images_original_storage_key_unique UNIQUE (original_storage_key),
  -- Deferred, so a reorder can swap positions inside one transaction.
  CONSTRAINT artwork_images_position_unique UNIQUE (artwork_id, position) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT artwork_images_status_known CHECK (status IN ('pending', 'processing', 'ready', 'rejected')),
  CONSTRAINT artwork_images_content_type_allowed CHECK (declared_content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT artwork_images_byte_size_range CHECK (declared_byte_size BETWEEN 1 AND 15728640),
  CONSTRAINT artwork_images_position_non_negative CHECK (position >= 0),
  CONSTRAINT artwork_images_rejection_reason_known CHECK (
    rejection_reason IN ('file_too_large', 'not_an_image', 'unsupported_format', 'too_many_pixels', 'animated', 'upload_missing')
  ),
  CONSTRAINT artwork_images_rejection_reason_matches_status CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL)),
  CONSTRAINT artwork_images_completed_at_matches_status CHECK ((status = 'pending') = (completed_at IS NULL)),
  CONSTRAINT artwork_images_processed_at_matches_status CHECK ((status IN ('ready', 'rejected')) = (processed_at IS NOT NULL)),
  CONSTRAINT artwork_images_cover_is_ready CHECK (NOT is_cover OR status = 'ready')
);

CREATE UNIQUE INDEX artwork_images_one_cover_per_artwork ON artwork_images (artwork_id) WHERE is_cover;

CREATE TABLE artwork_image_variants (
  image_id     UUID NOT NULL REFERENCES artwork_images (id) ON DELETE CASCADE,
  variant      TEXT NOT NULL,
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  byte_size    BIGINT NOT NULL,
  storage_key  TEXT NOT NULL,

  PRIMARY KEY (image_id, variant),
  CONSTRAINT artwork_image_variants_storage_key_unique UNIQUE (storage_key),
  CONSTRAINT artwork_image_variants_variant_known CHECK (variant IN ('small', 'large')),
  CONSTRAINT artwork_image_variants_dimensions_positive CHECK (width > 0 AND height > 0),
  CONSTRAINT artwork_image_variants_byte_size_positive CHECK (byte_size > 0)
);
