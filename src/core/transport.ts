/**
 * Transport layer for API communication
 * Handles authentication, signing, and request/response
 */

import type { FeedbackSubmission, SubmissionResponse } from '../types';

const DEFAULT_API_URL = 'https://feedback.sjforge.dev/api/widget';

export interface TransportConfig {
  apiKey: string;
  apiUrl?: string;
}

/**
 * Creates an HMAC-SHA256 signature for request authentication
 */
async function createSignature(
  apiKey: string,
  timestamp: string,
  body: string
): Promise<string> {
  const message = `${timestamp}:${body}`;

  // Use Web Crypto API (works in browsers and Node.js 18+)
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiKey);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

  // Convert to hex string
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Transport client for sending feedback to the API
 */
export class FeedbackTransport {
  private apiKey: string;
  private apiUrl: string;

  constructor(config: TransportConfig) {
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl || DEFAULT_API_URL;
  }

  /**
   * Submit feedback to the API
   */
  async submitFeedback(submission: FeedbackSubmission): Promise<SubmissionResponse> {
    const body = JSON.stringify(submission);
    const timestamp = Date.now().toString();
    const signature = await createSignature(this.apiKey, timestamp, body);

    const response = await fetch(`${this.apiUrl}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Request failed with status ${response.status}`,
      };
    }

    return {
      success: true,
      feedback_id: data.feedback_id,
    };
  }

  /**
   * Initialize chunked upload for large files (recordings)
   * Returns an upload ID for subsequent chunk uploads
   */
  async initChunkedUpload(
    feedbackId: string,
    totalSize: number,
    fileName: string
  ): Promise<{ uploadId: string } | { error: string }> {
    const body = JSON.stringify({ feedbackId, totalSize, fileName });
    const timestamp = Date.now().toString();
    const signature = await createSignature(this.apiKey, timestamp, body);

    const response = await fetch(`${this.apiUrl}/upload/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || 'Failed to initialize upload' };
    }

    return { uploadId: data.uploadId };
  }

  /**
   * Upload a chunk of data
   */
  async uploadChunk(
    uploadId: string,
    chunkIndex: number,
    chunk: Blob
  ): Promise<{ success: boolean; error?: string }> {
    const formData = new FormData();
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('chunk', chunk);

    const timestamp = Date.now().toString();
    // For FormData, we sign the uploadId + chunkIndex
    const signatureData = `${uploadId}:${chunkIndex}`;
    const signature = await createSignature(this.apiKey, timestamp, signatureData);

    const response = await fetch(`${this.apiUrl}/upload/chunk`, {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to upload chunk' };
    }

    return { success: true };
  }

  /**
   * Complete chunked upload
   */
  async completeChunkedUpload(
    uploadId: string,
    totalChunks: number
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const body = JSON.stringify({ uploadId, totalChunks });
    const timestamp = Date.now().toString();
    const signature = await createSignature(this.apiKey, timestamp, body);

    const response = await fetch(`${this.apiUrl}/upload/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to complete upload' };
    }

    return { success: true, path: data.path };
  }

  /**
   * Upload a screenshot (simple single-request upload)
   */
  async uploadScreenshot(
    feedbackId: string,
    imageData: string, // base64 data URL
    annotations?: unknown
  ): Promise<{ success: boolean; attachmentId?: string; error?: string }> {
    const body = JSON.stringify({
      feedbackId,
      imageData,
      annotations,
    });
    const timestamp = Date.now().toString();
    const signature = await createSignature(this.apiKey, timestamp, body);

    const response = await fetch(`${this.apiUrl}/upload/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to upload screenshot' };
    }

    return { success: true, attachmentId: data.attachmentId };
  }

  /**
   * Upload a recording with automatic compression and chunking
   */
  async uploadRecording(
    feedbackId: string,
    compressedData: Uint8Array,
    metadata: {
      durationMs: number;
      eventCount: number;
    }
  ): Promise<{ success: boolean; recordingId?: string; error?: string }> {
    const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
    const totalSize = compressedData.length;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

    // Initialize upload
    const initResult = await this.initChunkedUpload(
      feedbackId,
      totalSize,
      `recording_${Date.now()}.json.gz`
    );

    if ('error' in initResult) {
      return { success: false, error: initResult.error };
    }

    const { uploadId } = initResult;

    // Upload chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunk = compressedData.slice(start, end);

      const chunkResult = await this.uploadChunk(
        uploadId,
        i,
        new Blob([chunk], { type: 'application/gzip' })
      );

      if (!chunkResult.success) {
        return { success: false, error: chunkResult.error || `Failed to upload chunk ${i}` };
      }
    }

    // Complete upload
    const completeResult = await this.completeChunkedUpload(uploadId, totalChunks);

    if (!completeResult.success) {
      return { success: false, error: completeResult.error };
    }

    // Create recording metadata record
    const metadataBody = JSON.stringify({
      feedbackId,
      uploadId,
      storagePath: completeResult.path,
      fileSize: totalSize,
      durationMs: metadata.durationMs,
      eventCount: metadata.eventCount,
      isCompressed: true,
    });
    const timestamp = Date.now().toString();
    const signature = await createSignature(this.apiKey, timestamp, metadataBody);

    const metadataResponse = await fetch(`${this.apiUrl}/upload/recording/metadata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
      body: metadataBody,
    });

    const metadataData = await metadataResponse.json();

    if (!metadataResponse.ok) {
      return { success: false, error: metadataData.error || 'Failed to save recording metadata' };
    }

    return { success: true, recordingId: metadataData.recordingId };
  }
}
