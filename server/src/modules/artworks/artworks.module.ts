import { Module } from '@nestjs/common';
import { ArtistsModule } from '../artists';
import { ArtworkCatalogService } from './artwork-catalog.service';
import { ArtworkOwnershipService } from './artwork-ownership.service';
import { ArtworkRepository } from './artwork.repository';
import { ArtworksController } from './artworks.controller';

@Module({
  imports: [ArtistsModule],
  controllers: [ArtworksController],
  providers: [ArtworkRepository, ArtworkCatalogService, ArtworkOwnershipService],
  exports: [ArtworkCatalogService, ArtworkOwnershipService],
})
export class ArtworksModule {}
