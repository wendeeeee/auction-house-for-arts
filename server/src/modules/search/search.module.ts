import { Module } from '@nestjs/common';
import { ArtistsModule } from '../artists';
import { ArtworksModule } from '../artworks';
import { AuctionsModule } from '../auctions';
import { LanguageModelsModule } from '../language-models';
import { UsersModule } from '../users';
import { ArtworkSearchService } from './artwork-search.service';
import { SearchQueryInterpreterService } from './query-interpretation/search-query-interpreter.service';
import { SearchController } from './search.controller';

@Module({
  imports: [ArtworksModule, ArtistsModule, UsersModule, AuctionsModule, LanguageModelsModule],
  controllers: [SearchController],
  providers: [ArtworkSearchService, SearchQueryInterpreterService],
  exports: [ArtworkSearchService],
})
export class SearchModule {}
