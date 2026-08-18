import { Readable } from "node:stream";
import type { ObjectStorage, StoredObjectStat } from "@/lib/storage";

/** In-memory object store so upload tests stay hermetic. */
export class FakeStorage implements ObjectStorage {
  readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();
  readonly signedPutUrls: string[] = [];

  put(key: string, bytes: Buffer, contentType = "image/jpeg"): void {
    this.objects.set(key, { bytes, contentType });
  }

  async createSignedPutUrl(key: string, contentType: string): Promise<string> {
    const url = `https://fake-storage.test/put/${encodeURIComponent(key)}?type=${encodeURIComponent(contentType)}`;
    this.signedPutUrls.push(url);
    return url;
  }

  async createSignedGetUrl(key: string): Promise<string> {
    return `https://fake-storage.test/get/${encodeURIComponent(key)}?sig=fake`;
  }

  async statObject(key: string): Promise<StoredObjectStat | null> {
    const object = this.objects.get(key);
    return object ? { contentLength: object.bytes.length, contentType: object.contentType } : null;
  }

  async getObjectBytes(key: string): Promise<Buffer | null> {
    return this.objects.get(key)?.bytes ?? null;
  }

  async getObjectStream(key: string): Promise<Readable | null> {
    const object = this.objects.get(key);
    return object ? Readable.from(object.bytes) : null;
  }

  async putObjectStream(key: string, stream: Readable, contentType: string): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    this.objects.set(key, { bytes: Buffer.concat(chunks), contentType });
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
