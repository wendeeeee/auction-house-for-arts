import { Injectable } from '@nestjs/common';
import { InvariantViolationError } from '../../common/errors';
import { ArtworkRepository } from './artwork.repository';

export interface OwnershipTransfer {
  readonly artworkId: string;
  readonly fromUserId: string;
  readonly toUserId: string;
}

/** The only way another module changes who owns an artwork. */
@Injectable()
export class ArtworkOwnershipService {
  constructor(private readonly artworkRepository: ArtworkRepository) {}

  /** Inside the caller's transaction; fails if the seller no longer owns the work, rolling the sale back. */
  async transferOwnership(transfer: OwnershipTransfer): Promise<void> {
    const isTransferred = await this.artworkRepository.transferOwnership(transfer.artworkId, transfer.fromUserId, transfer.toUserId);
    if (!isTransferred) {
      throw new InvariantViolationError('The artwork is no longer owned by the seller.', { ...transfer });
    }
  }
}
