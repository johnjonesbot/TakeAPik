import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "@/lib/env";

export interface StoredObjectStat {
  contentLength: number;
  contentType?: string;
}

/**
 * Object storage seam. Signed URLs keep media bytes off the app server; the
 * fake in tests keeps integration suites hermetic.
 */
export interface ObjectStorage {
  createSignedPutUrl(key: string, contentType: string, contentLength: number, expiresSeconds: number): Promise<string>;
  createSignedGetUrl(key: string, expiresSeconds: number): Promise<string>;
  statObject(key: string): Promise<StoredObjectStat | null>;
  getObjectBytes(key: string): Promise<Buffer | null>;
  /** Streaming pair used by the export worker so archives never sit in memory. */
  getObjectStream(key: string): Promise<Readable | null>;
  putObjectStream(key: string, stream: Readable, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
}

class S3Storage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const env = getEnv();
    if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error("Object storage is not configured: set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY");
    }
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
    });
  }

  async createSignedPutUrl(key: string, contentType: string, contentLength: number, expiresSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
      { expiresIn: expiresSeconds }
    );
  }

  async createSignedGetUrl(key: string, expiresSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresSeconds
    });
  }

  async statObject(key: string): Promise<StoredObjectStat | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { contentLength: head.ContentLength ?? 0, contentType: head.ContentType };
    } catch {
      return null;
    }
  }

  async getObjectBytes(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await result.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  async getObjectStream(key: string): Promise<Readable | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return (result.Body as Readable | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async putObjectStream(key: string, stream: Readable, contentType: string): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: stream, ContentType: contentType }
    });
    await upload.done();
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => undefined);
  }
}

let storage: ObjectStorage | undefined;

export function getStorage(): ObjectStorage {
  storage ??= new S3Storage();
  return storage;
}

/** Test seam; production code never calls this. */
export function setStorageForTesting(replacement: ObjectStorage | undefined): void {
  storage = replacement;
}
