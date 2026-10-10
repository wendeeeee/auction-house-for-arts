import { Module } from '@nestjs/common';
import { ArtworksModule } from '../artworks';
import { AuctionsModule } from '../auctions';
import { ClosingModule } from '../closing';
import { LanguageModelsModule } from '../language-models';
import { PurchasesModule } from '../purchases';
import { SearchModule } from '../search';
import { AssistantConversationService } from './assistant-conversation.service';
import { AssistantOrchestratorService } from './assistant-orchestrator.service';
import { ASSISTANT_SESSION_STORE, RedisAssistantSessionStore } from './assistant-session.store';
import { AssistantController } from './assistant.controller';
import { ASSISTANT_TOOLS, ToolRegistry } from './tools/tool-registry';

@Module({
  imports: [LanguageModelsModule, SearchModule, AuctionsModule, ArtworksModule, ClosingModule, PurchasesModule],
  controllers: [AssistantController],
  providers: [
    ...ASSISTANT_TOOLS,
    ToolRegistry,
    AssistantOrchestratorService,
    AssistantConversationService,
    { provide: ASSISTANT_SESSION_STORE, useClass: RedisAssistantSessionStore },
  ],
})
export class AssistantModule {}
