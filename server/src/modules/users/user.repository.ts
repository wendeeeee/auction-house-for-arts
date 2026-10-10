import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../database';
import type { IdentityLookup } from '../../common/identity';
import { User } from './users.types';

interface UserRow {
  id: string;
  display_name: string;
  handle: string;
  created_at: Date;
}

const USER_COLUMNS = 'id, display_name, handle, created_at';

/** Owns the `users` table. Also serves the identity guard, through the IdentityLookup interface. */
@Injectable()
export class UserRepository implements IdentityLookup {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.unitOfWork
      .client()
      .query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findByIds(ids: readonly string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const { rows } = await this.unitOfWork
      .client()
      .query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    return rows.map(toUser);
  }

  async findByHandle(handle: string): Promise<User | null> {
    const { rows } = await this.unitOfWork
      .client()
      .query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE handle = $1`, [handle]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async listAll(): Promise<User[]> {
    const { rows } = await this.unitOfWork
      .client()
      .query<UserRow>(`SELECT ${USER_COLUMNS} FROM users ORDER BY display_name, id`);
    return rows.map(toUser);
  }
}

function toUser(row: UserRow): User {
  return { id: row.id, displayName: row.display_name, handle: row.handle, createdAt: row.created_at };
}
