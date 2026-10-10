import { Module } from '@nestjs/common';
import { ArtistsModule } from '../artists';
import { ImagesModule } from '../images';
import { ArtworkCatalogService } from './artwork-catalog.service';
import { ArtworkOwnershipService } from './artwork-ownership.service';
import { ArtworkRepository } from './artwork.repository';
import { ArtworkImagesController } from './artwork-images.controller';
import { ArtworksController } from './artworks.controller';

@Module({
  imports: [ArtistsModule, ImagesModule],
  controllers: [ArtworksController, ArtworkImagesController],
  providers: [ArtworkRepository, ArtworkCatalogService, ArtworkOwnershipService],
  exports: [ArtworkCatalogService, ArtworkOwnershipService],
})
export class ArtworksModule {}
