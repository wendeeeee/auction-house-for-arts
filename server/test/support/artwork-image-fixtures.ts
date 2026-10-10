import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AcceptedImageContentType, BlobStorage } from '../../src/modules/images';

/** An image whose upload the owner has marked complete, with its original already in storage. */
export async function insertProcessingImage(
  pool: Pool,
  storage: BlobStorage,
  fields: { artworkId: string; uploadedByUserId: string; original: Buffer; declaredContentType?: AcceptedImageContentType; position?: number },
): Promise<{ imageId: string; originalStorageKey: string }> {
  const imageId = randomUUID();
  const originalStorageKey = `originals/${randomUUID()}`;
  const declaredContentType = fields.declaredContentType ?? 'image/jpeg';
  await storage.put(originalStorageKey, fields.original, declaredContentType);
  await pool.query(
    `INSERT INTO artwork_images
       (id, artwork_id, uploaded_by_user_id, status, declared_content_type, declared_byte_size,
        original_storage_key, position, created_at, completed_at)
     VALUES ($1, $2, $3, 'processing', $4, $5, $6, $7, now(), now())`,
    [
      imageId,
      fields.artworkId,
      fields.uploadedByUserId,
      declaredContentType,
      Math.max(fields.original.length, 1),
      originalStorageKey,
      fields.position ?? 0,
    ],
  );
  return { imageId, originalStorageKey };
}
