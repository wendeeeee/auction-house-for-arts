import { type ChangeEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ManagedArtworkImageView } from '../../shared/api/api-types';
import { ErrorState, LoadingState } from '../../shared/ui/StatusMessage';
import { IMAGE_POLL_INTERVAL_MILLISECONDS, decideImagePoll } from './images/image-polling';
import { describeImageActionError, describeImageStatus } from './images/image-status-message';
import {
  ACCEPTED_IMAGE_TYPES,
  MAXIMUM_IMAGES_PER_ARTWORK,
  countImagesTowardLimit,
  planImageUploads,
} from './images/image-upload-rules';
import {
  chooseCoverImage,
  completeImageUpload,
  deleteImage,
  listManagedImages,
  reorderImages,
  requestImageUpload,
} from './images/images-api';
import { StorageUploadError, putFileToStorage } from './images/storage-upload';

type UploadPhase = 'waiting' | 'uploading' | 'finishing' | 'done' | 'failed';

interface UploadRow {
  readonly key: string;
  readonly fileName: string;
  readonly progress: number;
  readonly phase: UploadPhase;
  readonly problem: string | null;
}

const UPLOAD_PHASE_LABELS: Record<UploadPhase, string> = {
  waiting: 'Waiting',
  uploading: 'Uploading',
  finishing: 'Queuing',
  done: 'Uploaded',
  failed: 'Not uploaded',
};

/** Shown to the artwork's owner: upload, reorder, choose the cover, and delete. */
export function ImageManager({
  artworkSlug,
  onImagesChanged,
}: {
  artworkSlug: string;
  onImagesChanged: (images: readonly ManagedArtworkImageView[]) => void;
}) {
  const headingId = useId();
  const [images, setImages] = useState<readonly ManagedArtworkImageView[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [uploads, setUploads] = useState<readonly UploadRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [busyImageId, setBusyImageId] = useState<string | null>(null);
  const [actionProblem, setActionProblem] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const onImagesChangedRef = useRef(onImagesChanged);
  onImagesChangedRef.current = onImagesChanged;

  const showImages = useCallback((next: readonly ManagedArtworkImageView[]) => {
    setImages(next);
    onImagesChangedRef.current(next);
  }, []);

  const refresh = useCallback(async () => {
    showImages((await listManagedImages(artworkSlug)).items);
  }, [artworkSlug, showImages]);

  useEffect(() => {
    const controller = new AbortController();
    setImages(null);
    setLoadError(null);
    listManagedImages(artworkSlug, controller.signal).then(
      (list) => {
        if (!controller.signal.aborted) showImages(list.items);
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error);
      },
    );
    return () => controller.abort();
  }, [artworkSlug, showImages]);

  const pollDecision = images ? decideImagePoll(images, pollCount) : 'idle';
  useEffect(() => {
    if (pollDecision !== 'poll_again') return;
    const timer = setTimeout(() => {
      setPollCount((count) => count + 1);
      refresh().catch(() => undefined);
    }, IMAGE_POLL_INTERVAL_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [pollDecision, images, refresh]);

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0 || images === null) return;

    const plans = planImageUploads(files, countImagesTowardLimit(images));
    const batch = Date.now();
    const rows: UploadRow[] = plans.map((plan, index) => ({
      key: `${batch}-${index}`,
      fileName: plan.file.name,
      progress: 0,
      phase: plan.isAccepted ? 'waiting' : 'failed',
      problem: plan.isAccepted ? null : plan.problem,
    }));
    setUploads(rows);
    setActionProblem(null);
    setIsUploading(true);

    // One at a time, so the per-artwork limit is never raced from this page.
    for (const [index, plan] of plans.entries()) {
      if (!plan.isAccepted) continue;
      const key = rows[index]!.key;
      const update = (changes: Partial<UploadRow>) =>
        setUploads((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
      try {
        update({ phase: 'uploading' });
        const started = await requestImageUpload(artworkSlug, plan.file);
        await putFileToStorage(started.upload, plan.file, (fraction) => update({ progress: fraction }));
        update({ phase: 'finishing', progress: 1 });
        await completeImageUpload(artworkSlug, started.image.id);
        update({ phase: 'done' });
      } catch (error) {
        update({ phase: 'failed', problem: error instanceof StorageUploadError ? error.message : describeImageActionError(error) });
      }
      setPollCount(0);
      await refresh().catch(() => undefined);
    }
    setIsUploading(false);
  }

  async function runImageAction(imageId: string, action: () => Promise<readonly ManagedArtworkImageView[] | null>) {
    setBusyImageId(imageId);
    setActionProblem(null);
    try {
      const next = await action();
      if (next) showImages(next);
      else await refresh();
    } catch (error) {
      setActionProblem(describeImageActionError(error));
    } finally {
      setBusyImageId(null);
    }
  }

  function move(index: number, offset: -1 | 1) {
    if (!images) return;
    const imageIds = images.map((image) => image.id);
    const [moved] = imageIds.splice(index, 1);
    if (!moved) return;
    imageIds.splice(index + offset, 0, moved);
    void runImageAction(moved, async () => (await reorderImages(artworkSlug, imageIds)).items);
  }

  const imagesTowardLimit = images ? countImagesTowardLimit(images) : 0;
  const isFull = imagesTowardLimit >= MAXIMUM_IMAGES_PER_ARTWORK;
  const processingCount = images?.filter((image) => image.status === 'processing').length ?? 0;

  return (
    <section className="auction-panel card card--raised image-manager" aria-labelledby={headingId}>
      <h2 className="seller-form__title" id={headingId}>
        Photos of this work
      </h2>
      <p className="bid-form__hint">
        JPEG, PNG, or WebP, up to 15 MB each and {MAXIMUM_IMAGES_PER_ARTWORK} per work. Files go straight to storage, and
        location data is removed before anything is shown.
      </p>

      {loadError !== null ? (
        <ErrorState error={loadError} />
      ) : images === null ? (
        <LoadingState label="Loading your photos" />
      ) : (
        <>
          {images.length > 0 && (
            <ol className="image-manager__list">
              {images.map((image, index) => {
                const isBusy = busyImageId !== null || isUploading;
                return (
                  <li key={image.id} className="image-manager__item">
                    <div className="image-manager__thumb">
                      {image.small && <img src={image.small.url} alt={`Photo ${index + 1}`} width={image.small.width} height={image.small.height} />}
                    </div>
                    <div className="image-manager__details">
                      <p className={`image-manager__status image-manager__status--${image.status}`}>{describeImageStatus(image)}</p>
                      <div className="image-manager__actions">
                        <button
                          type="button"
                          className="button button--quiet"
                          disabled={isBusy || index === 0}
                          aria-label={`Move photo ${index + 1} earlier`}
                          onClick={() => move(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="button button--quiet"
                          disabled={isBusy || index === images.length - 1}
                          aria-label={`Move photo ${index + 1} later`}
                          onClick={() => move(index, 1)}
                        >
                          ↓
                        </button>
                        {image.status === 'ready' && !image.isCover && (
                          <button
                            type="button"
                            className="button button--quiet"
                            disabled={isBusy}
                            onClick={() => void runImageAction(image.id, async () => (await chooseCoverImage(artworkSlug, image.id)).items)}
                          >
                            Make cover
                          </button>
                        )}
                        <button
                          type="button"
                          className="button button--quiet image-manager__delete"
                          disabled={isBusy}
                          aria-label={`Delete photo ${index + 1}`}
                          onClick={() =>
                            void runImageAction(image.id, async () => {
                              await deleteImage(artworkSlug, image.id);
                              return null;
                            })
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="button-row image-manager__picker-row">
            <label className={`button button--outline image-manager__picker${isUploading || isFull ? ' image-manager__picker--disabled' : ''}`}>
              <input
                type="file"
                className="visually-hidden"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                multiple
                disabled={isUploading || isFull}
                onChange={(event) => void uploadFiles(event)}
              />
              {isUploading ? 'Uploading…' : 'Add photos'}
            </label>
            <span className="mono-label">
              {imagesTowardLimit} / {MAXIMUM_IMAGES_PER_ARTWORK}
            </span>
          </div>
        </>
      )}

      {uploads.length > 0 && (
        <ul className="upload-list" aria-label="Uploads">
          {uploads.map((row) => (
            <li key={row.key} className="upload-list__item">
              <span className="upload-list__name">{row.fileName}</span>
              <span className="mono-label">{UPLOAD_PHASE_LABELS[row.phase]}</span>
              {row.phase === 'failed' ? (
                <span className="upload-list__problem">{row.problem}</span>
              ) : (
                <progress className="upload-list__progress" max={1} value={row.progress} aria-label={`Upload of ${row.fileName}`} />
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="visually-hidden" role="status" aria-live="polite">
        {processingCount > 0 ? `${processingCount} photo${processingCount === 1 ? '' : 's'} processing` : ''}
      </p>
      {pollDecision === 'gave_up' && (
        <p className="bid-form__hint">Processing is taking longer than usual. Reload the page to check again.</p>
      )}
      {actionProblem && (
        <div className="bid-message bid-message--error" role="alert">
          <p className="bid-message__detail">{actionProblem}</p>
        </div>
      )}
    </section>
  );
}
