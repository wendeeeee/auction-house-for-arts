import { BlobStorage, PresignPutRequest, PresignedPut, StoredBlob } from './blob-storage';

/** For tests: `put` stands in for the browser's upload to a presigned URL. */
export class InMemoryBlobStorage implements BlobStorage {
  private readonly objects = new Map<string, StoredBlob>();
  readonly presignedPuts: PresignPutRequest[] = [];
  putCount = 0;

  async presignPut(request: PresignPutRequest): Promise<PresignedPut> {
    this.presignedPuts.push(request);
    return {
      url: `memory://blob-storage/${encodeURIComponent(request.key)}?expiresIn=${request.expiresInSeconds}`,
      headers: { 'Content-Type': request.contentType },
    };
  }

  async get(key: string): Promise<StoredBlob | null> {
    return this.objects.get(key) ?? null;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.putCount += 1;
    this.objects.set(key, { body: Buffer.from(body), contentType });
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  keys(): string[] {
    return [...this.objects.keys()].sort();
  }

  clear(): void {
    this.objects.clear();
    this.presignedPuts.length = 0;
    this.putCount = 0;
  }
}
