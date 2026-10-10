import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger, OnModuleInit } from '@nestjs/common';
import type { StorageConfig } from '../../../config';
import { BlobStorage, PresignPutRequest, PresignedPut, StoredBlob } from './blob-storage';

export class S3BlobStorage implements BlobStorage, OnModuleInit {
  private readonly logger = new Logger(S3BlobStorage.name);
  private readonly client: S3Client;

  constructor(private readonly config: StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // MinIO serves buckets as paths, not subdomains.
      forcePathStyle: true,
      // Otherwise the SDK signs a checksum of the empty presign body, and every browser upload fails.
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists();
  }

  async presignPut(request: PresignPutRequest): Promise<PresignedPut> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: request.key,
      ContentType: request.contentType,
      ContentLength: request.byteSize,
    });
    // Signing both headers makes storage itself refuse a different type or a bigger file.
    const url = await getSignedUrl(this.client, command, {
      expiresIn: request.expiresInSeconds,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return { url, headers: { 'Content-Type': request.contentType } };
  }

  async get(key: string): Promise<StoredBlob | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
      if (!response.Body) return null;
      return { body: Buffer.from(await response.Body.transformToByteArray()), contentType: response.ContentType ?? null };
    } catch (error) {
      if (error instanceof NoSuchKey || isNotFound(error)) return null;
      throw error;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      return;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
      this.logger.log(`created bucket ${this.config.bucket}`);
    } catch (error) {
      // The API and the worker start together; whichever loses the race finds the bucket made.
      if (error instanceof S3ServiceException && error.name === 'BucketAlreadyOwnedByYou') return;
      throw error;
    }
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof S3ServiceException && (error.name === 'NotFound' || error.$metadata.httpStatusCode === 404);
}
