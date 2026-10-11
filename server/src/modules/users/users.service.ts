import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { User } from './users.types';

/**
 * The users module's public API for other modules (auctions show bidder and seller handles).
 * They ask here instead of joining the `users` table, so the table keeps a single owner.
 */
@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) {}

  findUserByHandle(handle: string): Promise<User | null> {
    return this.userRepository.findByHandle(handle);
  }

  findUsersByIds(ids: readonly string[]): Promise<User[]> {
    return this.userRepository.findByIds([...new Set(ids)]);
  }
}
