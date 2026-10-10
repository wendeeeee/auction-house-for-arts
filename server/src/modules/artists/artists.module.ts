import { Module } from '@nestjs/common';
import { ArtistRepository } from './artist.repository';
import { ArtistsController } from './artists.controller';
import { ArtistsService } from './artists.service';

@Module({
  controllers: [ArtistsController],
  providers: [ArtistRepository, ArtistsService],
  exports: [ArtistsService],
})
export class ArtistsModule {}
