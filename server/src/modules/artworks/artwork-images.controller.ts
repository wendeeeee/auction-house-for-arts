import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { InvariantViolationError } from '../../common/errors';
import { AuthenticatedUser, CurrentUser, RequireUser } from '../../common/identity';
import { ZodValidationPipe, toOpenApiRequestSchema, toOpenApiSchema } from '../../common/validation';
import {
  ImageUploadService,
  ManagedArtworkImageListView,
  ManagedArtworkImageView,
  ReorderImagesBody,
  RequestImageUploadBody,
  StartedImageUploadView,
  managedArtworkImageListViewSchema,
  managedArtworkImageViewSchema,
  reorderImagesBodySchema,
  requestImageUploadBodySchema,
  startedImageUploadViewSchema,
  toManagedArtworkImageView,
  toManagedArtworkImageViews,
  toStartedImageUploadView,
} from '../images';
import { ArtworkCatalogService } from './artwork-catalog.service';

const imageIdSchema = z.uuid({ error: 'must be an image ID' });

/**
 * Lives in the artworks module because it needs the owner check, and the images module stays
 * below artworks (artworks reads covers from it), so the two never import each other.
 */
@ApiTags('artwork images')
@Controller('artworks/:slug/images')
@RequireUser()
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED' })
@ApiForbiddenResponse({ description: 'NOT_ARTWORK_OWNER' })
@ApiNotFoundResponse({ description: 'ARTWORK_NOT_FOUND or IMAGE_NOT_FOUND' })
export class ArtworkImagesController {
  constructor(
    private readonly catalogService: ArtworkCatalogService,
    private readonly imageUploadService: ImageUploadService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every image of your artwork, in any status, in gallery order' })
  @ApiOkResponse({ schema: toOpenApiSchema(managedArtworkImageListViewSchema) })
  async listImages(@CurrentUser() user: AuthenticatedUser | null, @Param('slug') slug: string): Promise<ManagedArtworkImageListView> {
    const artworkId = await this.authorize(user, slug);
    return { items: toManagedArtworkImageViews(await this.imageUploadService.listImages(artworkId)) };
  }

  @Post()
  @ApiOperation({
    summary: 'Start an upload: returns a URL to PUT the file to directly, valid for 5 minutes',
    description: 'The file never passes through the API. Call /complete once the PUT succeeds.',
  })
  @ApiBody({ schema: toOpenApiRequestSchema(requestImageUploadBodySchema) })
  @ApiCreatedResponse({ schema: toOpenApiSchema(startedImageUploadViewSchema) })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED: a type other than JPEG, PNG, or WebP, or over 15 MB' })
  @ApiConflictResponse({ description: 'IMAGE_LIMIT_REACHED' })
  async requestUpload(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(requestImageUploadBodySchema)) body: RequestImageUploadBody,
  ): Promise<StartedImageUploadView> {
    const artworkId = await this.authorize(user, slug);
    const started = await this.imageUploadService.requestUpload({
      artworkId,
      uploadedByUserId: requireUser(user).id,
      contentType: body.contentType,
      byteSize: body.byteSize,
    });
    return toStartedImageUploadView(started);
  }

  @Post(':imageId/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark the upload done, which queues processing (idempotent)' })
  @ApiOkResponse({ schema: toOpenApiSchema(managedArtworkImageViewSchema) })
  async completeUpload(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('slug') slug: string,
    @Param('imageId', new ZodValidationPipe(imageIdSchema)) imageId: string,
  ): Promise<ManagedArtworkImageView> {
    const artworkId = await this.authorize(user, slug);
    const image = await this.imageUploadService.completeUpload(artworkId, imageId);
    return toManagedArtworkImageView(image, image.isCover);
  }

  @Put('order')
  @ApiOperation({ summary: 'Reorder the gallery' })
  @ApiBody({ schema: toOpenApiRequestSchema(reorderImagesBodySchema) })
  @ApiOkResponse({ schema: toOpenApiSchema(managedArtworkImageListViewSchema) })
  @ApiConflictResponse({ description: 'INVALID_IMAGE_ORDER' })
  async reorderImages(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(reorderImagesBodySchema)) body: ReorderImagesBody,
  ): Promise<ManagedArtworkImageListView> {
    const artworkId = await this.authorize(user, slug);
    return { items: toManagedArtworkImageViews(await this.imageUploadService.reorderImages(artworkId, body.imageIds)) };
  }

  @Post(':imageId/cover')
  @HttpCode(200)
  @ApiOperation({ summary: 'Make a processed image the cover' })
  @ApiOkResponse({ schema: toOpenApiSchema(managedArtworkImageListViewSchema) })
  @ApiConflictResponse({ description: 'IMAGE_NOT_READY' })
  async chooseCover(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('slug') slug: string,
    @Param('imageId', new ZodValidationPipe(imageIdSchema)) imageId: string,
  ): Promise<ManagedArtworkImageListView> {
    const artworkId = await this.authorize(user, slug);
    return { items: toManagedArtworkImageViews(await this.imageUploadService.chooseCover(artworkId, imageId)) };
  }

  @Delete(':imageId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an image and its stored files' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  async deleteImage(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('slug') slug: string,
    @Param('imageId', new ZodValidationPipe(imageIdSchema)) imageId: string,
  ): Promise<void> {
    const artworkId = await this.authorize(user, slug);
    await this.imageUploadService.deleteImage(artworkId, imageId);
  }

  private authorize(user: AuthenticatedUser | null, slug: string): Promise<string> {
    return this.catalogService.getArtworkIdForOwner(slug, requireUser(user).id);
  }
}

function requireUser(user: AuthenticatedUser | null): AuthenticatedUser {
  if (!user) throw new InvariantViolationError('@RequireUser() admitted an anonymous request.');
  return user;
}
