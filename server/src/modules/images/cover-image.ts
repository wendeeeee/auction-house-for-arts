import { ImageStatus } from './images.types';

export interface CoverCandidate {
  readonly status: ImageStatus;
  readonly position: number;
  readonly isCover: boolean;
}

/** The owner's choice when it is ready, otherwise the first ready image in gallery order. */
export function resolveCoverImage<Image extends CoverCandidate>(images: readonly Image[]): Image | null {
  const ready = images.filter((image) => image.status === 'ready').sort((first, second) => first.position - second.position);
  return ready.find((image) => image.isCover) ?? ready[0] ?? null;
}
