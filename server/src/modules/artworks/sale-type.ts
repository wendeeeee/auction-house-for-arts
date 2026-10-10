import { SaleType } from './artworks.types';

/**
 * Whether selling this artwork now would be a primary sale or a resale. Pure: decided only by
 * who owns the work today. Phase 5 uses it to decide whether a resale royalty is due.
 */
export function resolveSaleType(ownerUserId: string, artistUserId: string): SaleType {
  return ownerUserId === artistUserId ? 'primary' : 'resale';
}
