export interface BlobStorage {
  uploadFile(params: {
    key: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<{ url: string; key: string }>;
  deleteFile(key: string): Promise<void>;
}
