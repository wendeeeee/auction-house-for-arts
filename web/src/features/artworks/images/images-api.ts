import { apiClient } from '../../../shared/api/api-client';
import type { ListView, ManagedArtworkImageView, StartedImageUploadView } from '../../../shared/api/api-types';

const imagesPath = (slug: string) => `/artworks/${encodeURIComponent(slug)}/images`;

export function listManagedImages(slug: string, signal?: AbortSignal): Promise<ListView<ManagedArtworkImageView>> {
  return apiClient.get(imagesPath(slug), { signal });
}

export function requestImageUpload(slug: string, file: { type: string; size: number }): Promise<StartedImageUploadView> {
  return apiClient.post(imagesPath(slug), { contentType: file.type, byteSize: file.size });
}

export function completeImageUpload(slug: string, imageId: string): Promise<ManagedArtworkImageView> {
  return apiClient.post(`${imagesPath(slug)}/${imageId}/complete`, undefined);
}

export function reorderImages(slug: string, imageIds: readonly string[]): Promise<ListView<ManagedArtworkImageView>> {
  return apiClient.put(`${imagesPath(slug)}/order`, { imageIds });
}

export function chooseCoverImage(slug: string, imageId: string): Promise<ListView<ManagedArtworkImageView>> {
  return apiClient.post(`${imagesPath(slug)}/${imageId}/cover`, undefined);
}

export function deleteImage(slug: string, imageId: string): Promise<void> {
  return apiClient.delete(`${imagesPath(slug)}/${imageId}`);
}
