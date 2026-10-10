export type ImageOrderDecision =
  | { readonly isValid: true }
  | { readonly isValid: false; readonly reason: 'duplicate' | 'unknown' | 'missing'; readonly imageIds: readonly string[] };

/** A reorder must be a permutation of the artwork's current images: nothing added, dropped, or repeated. */
export function decideImageOrder(currentImageIds: readonly string[], requestedImageIds: readonly string[]): ImageOrderDecision {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of requestedImageIds) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size > 0) return { isValid: false, reason: 'duplicate', imageIds: [...duplicates] };

  const current = new Set(currentImageIds);
  const unknown = requestedImageIds.filter((id) => !current.has(id));
  if (unknown.length > 0) return { isValid: false, reason: 'unknown', imageIds: unknown };

  const missing = currentImageIds.filter((id) => !seen.has(id));
  if (missing.length > 0) return { isValid: false, reason: 'missing', imageIds: missing };

  return { isValid: true };
}
