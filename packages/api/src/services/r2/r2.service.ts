/**
 * Cloudflare R2 Storage Service
 * Handles export file uploads, downloads, and lifecycle management.
 * 
 * Uses AWS SDK v3 with S3-compatible API for R2 integration.
 * 
 * Environment Variables:
 * - R2_ACCOUNT_ID: Cloudflare account ID
 * - R2_ACCESS_KEY_ID: R2 API access key
 * - R2_SECRET_ACCESS_KEY: R2 API secret key
 * - R2_BUCKET_NAME: R2 bucket name
 * - R2_PUBLIC_URL: Public URL prefix for downloads (optional)
 * 
 * @see docs/DRIVE_UPLOAD_STRATEGY.md
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type PutObjectCommandInput,
  type GetObjectCommandInput,
  type DeleteObjectCommandInput,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as Sentry from '@sentry/node';

// ============================================================================
// Configuration
// ============================================================================

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string;
}

/** Default signed URL expiration (1 hour) */
const DEFAULT_SIGNED_URL_EXPIRY = 3600;

/** Maximum file size for export uploads (500MB) */
export const MAX_EXPORT_SIZE = 500 * 1024 * 1024;

/** Allowed content types for exports */
export const ALLOWED_EXPORT_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/flac',
  'audio/x-flac',
  'application/octet-stream', // For generic binary uploads
] as const;

// ============================================================================
// Types
// ============================================================================

export interface UploadOptions {
  /** Content type (MIME type) */
  contentType: string;
  /** Optional content disposition for download filename */
  contentDisposition?: string;
  /** Optional metadata key-value pairs */
  metadata?: Record<string, string>;
  /** Optional cache control header */
  cacheControl?: string;
}

export interface UploadResult {
  /** Storage key for the uploaded file */
  key: string;
  /** Full URL for the uploaded file (if public URL configured) */
  url?: string;
  /** ETag returned by R2 */
  etag?: string;
  /** Size of uploaded file in bytes */
  size: number;
}

export interface FileMetadata {
  /** Storage key */
  key: string;
  /** Content type */
  contentType?: string;
  /** Size in bytes */
  size: number;
  /** Last modified timestamp */
  lastModified?: Date;
  /** ETag */
  etag?: string;
  /** Custom metadata */
  metadata?: Record<string, string>;
}

export class R2Error extends Error {
  constructor(
    message: string,
    public readonly code: R2ErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'R2Error';
  }
}

export type R2ErrorCode =
  | 'CONFIG_MISSING'
  | 'UPLOAD_FAILED'
  | 'DOWNLOAD_FAILED'
  | 'DELETE_FAILED'
  | 'FILE_NOT_FOUND'
  | 'INVALID_CONTENT_TYPE'
  | 'FILE_TOO_LARGE'
  | 'PRESIGN_FAILED';

// ============================================================================
// R2 Service Class
// ============================================================================

/**
 * Cloudflare R2 Storage Service
 * 
 * Provides upload, download, and delete operations for export files.
 * 
 * @example
 * ```ts
 * const r2 = new R2Service();
 * 
 * // Upload an export
 * const result = await r2.uploadExport('exports/user123/project456.wav', buffer, 'audio/wav');
 * 
 * // Get a signed download URL
 * const url = await r2.getDownloadUrl(result.key, 3600);
 * 
 * // Delete when no longer needed
 * await r2.deleteExport(result.key);
 * ```
 */
export class R2Service {
  private client: S3Client;
  private bucketName: string;
  private publicUrl?: string;

  constructor(config?: Partial<R2Config>) {
    const accountId = config?.accountId ?? process.env.R2_ACCOUNT_ID;
    const accessKeyId = config?.accessKeyId ?? process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = config?.secretAccessKey ?? process.env.R2_SECRET_ACCESS_KEY;
    this.bucketName = config?.bucketName ?? process.env.R2_BUCKET_NAME ?? '';
    this.publicUrl = config?.publicUrl ?? process.env.R2_PUBLIC_URL;

    // Validate required configuration
    if (!accountId || !accessKeyId || !secretAccessKey || !this.bucketName) {
      const missing = [
        !accountId && 'R2_ACCOUNT_ID',
        !accessKeyId && 'R2_ACCESS_KEY_ID',
        !secretAccessKey && 'R2_SECRET_ACCESS_KEY',
        !this.bucketName && 'R2_BUCKET_NAME',
      ].filter(Boolean);

      throw new R2Error(
        `Missing required R2 configuration: ${missing.join(', ')}`,
        'CONFIG_MISSING'
      );
    }

    // Initialize S3 client with R2 endpoint
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * Upload an export file to R2
   * 
   * @param key - Storage key (path) for the file
   * @param buffer - File content as Buffer
   * @param contentType - MIME type of the file
   * @param options - Optional upload configuration
   * @returns Upload result with key and optional URL
   * @throws R2Error on failure
   */
  async uploadExport(
    key: string,
    buffer: Buffer,
    contentType: string,
    options: Partial<UploadOptions> = {}
  ): Promise<UploadResult> {
    return Sentry.startSpan(
      {
        name: 'r2.upload',
        op: 'storage.upload',
        attributes: {
          key,
          content_type: contentType,
          size: buffer.length,
        },
      },
      async () => {
        try {
      // Validate file size
      if (buffer.length > MAX_EXPORT_SIZE) {
        throw new R2Error(
          `File size ${buffer.length} exceeds maximum allowed ${MAX_EXPORT_SIZE}`,
          'FILE_TOO_LARGE'
        );
      }

      // Validate content type
      if (!this.isValidContentType(contentType)) {
        Sentry.addBreadcrumb({
          category: 'r2',
          message: `Invalid content type: ${contentType}`,
          level: 'warning',
        });
        // Allow but log - don't block uploads
      }

      const input: PutObjectCommandInput = {
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ContentLength: buffer.length,
      };

      // Add optional parameters
      if (options.contentDisposition) {
        input.ContentDisposition = options.contentDisposition;
      }
      if (options.cacheControl) {
        input.CacheControl = options.cacheControl;
      }
      if (options.metadata) {
        input.Metadata = options.metadata;
      }

      const command = new PutObjectCommand(input);
      const response = await this.client.send(command);

      const result: UploadResult = {
        key,
        size: buffer.length,
        etag: response.ETag?.replace(/"/g, ''),
      };

      // Add public URL if configured
      if (this.publicUrl) {
        result.url = `${this.publicUrl}/${key}`;
      }

      return result;
        } catch (error) {

      if (error instanceof R2Error) {
        throw error;
      }

          Sentry.captureException(error, {
            tags: {
              component: 'r2-service',
              operation: 'upload',
            },
            extra: { key, contentType, size: buffer.length },
          });

          throw new R2Error(
            `Failed to upload file: ${error instanceof Error ? error.message : String(error)}`,
            'UPLOAD_FAILED',
            error instanceof Error ? error : undefined
          );
        }
      }
    );
  }

  /**
   * Generate a signed download URL for a file
   * 
   * @param key - Storage key for the file
   * @param expiresIn - URL expiration in seconds (default: 1 hour)
   * @returns Signed download URL
   * @throws R2Error on failure
   */
  async getDownloadUrl(key: string, expiresIn: number = DEFAULT_SIGNED_URL_EXPIRY): Promise<string> {
    return Sentry.startSpan(
      {
        name: 'r2.getDownloadUrl',
        op: 'storage.presign',
        attributes: { key, expires_in: expiresIn },
      },
      async () => {
        try {
          // First check if file exists
          await this.getFileMetadata(key);

          const input: GetObjectCommandInput = {
            Bucket: this.bucketName,
            Key: key,
          };

          const command = new GetObjectCommand(input);
          const url = await getSignedUrl(this.client, command, { expiresIn });

          return url;
        } catch (error) {
          if (error instanceof R2Error) {
            throw error;
          }

          Sentry.captureException(error, {
            tags: {
              component: 'r2-service',
              operation: 'presign',
            },
            extra: { key, expiresIn },
          });

          throw new R2Error(
            `Failed to generate download URL: ${error instanceof Error ? error.message : String(error)}`,
            'PRESIGN_FAILED',
            error instanceof Error ? error : undefined
          );
        }
      }
    );
  }

  /**
   * Delete an export file from R2
   * 
   * @param key - Storage key for the file to delete
   * @throws R2Error on failure (does not throw if file doesn't exist)
   */
  async deleteExport(key: string): Promise<void> {
    return Sentry.startSpan(
      {
        name: 'r2.delete',
        op: 'storage.delete',
        attributes: { key },
      },
      async () => {
        try {
          const input: DeleteObjectCommandInput = {
            Bucket: this.bucketName,
            Key: key,
          };

          const command = new DeleteObjectCommand(input);
          await this.client.send(command);
        } catch (error) {
          Sentry.captureException(error, {
            tags: {
              component: 'r2-service',
              operation: 'delete',
            },
            extra: { key },
          });

          throw new R2Error(
            `Failed to delete file: ${error instanceof Error ? error.message : String(error)}`,
            'DELETE_FAILED',
            error instanceof Error ? error : undefined
          );
        }
      }
    );
  }

  /**
   * Get metadata for a file
   * 
   * @param key - Storage key for the file
   * @returns File metadata
   * @throws R2Error if file not found or on failure
   */
  async getFileMetadata(key: string): Promise<FileMetadata> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response: HeadObjectCommandOutput = await this.client.send(command);

      return {
        key,
        contentType: response.ContentType,
        size: response.ContentLength ?? 0,
        lastModified: response.LastModified,
        etag: response.ETag?.replace(/"/g, ''),
        metadata: response.Metadata,
      };
    } catch (error) {
      // Check for 404/NotFound
      if (
        error instanceof Error &&
        ('$metadata' in error || error.name === 'NotFound' || error.message.includes('404'))
      ) {
        throw new R2Error(`File not found: ${key}`, 'FILE_NOT_FOUND');
      }

      throw new R2Error(
        `Failed to get file metadata: ${error instanceof Error ? error.message : String(error)}`,
        'DOWNLOAD_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * List files with a given prefix
   * 
   * @param prefix - Key prefix to filter by
   * @param maxKeys - Maximum number of results (default: 100)
   * @returns Array of file metadata
   */
  async listFiles(prefix: string, maxKeys: number = 100): Promise<FileMetadata[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await this.client.send(command);

      return (response.Contents ?? []).map((item) => ({
        key: item.Key ?? '',
        size: item.Size ?? 0,
        lastModified: item.LastModified,
        etag: item.ETag?.replace(/"/g, ''),
      }));
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          component: 'r2-service',
          operation: 'list',
        },
        extra: { prefix, maxKeys },
      });

      throw new R2Error(
        `Failed to list files: ${error instanceof Error ? error.message : String(error)}`,
        'DOWNLOAD_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Generate a unique storage key for an export
   * 
   * @param userId - User ID
   * @param projectId - Project ID
   * @param format - Export format (wav, mp3, flac)
   * @returns Unique storage key
   */
  static generateExportKey(
    userId: string,
    projectId: string,
    format: 'wav' | 'mp3' | 'flac'
  ): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `exports/${userId}/${projectId}/${timestamp}-${random}.${format}`;
  }

  /**
   * Check if a content type is valid for exports
   */
  private isValidContentType(contentType: string): boolean {
    return ALLOWED_EXPORT_TYPES.includes(contentType as typeof ALLOWED_EXPORT_TYPES[number]);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let r2Instance: R2Service | null = null;

/**
 * Get or create the R2 service singleton
 * 
 * @param config - Optional configuration override
 * @returns R2Service instance
 * @throws R2Error if configuration is missing
 */
export function getR2Service(config?: Partial<R2Config>): R2Service {
  if (!r2Instance || config) {
    r2Instance = new R2Service(config);
  }
  return r2Instance;
}

/**
 * Reset the R2 service singleton (useful for testing)
 */
export function resetR2Service(): void {
  r2Instance = null;
}
