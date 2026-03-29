import { BlobStorage } from './interface';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../../config/env';

const bucket = config.STORAGE.S3_BUCKET;
const region = config.STORAGE.S3_REGION;

if (!bucket) {
  throw new Error('S3_BUCKET_NAME is required for S3 blob storage');
}

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: config.STORAGE.S3_ACCESS_KEY_ID,
    secretAccessKey: config.STORAGE.S3_SECRET_ACCESS_KEY,
  },
});

export class S3BlobStorage implements BlobStorage {
  async uploadFile({
    key,
    buffer,
    contentType,
  }: {
    key: string;
    buffer: Buffer;
    contentType: string;
  }) {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(key)}`;
    return { url, key };
  }

  async deleteFile(key: string) {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    await s3Client.send(command);
  }

  async getPresignedUrl({
    key,
    contentType,
    expiresIn = config.STORAGE.S3_PRESIGNED_URL_EXPIRES_IN_SECONDS,
  }: {
    key: string;
    contentType: string;
    expiresIn?: number;
  }) {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(key)}`;
    return { signedUrl, publicUrl, key };
  }
}
