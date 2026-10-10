import { Module } from '@nestjs/common';
import { IDENTITY_LOOKUP } from '../../common/identity';
import { UserRepository } from './user.repository';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UserRepository, UsersService, { provide: IDENTITY_LOOKUP, useExisting: UserRepository }],
  exports: [IDENTITY_LOOKUP, UsersService],
})
export class UsersModule {}
