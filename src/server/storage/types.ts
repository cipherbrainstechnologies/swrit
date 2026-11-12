import type { Readable } from "node:stream";

export type HeadResult = { bytes: number; contentType?: string; etag?: string } | null;

export interface Storage {
  readonly driver: "r2" | "local";
  /** Short-lived URL that allows a single PUT of `key` with exactly `contentType`. */
  presignPut(key: string, contentType: string, ttlSeconds: number): Promise<string>;
  /** Short-lived URL to read `key`. Optional download filename. */
  presignGet(
    key: string,
    ttlSeconds: number,
    opts?: { downloadName?: string; contentType?: string },
  ): Promise<string>;
  head(key: string): Promise<HeadResult>;
  getStream(key: string, range?: { start: number; end?: number }): Promise<Readable>;
  put(key: string, body: Buffer | Readable, contentType: string, bytes?: number): Promise<void>;
  putFile(key: string, filePath: string, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;

  /* Multipart uploads for large videos and ZIP archives. */
  createMultipart(key: string, contentType: string): Promise<string>;
  presignPart(key: string, uploadId: string, partNumber: number, ttlSeconds: number): Promise<string>;
  completeMultipart(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
}
