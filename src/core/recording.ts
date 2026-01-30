/**
 * Session Recording module using rrweb
 * Records DOM events for replay
 */

import { record } from 'rrweb';
import type { recordOptions, eventWithTime } from 'rrweb/typings/types';
import type { WidgetConfig } from '../types';

export interface RecordingOptions {
  /** Maximum recording duration in milliseconds (default: 5 minutes) */
  maxDuration?: number;
  /** Sampling configuration for mouse movement */
  sampling?: {
    mousemove?: boolean | number;
    mouseInteraction?: boolean;
    scroll?: number;
    input?: 'all' | 'last';
  };
  /** CSS selectors to mask (content hidden) */
  maskSelectors?: string[];
  /** CSS selectors to block (element hidden entirely) */
  blockSelectors?: string[];
  /** Mask all text content */
  maskAllText?: boolean;
  /** Mask all inputs */
  maskAllInputs?: boolean;
  /** Callback when recording stops (due to max duration or manual stop) */
  onStop?: (events: eventWithTime[]) => void;
  /** Callback for recording errors */
  onError?: (error: Error) => void;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  startTime: number | null;
  duration: number;
  eventCount: number;
}

const DEFAULT_MAX_DURATION = 5 * 60 * 1000; // 5 minutes

const DEFAULT_MASK_SELECTORS = [
  '[data-feedback-mask]',
  '.feedback-mask',
  'input[type="password"]',
  'input[type="credit-card"]',
  '[autocomplete*="cc-"]',
];

const DEFAULT_BLOCK_SELECTORS = [
  '[data-feedback-block]',
  '.feedback-block',
  '.feedback-widget-container',
];

/**
 * Session Recorder class
 *
 * Usage:
 * ```typescript
 * const recorder = new SessionRecorder({
 *   maxDuration: 60000, // 1 minute
 *   onStop: (events) => {
 *     console.log('Recording stopped', events.length, 'events');
 *   },
 * });
 *
 * recorder.start();
 * // ... user interacts with page
 * const events = recorder.stop();
 * ```
 */
export class SessionRecorder {
  private options: RecordingOptions;
  private events: eventWithTime[] = [];
  private stopFn: (() => void) | null = null;
  private state: RecordingState = {
    isRecording: false,
    isPaused: false,
    startTime: null,
    duration: 0,
    eventCount: 0,
  };
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: RecordingOptions = {}) {
    this.options = options;
  }

  /**
   * Create recorder from widget config
   */
  static fromConfig(config: WidgetConfig): SessionRecorder {
    return new SessionRecorder({
      maskSelectors: config.privacy?.maskSelectors,
      blockSelectors: config.privacy?.blockSelectors,
      maskAllInputs: true,
    });
  }

  /**
   * Start recording
   */
  start(): void {
    if (this.state.isRecording) {
      console.warn('Recording is already in progress');
      return;
    }

    this.events = [];
    this.state = {
      isRecording: true,
      isPaused: false,
      startTime: Date.now(),
      duration: 0,
      eventCount: 0,
    };

    // Build mask/block class lists
    const maskSelectors = [
      ...DEFAULT_MASK_SELECTORS,
      ...(this.options.maskSelectors || []),
    ];
    const blockSelectors = [
      ...DEFAULT_BLOCK_SELECTORS,
      ...(this.options.blockSelectors || []),
    ];

    // Configure rrweb recording
    const recordConfig: recordOptions<eventWithTime> = {
      emit: (event) => {
        if (!this.state.isPaused) {
          this.events.push(event);
          this.state.eventCount = this.events.length;
        }
      },
      sampling: this.options.sampling || {
        mousemove: 50, // Sample every 50ms
        mouseInteraction: true,
        scroll: 150, // Sample every 150ms
        input: 'last',
      },
      // Privacy: mask text content in specified elements
      maskTextSelector: maskSelectors.join(', '),
      // Privacy: block specified elements entirely
      blockSelector: blockSelectors.join(', '),
      // Privacy: mask all inputs if specified
      maskAllInputs: this.options.maskAllInputs ?? true,
      // Privacy: mask all text if specified
      maskTextFn: this.options.maskAllText
        ? () => '••••••'
        : undefined,
      // Don't record the widget itself
      checkoutEveryNms: 30000, // Full snapshot every 30 seconds
      // Inline styles for accurate replay
      inlineStylesheet: true,
      // Record canvas content
      recordCanvas: false, // Can be expensive
    };

    try {
      this.stopFn = record(recordConfig);
    } catch (error) {
      this.state.isRecording = false;
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    // Update duration timer
    this.durationTimer = setInterval(() => {
      if (this.state.startTime && !this.state.isPaused) {
        this.state.duration = Date.now() - this.state.startTime;
      }
    }, 100);

    // Max duration timer
    const maxDuration = this.options.maxDuration || DEFAULT_MAX_DURATION;
    this.maxDurationTimer = setTimeout(() => {
      if (this.state.isRecording) {
        console.log('Recording stopped: max duration reached');
        this.stop();
      }
    }, maxDuration);
  }

  /**
   * Pause recording
   */
  pause(): void {
    if (!this.state.isRecording || this.state.isPaused) return;
    this.state.isPaused = true;
  }

  /**
   * Resume recording
   */
  resume(): void {
    if (!this.state.isRecording || !this.state.isPaused) return;
    this.state.isPaused = false;
  }

  /**
   * Stop recording and return events
   */
  stop(): eventWithTime[] {
    if (!this.state.isRecording) {
      return this.events;
    }

    // Stop rrweb recording
    this.stopFn?.();
    this.stopFn = null;

    // Clear timers
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }

    // Update final state
    if (this.state.startTime) {
      this.state.duration = Date.now() - this.state.startTime;
    }
    this.state.isRecording = false;
    this.state.isPaused = false;

    // Callback
    this.options.onStop?.(this.events);

    return this.events;
  }

  /**
   * Discard recording
   */
  discard(): void {
    this.stop();
    this.events = [];
    this.state.eventCount = 0;
    this.state.duration = 0;
  }

  /**
   * Get current state
   */
  getState(): Readonly<RecordingState> {
    return { ...this.state };
  }

  /**
   * Get recorded events
   */
  getEvents(): eventWithTime[] {
    return [...this.events];
  }

  /**
   * Check if recording is supported
   */
  static isSupported(): boolean {
    return (
      typeof document !== 'undefined' &&
      typeof MutationObserver !== 'undefined'
    );
  }
}

/**
 * Serialize events to JSON string
 */
export function serializeEvents(events: eventWithTime[]): string {
  return JSON.stringify(events);
}

/**
 * Deserialize events from JSON string
 */
export function deserializeEvents(json: string): eventWithTime[] {
  return JSON.parse(json);
}

/**
 * Get recording size estimate in bytes
 */
export function getRecordingSize(events: eventWithTime[]): number {
  return new Blob([serializeEvents(events)]).size;
}

/**
 * Compress events using gzip (via pako)
 */
export async function compressEvents(events: eventWithTime[]): Promise<Uint8Array> {
  const { gzip } = await import('pako');
  const json = serializeEvents(events);
  return gzip(json);
}

/**
 * Decompress events
 */
export async function decompressEvents(compressed: Uint8Array): Promise<eventWithTime[]> {
  const { ungzip } = await import('pako');
  const json = ungzip(compressed, { to: 'string' });
  return deserializeEvents(json);
}
