import { InMemoryBlobStorage } from './in-memory-blob-storage';

describe('InMemoryBlobStorage', () => {
  it('returns what was put, and null once it is deleted', async () => {
    const storage = new InMemoryBlobStorage();
    await storage.put('originals/a', Buffer.from('bytes'), 'image/jpeg');

    expect(await storage.get('originals/a')).toEqual({ body: Buffer.from('bytes'), contentType: 'image/jpeg' });

    await storage.delete('originals/a');
    expect(await storage.get('originals/a')).toBeNull();
  });

  it('treats deleting a missing key as success', async () => {
    await expect(new InMemoryBlobStorage().delete('missing')).resolves.toBeUndefined();
  });

  it('records presign requests and signs the content type', async () => {
    const storage = new InMemoryBlobStorage();
    const request = { key: 'originals/b', contentType: 'image/png', byteSize: 10, expiresInSeconds: 300 };

    const presigned = await storage.presignPut(request);

    expect(presigned.headers).toEqual({ 'Content-Type': 'image/png' });
    expect(storage.presignedPuts).toEqual([request]);
  });
});
