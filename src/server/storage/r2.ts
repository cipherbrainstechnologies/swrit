import fs from "node:fs";
import { Readable } from "node:stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";
import type { Storage } from "./types";

/** Cloudflare R2 through the S3-compatible API. The bucket must stay private. */
export function createR2Storage(): Storage {
  const e = env();
  if (!e.R2_BUCKET || !e.R2_ACCESS_KEY_ID || !e.R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 storage selected but R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are missing");
  }
  const endpoint = e.R2_ENDPOINT ?? `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const client = new S3Client({
    region: "auto",
    // Path-style (endpoint/bucket/key) works with R2 and every S3-compatible store.
    forcePathStyle: true,
    endpoint,
    credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
    // Browser PUTs to presigned URLs cannot add SDK checksum headers.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const Bucket = e.R2_BUCKET;

  return {
    driver: "r2",
    presignPut(key, contentType, ttl) {
      return getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), {
        expiresIn: ttl,
        signableHeaders: new Set(["content-type"]),
      });
    },
    presignGet(key, ttl, opts) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseCacheControl: "private, max-age=120",
          ResponseContentType: opts?.contentType,
          ResponseContentDisposition: opts?.downloadName
            ? `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadName)}`
            : undefined,
        }),
        { expiresIn: ttl },
      );
    },
    async head(key) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { bytes: Number(r.ContentLength ?? 0), contentType: r.ContentType, etag: r.ETag };
      } catch (err: unknown) {
        const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404) return null;
        throw err;
      }
    },
    async getStream(key, range) {
      const r = await client.send(
        new GetObjectCommand({
          Bucket,
          Key: key,
          Range: range ? `bytes=${range.start}-${range.end ?? ""}` : undefined,
        }),
      );
      return r.Body as Readable;
    },
    async put(key, body, contentType, bytes) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType, ContentLength: bytes }),
      );
    },
    async putFile(key, filePath, contentType) {
      const size = fs.statSync(filePath).size;
      const partSize = 64 * 1024 * 1024;
      if (size <= partSize) {
        await client.send(
          new PutObjectCommand({
            Bucket,
            Key: key,
            Body: fs.createReadStream(filePath),
            ContentType: contentType,
            ContentLength: size,
          }),
        );
        return;
      }
      const { UploadId } = await client.send(
        new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }),
      );
      const parts: { PartNumber: number; ETag: string }[] = [];
      try {
        for (let i = 0, n = 1; i < size; i += partSize, n++) {
          const end = Math.min(size, i + partSize);
          const r = await client.send(
            new UploadPartCommand({
              Bucket,
              Key: key,
              UploadId,
              PartNumber: n,
              Body: fs.createReadStream(filePath, { start: i, end: end - 1 }),
              ContentLength: end - i,
            }),
          );
          parts.push({ PartNumber: n, ETag: r.ETag! });
        }
        await client.send(
          new CompleteMultipartUploadCommand({ Bucket, Key: key, UploadId, MultipartUpload: { Parts: parts } }),
        );
      } catch (err) {
        await client.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId })).catch(() => {});
        throw err;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async createMultipart(key, contentType) {
      const r = await client.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }));
      if (!r.UploadId) throw new Error("R2 did not return an UploadId");
      return r.UploadId;
    },
    presignPart(key, uploadId, partNumber, ttl) {
      return getSignedUrl(
        client,
        new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
        { expiresIn: ttl },
      );
    },
    async completeMultipart(key, uploadId, parts) {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts
              .sort((a, b) => a.partNumber - b.partNumber)
              .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
          },
        }),
      );
    },
    async abortMultipart(key, uploadId) {
      await client.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }));
    },
  };
}

export { Readable };
