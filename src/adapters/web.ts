/**
 * Web Adapter - Default adapter for browser environments
 */

import type { WidgetAdapter, WidgetConfig } from '../types';
import { captureScreenshot, isScreenshotSupported } from '../core/screenshot';

export interface WebAdapterOptions {
  /** Privacy masking selectors */
  maskSelectors?: string[];
  /** Elements to block from capture */
  blockSelectors?: string[];
  /** Auto-mask password fields */
  autoMaskPasswords?: boolean;
}

/**
 * Default web adapter for browser environments
 */
export class WebAdapter implements WidgetAdapter {
  platform = 'web' as const;
  private options: WebAdapterOptions;

  constructor(options: WebAdapterOptions = {}) {
    this.options = options;
  }

  /**
   * Configure adapter from widget config
   */
  static fromConfig(config: WidgetConfig): WebAdapter {
    return new WebAdapter({
      maskSelectors: config.privacy?.maskSelectors,
      blockSelectors: config.privacy?.blockSelectors,
      autoMaskPasswords: config.privacy?.autoMaskPasswords,
    });
  }

  /**
   * Capture a screenshot using html2canvas
   */
  async captureScreenshot(): Promise<string | null> {
    if (!isScreenshotSupported()) {
      console.warn('FeedbackWidget: Screenshot capture not supported in this environment');
      return null;
    }

    try {
      const dataUrl = await captureScreenshot({
        maskSelectors: this.options.maskSelectors,
        blockSelectors: this.options.blockSelectors,
        autoMaskPasswords: this.options.autoMaskPasswords,
      });
      return dataUrl;
    } catch (error) {
      console.error('FeedbackWidget: Screenshot capture failed:', error);
      return null;
    }
  }

  /**
   * Get web-specific context
   */
  async getContext(): Promise<Record<string, unknown>> {
    return {
      language: navigator.language,
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      doNotTrack: navigator.doNotTrack,
      colorScheme: this.getColorScheme(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      connection: this.getConnectionInfo(),
    };
  }

  /**
   * Get network connection info if available
   */
  private getConnectionInfo(): Record<string, unknown> | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;

    if (!connection) {
      return null;
    }

    return {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData,
    };
  }

  /**
   * Open URL in new tab
   */
  openUrl(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * Store data in localStorage
   */
  async storeOffline(key: string, data: unknown): Promise<void> {
    try {
      localStorage.setItem(`feedback_widget_${key}`, JSON.stringify(data));
    } catch (error) {
      console.warn('FeedbackWidget: Failed to store offline data:', error);
    }
  }

  /**
   * Get data from localStorage
   */
  async getOffline(key: string): Promise<unknown | null> {
    try {
      const data = localStorage.getItem(`feedback_widget_${key}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  /**
   * Clear data from localStorage
   */
  async clearOffline(key: string): Promise<void> {
    try {
      localStorage.removeItem(`feedback_widget_${key}`);
    } catch (error) {
      console.warn('FeedbackWidget: Failed to clear offline data:', error);
    }
  }

  private getColorScheme(): 'light' | 'dark' | 'no-preference' {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return 'no-preference';
    }

    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'no-preference';
  }
}

/**
 * Create a web adapter instance
 */
export function createWebAdapter(): WebAdapter {
  return new WebAdapter();
}
