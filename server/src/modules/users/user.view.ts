import { z } from 'zod';
import type { AuthenticatedUser } from '../../common/identity';

export const userViewSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  handle: z.string(),
});
export type UserView = z.infer<typeof userViewSchema>;

export const userListViewSchema = z.object({ items: z.array(userViewSchema) });
export type UserListView = z.infer<typeof userListViewSchema>;

export function toUserView(user: AuthenticatedUser): UserView {
  return { id: user.id, displayName: user.displayName, handle: user.handle };
}
