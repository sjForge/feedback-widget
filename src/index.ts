/**
 * @sjforge/feedback-widget
 *
 * In-app feedback widget SDK with screenshots, annotations, and session recording.
 *
 * @example
 * ```typescript
 * import { FeedbackWidget } from '@sjforge/feedback-widget';
 *
 * // Initialize the widget
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
 *
 * // Add custom context
 * FeedbackWidget.setContext({
 *   userId: 'user-123',
 *   subscription: 'premium',
 * });
 * ```
 */

// Main widget class
export { FeedbackWidget } from './core/widget';

// Transport layer (for advanced use cases)
export { FeedbackTransport } from './core/transport';

// Context collector (for advanced use cases)
export { ContextCollector } from './core/context';

// Screenshot capture
export {
  captureScreenshot,
  isScreenshotSupported,
} from './core/screenshot';

// Session recording
export {
  SessionRecorder,
  serializeEvents,
  deserializeEvents,
  getRecordingSize,
  compressEvents,
  decompressEvents,
} from './core/recording';
export type { RecordingOptions } from './core/recording';

// Offline queue
export {
  OfflineQueue,
  isOfflineStorageSupported,
} from './core/offline-queue';
export type { QueuedSubmission, OfflineQueueConfig } from './core/offline-queue';

// Adapters
export { WebAdapter, createWebAdapter } from './adapters/web';
export { ElectronAdapter, createElectronAdapter } from './adapters/electron';
export type { ElectronPreloadAPI, ElectronContext } from './adapters/electron';

// UI Components
export { AnnotationEditor } from './ui/annotation-editor';
export type { AnnotationEditorOptions, AnnotationEditorStyles, AnnotationTool } from './ui/annotation-editor';
export { WidgetUI } from './ui/widget-ui';
export type { WidgetUICallbacks } from './ui/widget-ui';

// Types
export type {
  // Config types
  WidgetConfig,
  WidgetAdapter,
  // Feedback types
  FeedbackType,
  FeedbackPriority,
  FeedbackSubmission,
  FeedbackContext,
  // Error types
  ConsoleError,
  NetworkError,
  // Response types
  SubmissionResponse,
  // State types
  WidgetState,
  // Annotation types
  AnnotationData,
  AnnotationShape,
  // Screenshot types
  ScreenshotOptions,
} from './types';

// Default export for convenience
export { FeedbackWidget as default } from './core/widget';
