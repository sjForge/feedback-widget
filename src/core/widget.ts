/**
 * Main FeedbackWidget class
 * Entry point for the SDK
 */

import { FeedbackTransport } from './transport';
import { ContextCollector } from './context';
import { captureScreenshotWithConfig, isScreenshotSupported } from './screenshot';
import { SessionRecorder, compressEvents } from './recording';
import { OfflineQueue, isOfflineStorageSupported } from './offline-queue';
import type { QueuedSubmission } from './offline-queue';
import { WidgetUI } from '../ui/widget-ui';
import type {
  WidgetConfig,
  WidgetState,
  WidgetAdapter,
  FeedbackSubmission,
  FeedbackType,
  FeedbackPriority,
  SubmissionResponse,
  AnnotationData,
  RecordingState,
} from '../types';

const SDK_VERSION = '0.2.0';

/**
 * FeedbackWidget - Main SDK class
 *
 * Usage:
 * ```typescript
 * import { FeedbackWidget } from '@sjforge/feedback-widget';
 *
 * FeedbackWidget.init({
 *   projectId: 'my-project',
 *   apiKey: 'fpk_xxxxx',
 * });
 *
 * // Submit feedback programmatically
 * await FeedbackWidget.submit({
 *   type: 'bug',
 *   priority: 'high',
 *   title: 'Button not working',
 *   description: 'The submit button does nothing when clicked',
 * });
 * ```
 */
export class FeedbackWidget {
  private static instance: FeedbackWidget | null = null;

  private config: WidgetConfig;
  private transport: FeedbackTransport;
  private contextCollector: ContextCollector;
  private adapter: WidgetAdapter | null;
  private recorder: SessionRecorder | null = null;
  private offlineQueue: OfflineQueue | null = null;
  private ui: WidgetUI | null = null;
  private state: WidgetState;
  private recordingUpdateInterval: ReturnType<typeof setInterval> | null = null;

  private constructor(config: WidgetConfig) {
    this.config = config;

    // Initialize transport
    this.transport = new FeedbackTransport({
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
    });

    // Initialize context collector
    this.contextCollector = new ContextCollector(config);

    // Store adapter (can be provided or will use default web adapter)
    this.adapter = config.adapter || null;

    // Initialize state
    this.state = {
      isOpen: false,
      isSubmitting: false,
      isRecording: false,
      capturedScreenshot: null,
      consoleErrors: [],
      networkErrors: [],
    };

    // Start collecting context
    this.contextCollector.start();

    // Initialize offline queue if supported
    this.initOfflineQueue();

    // Initialize UI if in browser environment
    if (typeof document !== 'undefined') {
      this.initUI();
    }
  }

  private async initOfflineQueue(): Promise<void> {
    if (!isOfflineStorageSupported()) {
      return;
    }

    this.offlineQueue = new OfflineQueue({
      maxRetries: 3,
      retryDelayMs: 5000,
      onSyncStart: () => {
        console.log('FeedbackWidget: Syncing offline submissions...');
      },
      onSyncComplete: (succeeded, failed) => {
        if (succeeded > 0 || failed > 0) {
          console.log(`FeedbackWidget: Sync complete. ${succeeded} succeeded, ${failed} failed`);
        }
      },
      onSubmissionSynced: (id) => {
        console.log(`FeedbackWidget: Offline submission ${id} synced successfully`);
      },
      onSubmissionFailed: (id, error) => {
        console.warn(`FeedbackWidget: Failed to sync submission ${id}: ${error}`);
      },
    });

    // Set the sync callback
    this.offlineQueue.setSyncCallback(async (queued) => {
      return this.syncQueuedSubmission(queued);
    });

    try {
      await this.offlineQueue.init();

      // Check for pending submissions on init
      const pendingCount = await this.offlineQueue.getPendingCount();
      if (pendingCount > 0) {
        console.log(`FeedbackWidget: ${pendingCount} offline submission(s) pending`);
      }
    } catch (error) {
      console.error('FeedbackWidget: Failed to initialize offline queue:', error);
      this.offlineQueue = null;
    }
  }

  private initUI(): void {
    this.ui = new WidgetUI(this.config, {
      onSubmit: async (data) => {
        const response = await this.submitFeedbackWithScreenshot({
          type: data.type,
          priority: data.priority,
          title: data.title,
          description: data.description,
          screenshot: data.screenshot,
          annotations: data.annotations,
          includeRecording: data.includeRecording,
        });

        if (!response.success) {
          throw new Error(response.error || 'Submission failed');
        }
      },
      onCaptureScreenshot: () => this.captureScreenshotInternal(),
      onStartRecording: () => this.startRecording(),
      onStopRecording: () => this.stopRecording(),
      onPauseRecording: () => this.pauseRecording(),
      onResumeRecording: () => this.resumeRecording(),
      onDiscardRecording: () => this.discardRecording(),
      getRecordingState: () => this.getRecordingState(),
      onOpen: () => {
        this.state.isOpen = true;
        this.config.onOpen?.();
      },
      onClose: () => {
        this.state.isOpen = false;
        this.config.onClose?.();
      },
    });
  }

  /**
   * Initialize the widget
   */
  static init(config: WidgetConfig): FeedbackWidget {
    if (FeedbackWidget.instance) {
      console.warn('FeedbackWidget is already initialized. Call destroy() first to reinitialize.');
      return FeedbackWidget.instance;
    }

    // Validate required config
    if (!config.projectId) {
      throw new Error('FeedbackWidget: projectId is required');
    }
    if (!config.apiKey) {
      throw new Error('FeedbackWidget: apiKey is required');
    }

    FeedbackWidget.instance = new FeedbackWidget(config);
    return FeedbackWidget.instance;
  }

  /**
   * Get the current instance
   */
  static getInstance(): FeedbackWidget | null {
    return FeedbackWidget.instance;
  }

  /**
   * Destroy the widget instance
   */
  static destroy(): void {
    if (FeedbackWidget.instance) {
      FeedbackWidget.instance.contextCollector.stop();
      FeedbackWidget.instance.offlineQueue?.close();
      FeedbackWidget.instance.ui?.destroy();
      FeedbackWidget.instance = null;
    }
  }

  /**
   * Get count of pending offline submissions
   */
  static async getPendingCount(): Promise<number> {
    const instance = FeedbackWidget.instance;
    if (!instance?.offlineQueue) {
      return 0;
    }
    return instance.offlineQueue.getPendingCount();
  }

  /**
   * Force sync of pending offline submissions
   */
  static async syncOffline(): Promise<{ succeeded: number; failed: number }> {
    const instance = FeedbackWidget.instance;
    if (!instance?.offlineQueue) {
      return { succeeded: 0, failed: 0 };
    }
    return instance.offlineQueue.sync();
  }

  /**
   * Check if currently online
   */
  static isOnline(): boolean {
    const instance = FeedbackWidget.instance;
    if (instance?.offlineQueue) {
      return instance.offlineQueue.getOnlineStatus();
    }
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  /**
   * Submit feedback programmatically
   */
  static async submit(feedback: {
    type: FeedbackType;
    priority: FeedbackPriority;
    title: string;
    description: string;
  }): Promise<SubmissionResponse> {
    const instance = FeedbackWidget.instance;
    if (!instance) {
      return {
        success: false,
        error: 'FeedbackWidget is not initialized. Call FeedbackWidget.init() first.',
      };
    }

    return instance.submitFeedback(feedback);
  }

  /**
   * Set custom context
   */
  static setContext(context: Record<string, unknown>): void {
    const instance = FeedbackWidget.instance;
    if (instance) {
      instance.contextCollector.setCustomContext(context);
    }
  }

  /**
   * Get current context
   */
  static getContext(): ReturnType<ContextCollector['getContext']> | null {
    const instance = FeedbackWidget.instance;
    if (instance) {
      return instance.contextCollector.getContext();
    }
    return null;
  }

  /**
   * Open the feedback form
   */
  static open(): void {
    const instance = FeedbackWidget.instance;
    if (instance?.ui) {
      instance.ui.open();
    }
  }

  /**
   * Close the feedback form
   */
  static close(): void {
    const instance = FeedbackWidget.instance;
    if (instance?.ui) {
      instance.ui.close();
    }
  }

  /**
   * Show or hide the floating button
   */
  static setButtonVisible(visible: boolean): void {
    const instance = FeedbackWidget.instance;
    if (instance?.ui) {
      instance.ui.setButtonVisible(visible);
    }
  }

  /**
   * Check if widget is initialized
   */
  static isInitialized(): boolean {
    return FeedbackWidget.instance !== null;
  }

  /**
   * Get SDK version
   */
  static getVersion(): string {
    return SDK_VERSION;
  }

  /**
   * Capture a screenshot
   */
  static async captureScreenshot(): Promise<string | null> {
    const instance = FeedbackWidget.instance;
    if (!instance) {
      console.warn('FeedbackWidget is not initialized');
      return null;
    }

    return instance.captureScreenshotInternal();
  }

  /**
   * Check if screenshot capture is supported
   */
  static isScreenshotSupported(): boolean {
    return isScreenshotSupported();
  }

  /**
   * Submit feedback with screenshot
   */
  static async submitWithScreenshot(feedback: {
    type: FeedbackType;
    priority: FeedbackPriority;
    title: string;
    description: string;
    screenshot?: string; // Pre-captured screenshot (base64)
    annotations?: AnnotationData;
  }): Promise<SubmissionResponse> {
    const instance = FeedbackWidget.instance;
    if (!instance) {
      return {
        success: false,
        error: 'FeedbackWidget is not initialized. Call FeedbackWidget.init() first.',
      };
    }

    return instance.submitFeedbackWithScreenshot(feedback);
  }

  /**
   * Get currently captured screenshot (if any)
   */
  static getCapturedScreenshot(): string | null {
    const instance = FeedbackWidget.instance;
    return instance?.state.capturedScreenshot || null;
  }

  /**
   * Clear captured screenshot
   */
  static clearCapturedScreenshot(): void {
    const instance = FeedbackWidget.instance;
    if (instance) {
      instance.state.capturedScreenshot = null;
    }
  }

  // Instance methods

  /**
   * Submit feedback
   */
  private async submitFeedback(feedback: {
    type: FeedbackType;
    priority: FeedbackPriority;
    title: string;
    description: string;
  }): Promise<SubmissionResponse> {
    if (this.state.isSubmitting) {
      return {
        success: false,
        error: 'A submission is already in progress',
      };
    }

    this.state.isSubmitting = true;

    try {
      // Build submission payload
      const submission: FeedbackSubmission = {
        type: feedback.type,
        priority: feedback.priority,
        title: feedback.title,
        description: feedback.description,
        widget_version: SDK_VERSION,
        context: this.contextCollector.getContext(),
      };

      // Add user info if configured
      if (this.config.user?.name) {
        submission.submitter_name = this.config.user.name;
      }
      if (this.config.user?.email) {
        submission.submitter_email = this.config.user.email;
      }

      // Submit
      const response = await this.transport.submitFeedback(submission);

      if (response.success) {
        // Clear errors after successful submission
        this.contextCollector.clearErrors();
        this.config.onSubmit?.(submission);
      } else {
        this.config.onError?.(new Error(response.error || 'Submission failed'));
      }

      return response;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.config.onError?.(errorObj);

      return {
        success: false,
        error: errorObj.message,
      };
    } finally {
      this.state.isSubmitting = false;
    }
  }

  /**
   * Get current state
   */
  getState(): Readonly<WidgetState> {
    return { ...this.state };
  }

  /**
   * Get config
   */
  getConfig(): Readonly<WidgetConfig> {
    return { ...this.config };
  }

  // ============================================
  // Recording methods
  // ============================================

  private startRecording(): void {
    if (!this.config.features?.recording) return;

    if (!this.recorder) {
      this.recorder = new SessionRecorder({
        maskSelectors: this.config.privacy?.maskSelectors,
        blockSelectors: this.config.privacy?.blockSelectors,
        // Passwords are always masked via default selectors in recording.ts
        maskAllInputs: this.config.privacy?.autoMaskPasswords !== false,
      });
    }

    this.recorder.start();
    this.state.isRecording = true;

    // Start interval to update UI
    this.recordingUpdateInterval = setInterval(() => {
      this.ui?.updateRecordingIndicator(this.recorder?.getState() || null);
    }, 1000);

    // Show indicator
    this.ui?.updateRecordingIndicator(this.recorder.getState());
  }

  private stopRecording(): void {
    if (this.recorder) {
      this.recorder.stop();
      this.state.isRecording = false;

      // Stop update interval
      if (this.recordingUpdateInterval) {
        clearInterval(this.recordingUpdateInterval);
        this.recordingUpdateInterval = null;
      }

      // Update indicator (hide)
      this.ui?.updateRecordingIndicator(this.recorder.getState());
    }
  }

  private pauseRecording(): void {
    if (this.recorder?.getState().isRecording) {
      this.recorder.pause();
      this.ui?.updateRecordingIndicator(this.recorder.getState());
    }
  }

  private resumeRecording(): void {
    if (this.recorder?.getState().isPaused) {
      this.recorder.resume();
      this.ui?.updateRecordingIndicator(this.recorder.getState());
    }
  }

  private discardRecording(): void {
    if (this.recorder) {
      this.recorder.discard();
      this.state.isRecording = false;

      if (this.recordingUpdateInterval) {
        clearInterval(this.recordingUpdateInterval);
        this.recordingUpdateInterval = null;
      }

      this.ui?.updateRecordingIndicator(null);
    }
  }

  private getRecordingState(): RecordingState {
    return this.recorder?.getState() || {
      isRecording: false,
      isPaused: false,
      startTime: null,
      duration: 0,
      eventCount: 0,
    };
  }

  /**
   * Internal screenshot capture
   */
  private async captureScreenshotInternal(): Promise<string | null> {
    // Check if screenshots are enabled
    if (this.config.features?.screenshots === false) {
      return null;
    }

    try {
      // Use adapter if provided and has screenshot capability
      if (this.adapter?.captureScreenshot) {
        const screenshot = await this.adapter.captureScreenshot();
        if (screenshot) {
          this.state.capturedScreenshot = screenshot;
          return screenshot;
        }
      }

      // Fall back to default capture
      if (!isScreenshotSupported()) {
        console.warn('FeedbackWidget: Screenshot capture not supported');
        return null;
      }

      const screenshot = await captureScreenshotWithConfig(this.config);
      this.state.capturedScreenshot = screenshot;
      return screenshot;
    } catch (error) {
      console.error('FeedbackWidget: Screenshot capture failed:', error);
      return null;
    }
  }

  /**
   * Submit feedback with screenshot and/or recording
   */
  private async submitFeedbackWithScreenshot(feedback: {
    type: FeedbackType;
    priority: FeedbackPriority;
    title: string;
    description: string;
    screenshot?: string;
    annotations?: AnnotationData;
    includeRecording?: boolean;
  }): Promise<SubmissionResponse> {
    if (this.state.isSubmitting) {
      return {
        success: false,
        error: 'A submission is already in progress',
      };
    }

    this.state.isSubmitting = true;

    try {
      // Build submission payload
      const submission: FeedbackSubmission = {
        type: feedback.type,
        priority: feedback.priority,
        title: feedback.title,
        description: feedback.description,
        widget_version: SDK_VERSION,
        context: this.contextCollector.getContext(),
      };

      // Add user info if configured
      if (this.config.user?.name) {
        submission.submitter_name = this.config.user.name;
      }
      if (this.config.user?.email) {
        submission.submitter_email = this.config.user.email;
      }

      // Prepare screenshot data
      const screenshotData = feedback.screenshot || this.state.capturedScreenshot;

      // Prepare recording data if needed
      let recordingData: Uint8Array | undefined;
      let recordingMetadata: { durationMs: number; eventCount: number } | undefined;

      if (feedback.includeRecording && this.recorder) {
        const recordingState = this.recorder.getState();
        if (recordingState.eventCount > 0) {
          const events = this.recorder.getEvents();
          recordingData = await compressEvents(events);
          recordingMetadata = {
            durationMs: recordingState.duration,
            eventCount: recordingState.eventCount,
          };
        }
      }

      // Check if we're online
      const isOnline = this.offlineQueue?.getOnlineStatus() ?? navigator.onLine;

      if (!isOnline && this.offlineQueue) {
        // Queue for later submission
        const queueResult = await this.queueSubmission(
          submission,
          screenshotData || undefined,
          feedback.annotations,
          recordingData,
          recordingMetadata
        );

        if (queueResult.success) {
          // Clear state
          this.contextCollector.clearErrors();
          this.state.capturedScreenshot = null;
          this.discardRecording();
          this.config.onSubmit?.(submission);
        }

        return queueResult;
      }

      // Online - submit immediately
      const response = await this.transport.submitFeedback(submission);

      if (!response.success || !response.feedback_id) {
        // If submission failed due to network, try to queue
        if (this.offlineQueue && this.isNetworkError(response.error)) {
          return this.queueSubmission(
            submission,
            screenshotData || undefined,
            feedback.annotations,
            recordingData,
            recordingMetadata
          );
        }

        this.config.onError?.(new Error(response.error || 'Submission failed'));
        return response;
      }

      // Upload screenshot if provided
      if (screenshotData) {
        const uploadResult = await this.transport.uploadScreenshot(
          response.feedback_id,
          screenshotData,
          feedback.annotations
        );

        if (!uploadResult.success) {
          console.warn('FeedbackWidget: Screenshot upload failed:', uploadResult.error);
          // Don't fail the whole submission, just log the warning
        }
      }

      // Upload recording if available
      if (recordingData && recordingMetadata) {
        const uploadResult = await this.transport.uploadRecording(
          response.feedback_id,
          recordingData,
          recordingMetadata
        );

        if (!uploadResult.success) {
          console.warn('FeedbackWidget: Recording upload failed:', uploadResult.error);
        }
      }

      // Clear state after successful submission
      this.contextCollector.clearErrors();
      this.state.capturedScreenshot = null;
      this.discardRecording(); // Clean up recording
      this.config.onSubmit?.(submission);

      return response;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));

      // Try to queue if it's a network error
      if (this.offlineQueue && this.isNetworkError(errorObj.message)) {
        const submission: FeedbackSubmission = {
          type: feedback.type,
          priority: feedback.priority,
          title: feedback.title,
          description: feedback.description,
          widget_version: SDK_VERSION,
          context: this.contextCollector.getContext(),
        };

        const screenshotData = feedback.screenshot || this.state.capturedScreenshot;
        return this.queueSubmission(submission, screenshotData || undefined, feedback.annotations);
      }

      this.config.onError?.(errorObj);

      return {
        success: false,
        error: errorObj.message,
      };
    } finally {
      this.state.isSubmitting = false;
    }
  }

  /**
   * Check if an error message indicates a network error
   */
  private isNetworkError(error?: string): boolean {
    if (!error) return false;
    const networkErrors = ['network', 'fetch', 'failed to fetch', 'offline', 'timeout', 'ECONNREFUSED'];
    const lowerError = error.toLowerCase();
    return networkErrors.some((e) => lowerError.includes(e));
  }

  /**
   * Sync a queued offline submission
   */
  private async syncQueuedSubmission(queued: QueuedSubmission): Promise<boolean> {
    try {
      // Submit the feedback
      const response = await this.transport.submitFeedback(queued.submission);

      if (!response.success || !response.feedback_id) {
        return false;
      }

      // Upload screenshot if present
      if (queued.screenshot) {
        await this.transport.uploadScreenshot(
          response.feedback_id,
          queued.screenshot,
          queued.annotations
        );
      }

      // Upload recording if present
      if (queued.recordingData && queued.recordingMetadata) {
        await this.transport.uploadRecording(
          response.feedback_id,
          queued.recordingData,
          queued.recordingMetadata
        );
      }

      return true;
    } catch (error) {
      console.error('FeedbackWidget: Failed to sync queued submission:', error);
      return false;
    }
  }

  /**
   * Queue a submission for later sync (when offline)
   */
  private async queueSubmission(
    submission: FeedbackSubmission,
    screenshot?: string,
    annotations?: AnnotationData,
    recordingData?: Uint8Array,
    recordingMetadata?: { durationMs: number; eventCount: number }
  ): Promise<SubmissionResponse> {
    if (!this.offlineQueue) {
      return {
        success: false,
        error: 'Offline queue not available',
      };
    }

    try {
      const id = await this.offlineQueue.enqueue({
        submission,
        screenshot,
        annotations,
        recordingData,
        recordingMetadata,
      });

      return {
        success: true,
        feedback_id: `offline-${id}`, // Indicate this is queued
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to queue submission',
      };
    }
  }

  /**
   * Upload recording via chunked upload
   */
  private async uploadRecording(feedbackId: string): Promise<void> {
    if (!this.recorder) return;

    const events = this.recorder.getEvents();
    if (events.length === 0) return;

    const state = this.recorder.getState();

    try {
      // Compress the events
      const compressedData = await compressEvents(events);

      // Upload via chunked upload (transport handles everything)
      const uploadResult = await this.transport.uploadRecording(
        feedbackId,
        compressedData,
        {
          durationMs: state.duration,
          eventCount: state.eventCount,
        }
      );

      if (!uploadResult.success) {
        console.warn('FeedbackWidget: Recording upload failed:', uploadResult.error);
      }
    } catch (error) {
      console.error('FeedbackWidget: Recording upload error:', error);
    }
  }
}
