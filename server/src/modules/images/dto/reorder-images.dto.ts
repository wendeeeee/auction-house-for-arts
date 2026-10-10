import { z } from 'zod';
import { MAXIMUM_IMAGES_PER_ARTWORK } from '../images.types';

export const reorderImagesBodySchema = z.object({
  imageIds: z
    .array(z.uuid({ error: 'must be an image ID' }))
    .max(MAXIMUM_IMAGES_PER_ARTWORK * 2)
    .describe('Every image of the artwork, each once, in the new gallery order.'),
});

export type ReorderImagesBody = z.infer<typeof reorderImagesBodySchema>;
