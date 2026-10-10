import { Module } from '@nestjs/common';
import { IDENTITY_LOOKUP } from '../../common/identity';
import { UserRepository } from './user.repository';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController],
  providers: [UserRepository, { provide: IDENTITY_LOOKUP, useExisting: UserRepository }],
  exports: [IDENTITY_LOOKUP],
})
export class UsersModule {}
