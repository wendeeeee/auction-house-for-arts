import { DomainError, ErrorCode } from '../../common/errors';

export class ArtworkNotFoundError extends DomainError {
  readonly code = ErrorCode.ARTWORK_NOT_FOUND;
  readonly httpStatus = 404;

  constructor(slug: string) {
    super(`No artwork with slug "${slug}".`, { slug });
  }
}
