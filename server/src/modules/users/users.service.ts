import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { User } from './users.types';


@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) {}

  findUsersByIds(ids: readonly string[]): Promise<User[]> {
    return this.userRepository.findByIds([...new Set(ids)]);
  }
}
