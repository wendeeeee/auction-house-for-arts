import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox';
import { ArtworkImageFilesController } from './artwork-image-files.controller';
import { ArtworkImageQueryService } from './artwork-image-query.service';
import { ArtworkImageRepository } from './artwork-image.repository';
import { ImageProcessingService } from './image-processing.service';
import { ImageUploadService } from './image-upload.service';
import { BlobStorageModule } from './storage/blob-storage.module';

@Module({
  imports: [BlobStorageModule, OutboxModule],
  controllers: [ArtworkImageFilesController],
  providers: [ArtworkImageRepository, ImageProcessingService, ImageUploadService, ArtworkImageQueryService],
  exports: [ImageProcessingService, ImageUploadService, ArtworkImageQueryService],
})
export class ImagesModule {}
