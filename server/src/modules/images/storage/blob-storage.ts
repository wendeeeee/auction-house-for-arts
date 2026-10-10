export const BLOB_STORAGE = Symbol('BLOB_STORAGE');

export interface PresignPutRequest {
  readonly key: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly expiresInSeconds: number;
}

export interface PresignedPut {
  readonly url: string;
  /** The browser must send exactly these headers: they are part of the signature. */
  readonly headers: Readonly<Record<string, string>>;
}

export interface StoredBlob {
  readonly body: Buffer;
  readonly contentType: string | null;
}

/** Object storage behind an interface, so tests and CI never need S3. Keys are opaque paths. */
export interface BlobStorage {
  presignPut(request: PresignPutRequest): Promise<PresignedPut>;
  /** Null when no object has that key. */
  get(key: string): Promise<StoredBlob | null>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Succeeds when the object is already gone. */
  delete(key: string): Promise<void>;
}
