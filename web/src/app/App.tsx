import { BrowserRouter, Route, Routes } from 'react-router';
import { ArtworkDetailPage } from '../features/artworks/ArtworkDetailPage';
import { CatalogPage } from '../features/artworks/CatalogPage';
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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
