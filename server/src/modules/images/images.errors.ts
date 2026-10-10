import { DomainError, ErrorCode } from '../../common/errors';

/** Also for an image of another artwork, so IDs cannot be probed through the wrong slug. */
export class ImageNotFoundError extends DomainError {
  readonly code = ErrorCode.IMAGE_NOT_FOUND;
  readonly httpStatus = 404;

  constructor(imageId: string) {
    super('No such image.', { imageId });
  }
}

export class ImageLimitReachedError extends DomainError {
  readonly code = ErrorCode.IMAGE_LIMIT_REACHED;
  readonly httpStatus = 409;

  constructor(maximumImages: number) {
    super(`An artwork can have at most ${maximumImages} images. Delete one to upload another.`, { maximumImages });
  }
}

export class ImageNotReadyError extends DomainError {
  readonly code = ErrorCode.IMAGE_NOT_READY;
  readonly httpStatus = 409;

  constructor(imageId: string, status: string) {
    super('Only a processed image can be the cover.', { imageId, status });
  }
}

export class InvalidImageOrderError extends DomainError {
  readonly code = ErrorCode.INVALID_IMAGE_ORDER;
  readonly httpStatus = 409;

  constructor(details: { reason: string; imageIds: readonly string[] }) {
    super('The new order must list every image of the artwork exactly once.', details);
  }
}
