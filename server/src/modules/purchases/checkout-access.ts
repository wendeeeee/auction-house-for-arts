import { CheckoutViewerRole } from './purchases.types';

export function decideCheckoutViewerRole(parties: {
  viewerUserId: string;
  winningUserId: string;
  sellerUserId: string;
}): CheckoutViewerRole {
  if (parties.viewerUserId === parties.winningUserId) return 'buyer';
  if (parties.viewerUserId === parties.sellerUserId) return 'seller';
  return 'none';
}
