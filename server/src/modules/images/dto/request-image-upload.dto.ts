import { z } from 'zod';
import { ACCEPTED_IMAGE_CONTENT_TYPES, MAXIMUM_IMAGE_BYTE_SIZE } from '../images.types';

export const requestImageUploadBodySchema = z.object({
  contentType: z
    .enum(ACCEPTED_IMAGE_CONTENT_TYPES, { error: 'must be image/jpeg, image/png, or image/webp' })
    .describe('The type the browser will send. The worker checks the real format regardless.'),
  byteSize: z
    .number()
    .int()
    .min(1)
    .max(MAXIMUM_IMAGE_BYTE_SIZE, { error: `must be at most ${MAXIMUM_IMAGE_BYTE_SIZE} bytes (15 MB)` })
    .describe('The exact file size; storage refuses an upload of any other length.'),
});

export type RequestImageUploadBody = z.infer<typeof requestImageUploadBodySchema>;
