export class StorageUploadError extends Error {
  constructor(readonly status: number) {
    super(status === 0 ? 'The upload could not reach storage.' : `Storage refused the upload (${status}).`);
    this.name = 'StorageUploadError';
  }
}

/** XMLHttpRequest rather than fetch, because only XHR reports upload progress. The file goes straight to storage. */
export function putFileToStorage(
  upload: { readonly url: string; readonly headers: Readonly<Record<string, string>> },
  file: Blob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', upload.url);
    for (const [name, value] of Object.entries(upload.headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new StorageUploadError(request.status)));
    request.onerror = () => reject(new StorageUploadError(0));
    request.send(file);
  });
}
