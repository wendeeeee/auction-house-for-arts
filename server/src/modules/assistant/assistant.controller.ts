import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { InvariantViolationError } from '../../common/errors';
import { AuthenticatedUser, CurrentUser, RequireUser } from '../../common/identity';
import { ZodValidationPipe, toOpenApiRequestSchema, toOpenApiSchema } from '../../common/validation';
import { AssistantConversationService } from './assistant-conversation.service';
import {
  AssistantReplyView,
  AssistantStatusView,
  AssistantTranscriptView,
  assistantReplyViewSchema,
  assistantStatusViewSchema,
  assistantTranscriptViewSchema,
  toAssistantReplyView,
  toAssistantTranscriptView,
} from './assistant.view';
import { SendAssistantMessageBody, assistantSessionIdSchema, sendAssistantMessageBodySchema } from './dto/send-assistant-message.dto';

@ApiTags('assistant')
@Controller('assistant')
export class AssistantController {
  constructor(private readonly conversations: AssistantConversationService) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether the Concierge is configured' })
  @ApiOkResponse({ schema: toOpenApiSchema(assistantStatusViewSchema) })
  getStatus(): AssistantStatusView {
    return { available: this.conversations.isAvailable, model: this.conversations.modelName };
  }

  @Post('chat')
  @HttpCode(200)
  @RequireUser()
  @ApiOperation({ summary: 'Send the Concierge a message', description: 'Read-only: the Concierge never bids or pays.' })
  @ApiBody({ schema: toOpenApiRequestSchema(sendAssistantMessageBodySchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(assistantReplyViewSchema) })
  @ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED' })
  @ApiResponse({ status: 429, description: 'ASSISTANT_RATE_LIMITED' })
  @ApiResponse({ status: 503, description: 'ASSISTANT_UNAVAILABLE' })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser | null,
    @Body(new ZodValidationPipe(sendAssistantMessageBodySchema)) body: SendAssistantMessageBody,
  ): Promise<AssistantReplyView> {
    const { sessionId, turn } = await this.conversations.sendMessage(requireUser(user), body);
    return toAssistantReplyView(sessionId, turn.reply);
  }

  @Get('sessions/:sessionId')
  @RequireUser()
  @ApiOperation({ summary: 'Your conversation, to restore the panel' })
  @ApiOkResponse({ schema: toOpenApiSchema(assistantTranscriptViewSchema) })
  @ApiNotFoundResponse({ description: 'ASSISTANT_SESSION_NOT_FOUND, also for another user’s session' })
  async getSession(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('sessionId', new ZodValidationPipe(assistantSessionIdSchema)) sessionId: string,
  ): Promise<AssistantTranscriptView> {
    return toAssistantTranscriptView(await this.conversations.getSession(sessionId, requireUser(user)));
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  @RequireUser()
  @ApiOperation({ summary: 'Start over: forget your conversation' })
  @ApiNoContentResponse()
  async deleteSession(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('sessionId', new ZodValidationPipe(assistantSessionIdSchema)) sessionId: string,
  ): Promise<void> {
    await this.conversations.deleteSession(sessionId, requireUser(user));
  }
}

function requireUser(user: AuthenticatedUser | null): AuthenticatedUser {
  if (!user) throw new InvariantViolationError('@RequireUser() admitted an anonymous request.');
  return user;
}
