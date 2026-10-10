import { BrowserRouter, Route, Routes } from 'react-router';
import { ArtworkDetailPage } from '../features/artworks/ArtworkDetailPage';
import { CatalogPage } from '../features/artworks/CatalogPage';
import { AuctionDetailPage } from '../features/auctions/AuctionDetailPage';
import { AuctionListPage } from '../features/auctions/AuctionListPage';
import { CheckoutReturnPage } from '../features/checkout/CheckoutReturnPage';
import { EarningsPage } from '../features/earnings/EarningsPage';
import { HomePage } from '../features/home/HomePage';
import { NotFoundPage } from '../features/not-found/NotFoundPage';
import { AppLayout } from './AppLayout';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="artworks" element={<CatalogPage />} />
          <Route path="artworks/:slug" element={<ArtworkDetailPage />} />
          <Route path="auctions" element={<AuctionListPage />} />
          <Route path="auctions/:slug" element={<AuctionDetailPage />} />
          <Route path="auctions/:slug/checkout/success" element={<CheckoutReturnPage result="success" />} />
          <Route path="auctions/:slug/checkout/cancelled" element={<CheckoutReturnPage result="cancelled" />} />
          <Route path="earnings" element={<EarningsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
