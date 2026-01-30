/**
 * Offline Queue - IndexedDB-based storage for offline feedback submissions
 * Automatically syncs when connection is restored
 */

import type { FeedbackSubmission, AnnotationData } from '../types';

const DB_NAME = 'feedback-widget-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-submissions';

export interface QueuedSubmission {
  id: string;
  submission: FeedbackSubmission;
  screenshot?: string;
  annotations?: AnnotationData;
  recordingData?: Uint8Array;
  recordingMetadata?: {
    durationMs: number;
    eventCount: number;
  };
  createdAt: number;
  retryCount: number;
  lastError?: string;
}

export interface OfflineQueueConfig {
  maxRetries?: number;
  retryDelayMs?: number;
  onSyncStart?: () => void;
  onSyncComplete?: (succeeded: number, failed: number) => void;
  onSubmissionSynced?: (id: string) => void;
  onSubmissionFailed?: (id: string, error: string) => void;
}

/**
 * Offline Queue Manager
 * Stores feedback submissions in IndexedDB when offline and syncs when online
 */
export class OfflineQueue {
  private db: IDBDatabase | null = null;
  private config: OfflineQueueConfig;
  private isOnline: boolean;
  private syncInProgress = false;
  private syncCallback: ((submission: QueuedSubmission) => Promise<boolean>) | null = null;

  constructor(config: OfflineQueueConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 5000,
      ...config,
    };
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  /**
   * Initialize the offline queue (opens IndexedDB)
   */
  async init(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      console.warn('OfflineQueue: IndexedDB not available');
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('OfflineQueue: Failed to open database', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.setupNetworkListeners();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store for pending submissions
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('retryCount', 'retryCount', { unique: false });
        }
      };
    });
  }

  /**
   * Set the sync callback that will be called to submit queued items
   */
  setSyncCallback(callback: (submission: QueuedSubmission) => Promise<boolean>): void {
    this.syncCallback = callback;
  }

  /**
   * Check if currently online
   */
  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Add a submission to the offline queue
   */
  async enqueue(item: Omit<QueuedSubmission, 'id' | 'createdAt' | 'retryCount'>): Promise<string> {
    if (!this.db) {
      throw new Error('OfflineQueue not initialized');
    }

    const id = this.generateId();
    const queuedItem: QueuedSubmission = {
      ...item,
      id,
      createdAt: Date.now(),
      retryCount: 0,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(queuedItem);

      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all pending submissions
   */
  async getPending(): Promise<QueuedSubmission[]> {
    if (!this.db) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('createdAt');
      const request = index.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get count of pending submissions
   */
  async getPendingCount(): Promise<number> {
    if (!this.db) {
      return 0;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Remove a submission from the queue
   */
  async remove(id: string): Promise<void> {
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update a submission in the queue (for retry tracking)
   */
  async update(item: QueuedSubmission): Promise<void> {
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Trigger sync of all pending submissions
   */
  async sync(): Promise<{ succeeded: number; failed: number }> {
    if (!this.isOnline || this.syncInProgress || !this.syncCallback) {
      return { succeeded: 0, failed: 0 };
    }

    this.syncInProgress = true;
    this.config.onSyncStart?.();

    let succeeded = 0;
    let failed = 0;

    try {
      const pending = await this.getPending();

      for (const item of pending) {
        // Skip items that have exceeded max retries
        if (item.retryCount >= (this.config.maxRetries || 3)) {
          this.config.onSubmissionFailed?.(item.id, 'Max retries exceeded');
          await this.remove(item.id);
          failed++;
          continue;
        }

        try {
          const success = await this.syncCallback(item);

          if (success) {
            await this.remove(item.id);
            this.config.onSubmissionSynced?.(item.id);
            succeeded++;
          } else {
            // Update retry count
            item.retryCount++;
            item.lastError = 'Sync failed';
            await this.update(item);
            failed++;
          }
        } catch (error) {
          // Update retry count and error
          item.retryCount++;
          item.lastError = error instanceof Error ? error.message : 'Unknown error';
          await this.update(item);
          this.config.onSubmissionFailed?.(item.id, item.lastError);
          failed++;
        }

        // Small delay between submissions to avoid overwhelming the server
        if (pending.indexOf(item) < pending.length - 1) {
          await this.delay(100);
        }
      }
    } finally {
      this.syncInProgress = false;
      this.config.onSyncComplete?.(succeeded, failed);
    }

    return { succeeded, failed };
  }

  /**
   * Clear all pending submissions
   */
  async clear(): Promise<void> {
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.removeNetworkListeners();
  }

  // Private methods

  private setupNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  private removeNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  private handleOnline = (): void => {
    this.isOnline = true;
    // Trigger sync after a short delay to let connection stabilize
    setTimeout(() => {
      this.sync();
    }, this.config.retryDelayMs || 5000);
  };

  private handleOffline = (): void => {
    this.isOnline = false;
  };

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Check if offline storage is supported
 */
export function isOfflineStorageSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}
