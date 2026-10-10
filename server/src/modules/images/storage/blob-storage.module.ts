import { Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../../config';
import { BLOB_STORAGE } from './blob-storage';
import { S3BlobStorage } from './s3-blob-storage';

@Module({
  providers: [{ provide: BLOB_STORAGE, useFactory: (config: AppConfig) => new S3BlobStorage(config.storage), inject: [APP_CONFIG] }],
  exports: [BLOB_STORAGE],
})
export class BlobStorageModule {}
