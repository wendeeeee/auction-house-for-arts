import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { InvariantViolationError } from '../../common/errors';
import { AuthenticatedUser, CurrentUser, RequireUser } from '../../common/identity';
import { toOpenApiSchema } from '../../common/validation';
import { EarningsView, earningsViewSchema, toEarningsView } from './earnings.view';
import { LedgerService } from './ledger.service';

@ApiTags('earnings')
@Controller('me/earnings')
@RequireUser()
export class EarningsController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get()
  @ApiOperation({
    summary: 'What the platform owes you: sale proceeds and resale royalties',
    description: 'Balances are sums of your ledger entries, credited when a buyer’s payment is confirmed.',
  })
  @ApiOkResponse({ schema: toOpenApiSchema(earningsViewSchema) })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED' })
  async getEarnings(@CurrentUser() user: AuthenticatedUser | null): Promise<EarningsView> {
    if (!user) throw new InvariantViolationError('@RequireUser() admitted an anonymous request.');
    return toEarningsView(await this.ledgerService.getEarnings(user));
  }
}
