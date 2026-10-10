import { z } from 'zod';
import { ASSISTANT_PAGE_TYPES } from '../assistant.types';

/** Strict: a `userId` in the body is rejected outright. The user only ever comes from the identity guard. */
export const sendAssistantMessageBodySchema = z.strictObject({
  sessionId: z.uuid().optional(),
  message: z.string().trim().min(1).max(1_000),
  context: z
    .strictObject({
      type: z.enum(ASSISTANT_PAGE_TYPES),
      slug: z.string().max(140).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'must be a slug' }),
    })
    .optional()
    .describe('The page the panel was opened from.'),
});
export type SendAssistantMessageBody = z.infer<typeof sendAssistantMessageBodySchema>;

export const assistantSessionIdSchema = z.uuid();
