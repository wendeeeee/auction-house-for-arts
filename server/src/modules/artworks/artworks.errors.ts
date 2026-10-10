import { DomainError, ErrorCode } from '../../common/errors';

export class ArtworkNotFoundError extends DomainError {
  readonly code = ErrorCode.ARTWORK_NOT_FOUND;
  readonly httpStatus = 404;

  constructor(slug: string) {
    super(`No artwork with slug "${slug}".`, { slug });
  }
}

export class ArtworkOwnerOnlyError extends DomainError {
  readonly code = ErrorCode.NOT_ARTWORK_OWNER;
  readonly httpStatus = 403;

  constructor(slug: string) {
    super('Only the artwork’s current owner can manage its images.', { slug });
  }
}
