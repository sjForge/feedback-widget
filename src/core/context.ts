/**
 * Context collector for auto-capturing browser info and errors
 */

import type { FeedbackContext, ConsoleError, NetworkError, WidgetConfig } from '../types';

const MAX_ERRORS = 10; // Maximum number of errors to store

/**
 * Context collector that captures browser info and errors
 */
export class ContextCollector {
  private consoleErrors: ConsoleError[] = [];
  private networkErrors: NetworkError[] = [];
  private customContext: Record<string, unknown> = {};
  private originalConsoleError: typeof console.error | null = null;
  private config: WidgetConfig;

  constructor(config: WidgetConfig) {
    this.config = config;
    this.customContext = config.customContext || {};
  }

  /**
   * Start collecting errors
   */
  start(): void {
    if (this.config.features?.captureConsoleErrors !== false) {
      this.startConsoleCapture();
    }
    if (this.config.features?.captureNetworkErrors !== false) {
      this.startNetworkCapture();
    }
  }

  /**
   * Stop collecting errors
   */
  stop(): void {
    this.stopConsoleCapture();
  }

  /**
   * Update custom context
   */
  setCustomContext(context: Record<string, unknown>): void {
    this.customContext = { ...this.customContext, ...context };
  }

  /**
   * Get the current context snapshot
   */
  getContext(): FeedbackContext {
    return {
      // Browser/device info
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      viewport_width: typeof window !== 'undefined' ? window.innerWidth : undefined,
      viewport_height: typeof window !== 'undefined' ? window.innerHeight : undefined,
      screen_width: typeof screen !== 'undefined' ? screen.width : undefined,
      screen_height: typeof screen !== 'undefined' ? screen.height : undefined,
      device_pixel_ratio: typeof window !== 'undefined' ? window.devicePixelRatio : undefined,
      platform: this.getPlatform(),

      // Application state
      current_url: typeof window !== 'undefined' ? window.location.href : undefined,
      current_route: this.getCurrentRoute(),
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,

      // Captured errors
      console_errors: [...this.consoleErrors],
      network_errors: [...this.networkErrors],

      // Custom context
      custom: { ...this.customContext },
    };
  }

  /**
   * Get collected console errors
   */
  getConsoleErrors(): ConsoleError[] {
    return [...this.consoleErrors];
  }

  /**
   * Get collected network errors
   */
  getNetworkErrors(): NetworkError[] {
    return [...this.networkErrors];
  }

  /**
   * Clear collected errors
   */
  clearErrors(): void {
    this.consoleErrors = [];
    this.networkErrors = [];
  }

  /**
   * Add a console error manually
   */
  addConsoleError(message: string, stack?: string): void {
    this.consoleErrors.push({
      message,
      stack,
      timestamp: new Date().toISOString(),
    });

    // Keep only the most recent errors
    if (this.consoleErrors.length > MAX_ERRORS) {
      this.consoleErrors = this.consoleErrors.slice(-MAX_ERRORS);
    }
  }

  /**
   * Add a network error manually
   */
  addNetworkError(url: string, method: string, status: number, statusText: string): void {
    this.networkErrors.push({
      url,
      method,
      status,
      statusText,
      timestamp: new Date().toISOString(),
    });

    // Keep only the most recent errors
    if (this.networkErrors.length > MAX_ERRORS) {
      this.networkErrors = this.networkErrors.slice(-MAX_ERRORS);
    }
  }

  private startConsoleCapture(): void {
    if (typeof console === 'undefined') return;

    this.originalConsoleError = console.error;

    console.error = (...args: unknown[]) => {
      // Call original
      this.originalConsoleError?.apply(console, args);

      // Capture error
      const message = args
        .map((arg) => {
          if (arg instanceof Error) {
            return arg.message;
          }
          if (typeof arg === 'string') {
            return arg;
          }
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        })
        .join(' ');

      const stack = args.find((arg) => arg instanceof Error)?.stack;
      this.addConsoleError(message, stack);
    };
  }

  private stopConsoleCapture(): void {
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
      this.originalConsoleError = null;
    }
  }

  private startNetworkCapture(): void {
    if (typeof window === 'undefined') return;

    // Patch fetch
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method || 'GET';

      try {
        const response = await originalFetch(input, init);

        if (!response.ok) {
          this.addNetworkError(url, method, response.status, response.statusText);
        }

        return response;
      } catch (error) {
        this.addNetworkError(url, method, 0, error instanceof Error ? error.message : 'Network error');
        throw error;
      }
    };

    // Patch XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const self = this;

    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      ...args: unknown[]
    ) {
      (this as XMLHttpRequest & { _feedbackWidget: { method: string; url: string } })._feedbackWidget = {
        method,
        url: typeof url === 'string' ? url : url.href,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return originalXHROpen.apply(this, [method, url, ...args] as any);
    };

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const xhr = this as XMLHttpRequest & { _feedbackWidget?: { method: string; url: string } };

      xhr.addEventListener('load', function () {
        if (xhr.status >= 400 && xhr._feedbackWidget) {
          self.addNetworkError(
            xhr._feedbackWidget.url,
            xhr._feedbackWidget.method,
            xhr.status,
            xhr.statusText
          );
        }
      });

      xhr.addEventListener('error', function () {
        if (xhr._feedbackWidget) {
          self.addNetworkError(
            xhr._feedbackWidget.url,
            xhr._feedbackWidget.method,
            0,
            'Network error'
          );
        }
      });

      return originalXHRSend.apply(this, [body]);
    };
  }

  private getPlatform(): string | undefined {
    if (typeof navigator === 'undefined') return undefined;

    const userAgent = navigator.userAgent;

    if (/Windows/.test(userAgent)) return 'Windows';
    if (/Macintosh/.test(userAgent)) return 'macOS';
    if (/Linux/.test(userAgent)) return 'Linux';
    if (/iPhone|iPad|iPod/.test(userAgent)) return 'iOS';
    if (/Android/.test(userAgent)) return 'Android';

    return navigator.platform || undefined;
  }

  private getCurrentRoute(): string | undefined {
    if (typeof window === 'undefined') return undefined;

    // Try to get SPA route from common router patterns
    // This is a best-effort approach for common frameworks

    // Check for hash routing
    if (window.location.hash) {
      return window.location.hash;
    }

    // Return pathname for standard routing
    return window.location.pathname;
  }
}
