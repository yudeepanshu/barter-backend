import { BlobStorage } from './interface';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

const bucket = process.env.S3_BUCKET_NAME;
const region = process.env.S3_REGION || 'us-east-1';

if (!bucket) {
  throw new Error('S3_BUCKET_NAME is required for S3 blob storage');
}

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
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
      ACL: 'public-read',
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
}
