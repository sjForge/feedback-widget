/**
 * Electron Adapter - Adapter for Electron desktop applications
 *
 * This adapter communicates with Electron's main process via a preload script.
 * The preload script must expose a `feedbackWidget` API on the window object.
 *
 * @example
 * ```typescript
 * // In your renderer process
 * import { FeedbackWidget, ElectronAdapter } from '@sjforge/feedback-widget';
 *
 * FeedbackWidget.init({
 *   projectId: 'my-app',
 *   apiKey: 'fpk_xxx',
 *   adapter: new ElectronAdapter(window.feedbackWidget),
 * });
 * ```
 */

import type { WidgetAdapter } from '../types';

/**
 * Interface for the preload script API
 * This must be exposed via contextBridge in the Electron preload script
 */
export interface ElectronPreloadAPI {
  /** Capture a screenshot of the current window */
  captureScreenshot: () => Promise<string | null>;

  /** Get Electron-specific context (app version, OS, etc.) */
  getContext: () => Promise<ElectronContext>;

  /** Open a URL in the default browser */
  openExternal: (url: string) => void;

  /** Store data in the app's userData directory */
  storeData: (key: string, data: string) => Promise<void>;

  /** Retrieve data from the app's userData directory */
  getData: (key: string) => Promise<string | null>;

  /** Delete data from the app's userData directory */
  deleteData: (key: string) => Promise<void>;

  /** Get app info */
  getAppInfo: () => Promise<{
    name: string;
    version: string;
    electronVersion: string;
    chromeVersion: string;
    nodeVersion: string;
  }>;

  /** Check if running in development mode */
  isDev: () => boolean;
}

/**
 * Electron-specific context information
 */
export interface ElectronContext {
  /** App name from package.json */
  appName: string;
  /** App version from package.json */
  appVersion: string;
  /** Electron version */
  electronVersion: string;
  /** Chrome version */
  chromeVersion: string;
  /** Node.js version */
  nodeVersion: string;
  /** Operating system platform */
  platform: NodeJS.Platform;
  /** Operating system architecture */
  arch: string;
  /** Operating system version */
  osVersion: string;
  /** System locale */
  locale: string;
  /** Whether running in development mode */
  isDev: boolean;
  /** Current window bounds */
  windowBounds?: {
    width: number;
    height: number;
    x: number;
    y: number;
  };
}

/**
 * Electron Adapter for desktop applications
 */
export class ElectronAdapter implements WidgetAdapter {
  platform = 'electron' as const;
  private api: ElectronPreloadAPI;

  /**
   * Create an Electron adapter
   * @param api - The preload API exposed via contextBridge (usually window.feedbackWidget)
   */
  constructor(api: ElectronPreloadAPI) {
    if (!api) {
      throw new Error(
        'ElectronAdapter: No preload API provided. ' +
        'Make sure feedbackWidget is exposed via contextBridge in your preload script.'
      );
    }
    this.api = api;
  }

  /**
   * Capture a screenshot using Electron's desktopCapturer
   */
  async captureScreenshot(): Promise<string | null> {
    try {
      return await this.api.captureScreenshot();
    } catch (error) {
      console.error('ElectronAdapter: Screenshot capture failed:', error);
      return null;
    }
  }

  /**
   * Get Electron-specific context
   */
  async getContext(): Promise<Record<string, unknown>> {
    try {
      const context = await this.api.getContext();
      const appInfo = await this.api.getAppInfo();

      return {
        // App info
        appName: appInfo.name,
        appVersion: appInfo.version,
        electronVersion: appInfo.electronVersion,
        chromeVersion: appInfo.chromeVersion,
        nodeVersion: appInfo.nodeVersion,

        // System info
        platform: context.platform,
        arch: context.arch,
        osVersion: context.osVersion,
        locale: context.locale,
        isDev: context.isDev,

        // Window info
        windowBounds: context.windowBounds,
      };
    } catch (error) {
      console.error('ElectronAdapter: Failed to get context:', error);
      return {};
    }
  }

  /**
   * Open URL in default browser
   */
  openUrl(url: string): void {
    try {
      this.api.openExternal(url);
    } catch (error) {
      console.error('ElectronAdapter: Failed to open URL:', error);
      // Fallback to window.open
      window.open(url, '_blank');
    }
  }

  /**
   * Store data in app's userData directory
   * Uses JSON file storage for persistence across sessions
   */
  async storeOffline(key: string, data: unknown): Promise<void> {
    try {
      const serialized = JSON.stringify(data);
      await this.api.storeData(`feedback_widget_${key}`, serialized);
    } catch (error) {
      console.error('ElectronAdapter: Failed to store data:', error);
    }
  }

  /**
   * Retrieve data from app's userData directory
   */
  async getOffline(key: string): Promise<unknown | null> {
    try {
      const data = await this.api.getData(`feedback_widget_${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('ElectronAdapter: Failed to retrieve data:', error);
      return null;
    }
  }

  /**
   * Delete data from app's userData directory
   */
  async clearOffline(key: string): Promise<void> {
    try {
      await this.api.deleteData(`feedback_widget_${key}`);
    } catch (error) {
      console.error('ElectronAdapter: Failed to delete data:', error);
    }
  }

  /**
   * Check if running in development mode
   */
  isDevelopment(): boolean {
    try {
      return this.api.isDev();
    } catch {
      return false;
    }
  }
}

/**
 * Create an Electron adapter from the window object
 * @param windowApi - The window object or specific API (defaults to window.feedbackWidget)
 */
export function createElectronAdapter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  windowApi?: any
): ElectronAdapter {
  const api = windowApi?.feedbackWidget || windowApi;

  if (!api) {
    throw new Error(
      'createElectronAdapter: feedbackWidget API not found. ' +
      'Make sure your preload script exposes the feedbackWidget API via contextBridge.'
    );
  }

  return new ElectronAdapter(api);
}
