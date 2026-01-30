/**
 * Electron Preload Entry Point
 *
 * Import this in your Electron preload script to get the types and utilities
 * for setting up the feedback widget API.
 *
 * @example
 * ```typescript
 * import { IPC_CHANNELS, type FeedbackWidgetPreloadAPI } from '@sjforge/feedback-widget/electron-preload';
 * ```
 */

export {
  IPC_CHANNELS,
  type FeedbackWidgetPreloadAPI,
  type PreloadAPIConfig,
  type ElectronPreloadAPI,
  type ElectronContext,
} from './adapters/electron-preload';
