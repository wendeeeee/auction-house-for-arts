import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../database';
import {
  AcceptedImageContentType,
  ArtworkImage,
  ArtworkImageVariant,
  ImageRejectionReason,
  ImageStatus,
  ImageVariantName,
} from './images.types';

interface ArtworkImageRow {
  id: string;
  artwork_id: string;
  uploaded_by_user_id: string;
  status: ImageStatus;
  declared_content_type: AcceptedImageContentType;
  declared_byte_size: string;
  original_storage_key: string;
  position: number;
  is_cover: boolean;
  rejection_reason: ImageRejectionReason | null;
  created_at: Date;
  completed_at: Date | null;
  processed_at: Date | null;
}

interface VariantRow {
  image_id: string;
  variant: ImageVariantName;
  width: number;
  height: number;
  byte_size: string;
  storage_key: string;
}

const IMAGE_COLUMNS = `id, artwork_id, uploaded_by_user_id, status, declared_content_type, declared_byte_size,
  original_storage_key, position, is_cover, rejection_reason, created_at, completed_at, processed_at`;
const VARIANT_COLUMNS = 'image_id, variant, width, height, byte_size, storage_key';

export interface NewPendingImage {
  readonly id: string;
  readonly artworkId: string;
  readonly uploadedByUserId: string;
  readonly declaredContentType: AcceptedImageContentType;
  readonly declaredByteSize: number;
  readonly originalStorageKey: string;
  readonly position: number;
  readonly createdAt: Date;
}

/** Owns `artwork_images` and `artwork_image_variants`. */
@Injectable()
export class ArtworkImageRepository {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  /**
   * Serializes every change to one artwork's images (the cap, positions, cover) until commit.
   * An advisory lock, because there may be no image row yet to lock, and `artworks` belongs to another module.
   */
  async lockArtworkImages(artworkId: string): Promise<void> {
    await this.unitOfWork
      .requireTransaction()
      .query(`SELECT pg_advisory_xact_lock(hashtextextended('artwork_images:' || $1::text, 0))`, [artworkId]);
  }

  async countTowardLimit(artworkId: string): Promise<number> {
    const { rows } = await this.unitOfWork
      .client()
      .query<{ count: string }>(`SELECT count(*) FROM artwork_images WHERE artwork_id = $1 AND status <> 'rejected'`, [artworkId]);
    return Number(rows[0]?.count ?? 0);
  }

  async findNextPosition(artworkId: string): Promise<number> {
    const { rows } = await this.unitOfWork
      .client()
      .query<{ next_position: number }>(
        'SELECT COALESCE(MAX(position) + 1, 0)::int AS next_position FROM artwork_images WHERE artwork_id = $1',
        [artworkId],
      );
    return rows[0]?.next_position ?? 0;
  }

  async insertPending(image: NewPendingImage): Promise<ArtworkImage> {
    const { rows } = await this.unitOfWork.client().query<ArtworkImageRow>(
      `INSERT INTO artwork_images
         (id, artwork_id, uploaded_by_user_id, declared_content_type, declared_byte_size, original_storage_key, position, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${IMAGE_COLUMNS}`,
      [
        image.id,
        image.artworkId,
        image.uploadedByUserId,
        image.declaredContentType,
        image.declaredByteSize,
        image.originalStorageKey,
        image.position,
        image.createdAt,
      ],
    );
    return toArtworkImage(rows[0]!, []);
  }

  async findById(imageId: string): Promise<ArtworkImage | null> {
    const { rows } = await this.unitOfWork
      .client()
      .query<ArtworkImageRow>(`SELECT ${IMAGE_COLUMNS} FROM artwork_images WHERE id = $1`, [imageId]);
    if (!rows[0]) return null;
    const [image] = await this.attachVariants(rows);
    return image ?? null;
  }

  /** Every status, in gallery order. */
  async findByArtworkId(artworkId: string): Promise<ArtworkImage[]> {
    const { rows } = await this.unitOfWork
      .client()
      .query<ArtworkImageRow>(`SELECT ${IMAGE_COLUMNS} FROM artwork_images WHERE artwork_id = $1 ORDER BY position, id`, [
        artworkId,
      ]);
    return this.attachVariants(rows);
  }

  async findReadyByArtworkIds(artworkIds: readonly string[]): Promise<ArtworkImage[]> {
    if (artworkIds.length === 0) return [];
    const { rows } = await this.unitOfWork
      .client()
      .query<ArtworkImageRow>(
        `SELECT ${IMAGE_COLUMNS} FROM artwork_images
          WHERE artwork_id = ANY($1::uuid[]) AND status = 'ready'
          ORDER BY artwork_id, position, id`,
        [artworkIds],
      );
    return this.attachVariants(rows);
  }

  async findReadyVariant(imageId: string, variant: ImageVariantName): Promise<ArtworkImageVariant | null> {
    const { rows } = await this.unitOfWork.client().query<VariantRow>(
      `SELECT variants.image_id, variants.variant, variants.width, variants.height, variants.byte_size, variants.storage_key
         FROM artwork_image_variants variants
         JOIN artwork_images images ON images.id = variants.image_id
        WHERE variants.image_id = $1 AND variants.variant = $2 AND images.status = 'ready'`,
      [imageId, variant],
    );
    return rows[0] ? toVariant(rows[0]) : null;
  }

  /** Compare-and-set: false unless the image was still pending. */
  async markProcessing(imageId: string, completedAt: Date): Promise<boolean> {
    const { rowCount } = await this.unitOfWork
      .client()
      .query(`UPDATE artwork_images SET status = 'processing', completed_at = $2 WHERE id = $1 AND status = 'pending'`, [
        imageId,
        completedAt,
      ]);
    return rowCount === 1;
  }

  /** Compare-and-set on `processing`, so a duplicate or late delivery changes nothing. */
  async markReady(imageId: string, variants: readonly ArtworkImageVariant[], processedAt: Date): Promise<boolean> {
    const client = this.unitOfWork.requireTransaction();
    const { rowCount } = await client.query(
      `UPDATE artwork_images SET status = 'ready', processed_at = $2 WHERE id = $1 AND status = 'processing'`,
      [imageId, processedAt],
    );
    if (rowCount !== 1) return false;
    for (const variant of variants) {
      await client.query(`INSERT INTO artwork_image_variants (${VARIANT_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6)`, [
        imageId,
        variant.name,
        variant.width,
        variant.height,
        variant.byteSize,
        variant.storageKey,
      ]);
    }
    return true;
  }

  async markRejected(imageId: string, reason: ImageRejectionReason, processedAt: Date): Promise<boolean> {
    const { rowCount } = await this.unitOfWork
      .client()
      .query(
        `UPDATE artwork_images SET status = 'rejected', rejection_reason = $2, processed_at = $3 WHERE id = $1 AND status = 'processing'`,
        [imageId, reason, processedAt],
      );
    return rowCount === 1;
  }

  /** Positions become 0…n-1 in the given order; the deferred unique constraint allows the swaps. */
  async updatePositions(artworkId: string, orderedImageIds: readonly string[]): Promise<void> {
    await this.unitOfWork.requireTransaction().query(
      `UPDATE artwork_images images
          SET position = ordered.ordinality - 1
         FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered (id, ordinality)
        WHERE images.id = ordered.id AND images.artwork_id = $1`,
      [artworkId, orderedImageIds],
    );
  }

  /** Two statements: the one-cover index is not deferrable, so the old cover is cleared first. */
  async setCover(artworkId: string, imageId: string): Promise<void> {
    const client = this.unitOfWork.requireTransaction();
    await client.query('UPDATE artwork_images SET is_cover = false WHERE artwork_id = $1 AND is_cover AND id <> $2', [
      artworkId,
      imageId,
    ]);
    await client.query('UPDATE artwork_images SET is_cover = true WHERE id = $1 AND artwork_id = $2', [imageId, artworkId]);
  }

  /** Variants go with it (ON DELETE CASCADE). */
  async delete(imageId: string): Promise<boolean> {
    const { rowCount } = await this.unitOfWork.client().query('DELETE FROM artwork_images WHERE id = $1', [imageId]);
    return rowCount === 1;
  }

  private async attachVariants(rows: readonly ArtworkImageRow[]): Promise<ArtworkImage[]> {
    const readyIds = rows.filter((row) => row.status === 'ready').map((row) => row.id);
    const variantsByImageId = new Map<string, ArtworkImageVariant[]>();
    if (readyIds.length > 0) {
      const { rows: variantRows } = await this.unitOfWork
        .client()
        .query<VariantRow>(`SELECT ${VARIANT_COLUMNS} FROM artwork_image_variants WHERE image_id = ANY($1::uuid[]) ORDER BY width`, [
          readyIds,
        ]);
      for (const row of variantRows) {
        variantsByImageId.set(row.image_id, [...(variantsByImageId.get(row.image_id) ?? []), toVariant(row)]);
      }
    }
    return rows.map((row) => toArtworkImage(row, variantsByImageId.get(row.id) ?? []));
  }
}

function toArtworkImage(row: ArtworkImageRow, variants: readonly ArtworkImageVariant[]): ArtworkImage {
  return {
    id: row.id,
    artworkId: row.artwork_id,
    uploadedByUserId: row.uploaded_by_user_id,
    status: row.status,
    declaredContentType: row.declared_content_type,
    declaredByteSize: Number(row.declared_byte_size),
    originalStorageKey: row.original_storage_key,
    position: row.position,
    isCover: row.is_cover,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    processedAt: row.processed_at,
    variants,
  };
}

function toVariant(row: VariantRow): ArtworkImageVariant {
  return {
    name: row.variant,
    width: row.width,
    height: row.height,
    byteSize: Number(row.byte_size),
    storageKey: row.storage_key,
  };
}
