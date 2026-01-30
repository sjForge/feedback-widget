/**
 * Feedback Widget SDK Types
 */

export type FeedbackType = 'bug' | 'feature' | 'design';
export type FeedbackPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Widget initialization options
 */
export interface WidgetConfig {
  /** Project ID (from your feedback portal) */
  projectId: string;

  /** API key for authentication (from admin panel) */
  apiKey: string;

  /** API endpoint URL (defaults to https://feedback.sjforge.dev/api/widget) */
  apiUrl?: string;

  /** Adapter for platform-specific functionality */
  adapter?: WidgetAdapter;

  /** User information (optional) */
  user?: {
    name?: string;
    email?: string;
  };

  /** Custom context to include with every submission */
  customContext?: Record<string, unknown>;

  /** Privacy settings */
  privacy?: {
    /** CSS selectors to mask in recordings/screenshots */
    maskSelectors?: string[];
    /** CSS selectors to completely block from recordings */
    blockSelectors?: string[];
    /** Auto-mask password fields (default: true) */
    autoMaskPasswords?: boolean;
  };

  /** UI customization */
  ui?: {
    /** Button position */
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    /** Primary color (hex or CSS color) */
    primaryColor?: string;
    /** Show floating button (default: true) */
    showButton?: boolean;
    /** Button text (default: 'Feedback') */
    buttonText?: string;
    /** Z-index for widget (default: 9999) */
    zIndex?: number;
  };

  /** Feature flags */
  features?: {
    /** Enable screenshot capture (default: true) */
    screenshots?: boolean;
    /** Enable session recording (default: false) */
    recording?: boolean;
    /** Enable console error capture (default: true) */
    captureConsoleErrors?: boolean;
    /** Enable network error capture (default: true) */
    captureNetworkErrors?: boolean;
  };

  /** Callbacks */
  onOpen?: () => void;
  onClose?: () => void;
  onSubmit?: (feedback: FeedbackSubmission) => void;
  onError?: (error: Error) => void;
}

/**
 * Platform adapter interface
 * Implement this for Electron, React Native, etc.
 */
export interface WidgetAdapter {
  /** Platform name for identification */
  platform: 'web' | 'electron' | 'react-native';

  /** Capture a screenshot - returns base64 data URL or null */
  captureScreenshot?(): Promise<string | null>;

  /** Get platform-specific context */
  getContext?(): Promise<Record<string, unknown>>;

  /** Open external URL (for privacy policy, etc.) */
  openUrl?(url: string): void;

  /** Store data offline */
  storeOffline?(key: string, data: unknown): Promise<void>;

  /** Retrieve offline data */
  getOffline?(key: string): Promise<unknown | null>;

  /** Clear offline data */
  clearOffline?(key: string): Promise<void>;
}

/**
 * Feedback submission payload
 */
export interface FeedbackSubmission {
  type: FeedbackType;
  priority: FeedbackPriority;
  title: string;
  description: string;
  submitter_name?: string;
  submitter_email?: string;
  widget_version?: string;
  context?: FeedbackContext;
}

/**
 * Auto-captured context
 */
export interface FeedbackContext {
  user_agent?: string;
  viewport_width?: number;
  viewport_height?: number;
  screen_width?: number;
  screen_height?: number;
  device_pixel_ratio?: number;
  platform?: string;
  current_url?: string;
  current_route?: string;
  referrer?: string;
  console_errors?: ConsoleError[];
  network_errors?: NetworkError[];
  custom?: Record<string, unknown>;
}

/**
 * Captured console error
 */
export interface ConsoleError {
  message: string;
  stack?: string;
  timestamp: string;
}

/**
 * Captured network error
 */
export interface NetworkError {
  url: string;
  method: string;
  status: number;
  statusText: string;
  timestamp: string;
}

/**
 * API response types
 */
export interface SubmissionResponse {
  success: boolean;
  feedback_id?: string;
  error?: string;
}

/**
 * Internal widget state
 */
export interface WidgetState {
  isOpen: boolean;
  isSubmitting: boolean;
  isRecording: boolean;
  capturedScreenshot: string | null;
  consoleErrors: ConsoleError[];
  networkErrors: NetworkError[];
}

/**
 * Annotation data for screenshots
 */
export interface AnnotationData {
  shapes: AnnotationShape[];
}

/**
 * Individual annotation shape
 */
export interface AnnotationShape {
  type: 'rectangle' | 'arrow' | 'text' | 'highlight' | 'blur';
  x: number; // Relative coordinate (0-1)
  y: number; // Relative coordinate (0-1)
  width?: number; // For rectangle/highlight/blur
  height?: number; // For rectangle/highlight/blur
  endX?: number; // For arrow
  endY?: number; // For arrow
  text?: string; // For text
  color: string; // Hex color
}

/**
 * Screenshot options
 */
export interface ScreenshotOptions {
  /** Element to capture (defaults to document.body) */
  element?: HTMLElement;
  /** Quality for JPEG output (0-1) */
  quality?: number;
  /** Output format */
  format?: 'png' | 'jpeg';
  /** Scale factor */
  scale?: number;
}

/**
 * Recording state
 */
export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  startTime: number | null;
  duration: number;
  eventCount: number;
}

/**
 * Recording metadata (stored in database)
 */
export interface RecordingMetadata {
  id: string;
  feedbackId: string;
  storagePath: string;
  fileSize: number;
  durationMs: number;
  eventCount: number;
  isCompressed: boolean;
  createdAt: string;
}
