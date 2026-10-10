import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { InvariantViolationError } from '../../common/errors';
import { AuthenticatedUser, CurrentUser, RequireUser } from '../../common/identity';
import { toOpenApiSchema } from '../../common/validation';
import { UserRepository } from './user.repository';
import { UserListView, UserView, toUserView, userListViewSchema, userViewSchema } from './user.view';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly userRepository: UserRepository) {}

  @Get()
  @ApiOperation({ summary: 'List the demo users for the user switcher' })
  @ApiOkResponse({ schema: toOpenApiSchema(userListViewSchema) })
  async listUsers(): Promise<UserListView> {
    const users = await this.userRepository.listAll();
    return { items: users.map(toUserView) };
  }

  @Get('me')
  @RequireUser()
  @ApiOperation({ summary: 'The user named by X-Demo-User-Id' })
  @ApiOkResponse({ schema: toOpenApiSchema(userViewSchema) })
  @ApiUnauthorizedResponse({ description: 'No, a malformed, or an unknown X-Demo-User-Id.' })
  getCurrentUser(@CurrentUser() user: AuthenticatedUser | null): UserView {
    // @RequireUser() guarantees a user; the null check satisfies the type without a cast.
    if (!user) throw new InvariantViolationError('@RequireUser() admitted an anonymous request.');
    return toUserView(user);
  }
}
