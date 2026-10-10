import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/validation';
import { ArtworkImageQueryService } from './artwork-image-query.service';
import { IMAGE_VARIANT_NAMES, ImageVariantName } from './images.types';

const imageIdSchema = z.uuid({ error: 'must be an image ID' });
const variantSchema = z.enum(IMAGE_VARIANT_NAMES, { error: 'must be small or large' });

@ApiTags('artwork images')
@Controller('artwork-images')
export class ArtworkImageFilesController {
  constructor(private readonly imageQueryService: ArtworkImageQueryService) {}

  @Get(':imageId/:variant')
  // A variant's bytes never change for its URL, so browsers may keep it for good.
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'A processed version of an artwork image (WebP). Originals are never served.' })
  @ApiProduces('image/webp')
  @ApiOkResponse({ description: 'The WebP bytes.' })
  @ApiNotFoundResponse({ description: 'IMAGE_NOT_FOUND, also while the image is not ready' })
  async getImageFile(
    @Param('imageId', new ZodValidationPipe(imageIdSchema)) imageId: string,
    @Param('variant', new ZodValidationPipe(variantSchema)) variant: ImageVariantName,
  ): Promise<StreamableFile> {
    const body = await this.imageQueryService.readVariantFile(imageId, variant);
    return new StreamableFile(body, { type: 'image/webp', length: body.length });
  }
}
