ALTER TABLE notification_deliveries DROP CONSTRAINT notification_deliveries_kind_known;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_kind_known CHECK (
  kind IN (
    'seller_auction_closed', 'bidder_auction_won', 'bidder_reserve_not_met',
    'seller_purchase_paid', 'artist_royalty_earned'
  )
);
