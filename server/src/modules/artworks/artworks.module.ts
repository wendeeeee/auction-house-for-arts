import { Module } from '@nestjs/common';
import { ArtistsModule } from '../artists';
import { ArtworkCatalogService } from './artwork-catalog.service';
import { ArtworkRepository } from './artwork.repository';
import { ArtworksController } from './artworks.controller';

@Module({
  imports: [ArtistsModule],
  controllers: [ArtworksController],
  providers: [ArtworkRepository, ArtworkCatalogService],
  exports: [ArtworkCatalogService],
})
export class ArtworksModule {}
