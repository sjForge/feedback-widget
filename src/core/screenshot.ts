/**
 * Screenshot capture module using html2canvas
 */

import html2canvas from 'html2canvas';
import type { WidgetConfig } from '../types';

export interface ScreenshotOptions {
  /** Element to capture (defaults to document.body) */
  element?: HTMLElement;
  /** Quality for JPEG output (0-1, default 0.9) */
  quality?: number;
  /** Output format */
  format?: 'png' | 'jpeg';
  /** Scale factor (default: window.devicePixelRatio) */
  scale?: number;
  /** Additional CSS selectors to mask */
  maskSelectors?: string[];
  /** CSS selectors to completely exclude */
  blockSelectors?: string[];
  /** Auto-mask password fields (default: true) */
  autoMaskPasswords?: boolean;
}

const DEFAULT_MASK_SELECTORS = [
  '[data-feedback-mask]',
  '.feedback-mask',
];

const DEFAULT_BLOCK_SELECTORS = [
  '[data-feedback-block]',
  '.feedback-block',
  '.feedback-widget-container', // Don't capture the widget itself
];

/**
 * Apply privacy masking to elements before capture
 */
function applyPrivacyMasking(
  element: HTMLElement,
  options: ScreenshotOptions
): { restore: () => void } {
  const originalStyles: Map<HTMLElement, string> = new Map();
  const originalValues: Map<HTMLInputElement, string> = new Map();

  // Combine default and custom selectors
  const maskSelectors = [
    ...DEFAULT_MASK_SELECTORS,
    ...(options.maskSelectors || []),
  ];

  const blockSelectors = [
    ...DEFAULT_BLOCK_SELECTORS,
    ...(options.blockSelectors || []),
  ];

  // Mask elements
  for (const selector of maskSelectors) {
    const elements = element.querySelectorAll<HTMLElement>(selector);
    elements.forEach((el) => {
      originalStyles.set(el, el.style.cssText);
      el.style.cssText += `
        background-color: #333 !important;
        color: transparent !important;
        text-shadow: none !important;
        -webkit-text-fill-color: transparent !important;
      `;
    });
  }

  // Block elements (hide completely)
  for (const selector of blockSelectors) {
    const elements = element.querySelectorAll<HTMLElement>(selector);
    elements.forEach((el) => {
      originalStyles.set(el, el.style.cssText);
      el.style.cssText += 'visibility: hidden !important;';
    });
  }

  // Auto-mask password fields
  if (options.autoMaskPasswords !== false) {
    const passwordInputs = element.querySelectorAll<HTMLInputElement>(
      'input[type="password"]'
    );
    passwordInputs.forEach((input) => {
      originalValues.set(input, input.value);
      input.value = '••••••••';
    });
  }

  // Mask other sensitive inputs
  const sensitiveInputs = element.querySelectorAll<HTMLInputElement>(
    'input[type="email"], input[name*="card"], input[name*="credit"], input[name*="cvv"], input[name*="ssn"], input[autocomplete*="cc-"]'
  );
  sensitiveInputs.forEach((input) => {
    if (!originalValues.has(input)) {
      originalValues.set(input, input.value);
      input.value = input.value.replace(/./g, '•');
    }
  });

  return {
    restore: () => {
      // Restore styles
      originalStyles.forEach((style, el) => {
        el.style.cssText = style;
      });
      // Restore values
      originalValues.forEach((value, input) => {
        input.value = value;
      });
    },
  };
}

/**
 * Capture a screenshot of the page or element
 */
export async function captureScreenshot(
  options: ScreenshotOptions = {}
): Promise<string> {
  const element = options.element || document.body;
  const format = options.format || 'png';
  const quality = options.quality || 0.9;
  const scale = options.scale || window.devicePixelRatio || 1;

  // Apply privacy masking
  const { restore } = applyPrivacyMasking(element, options);

  try {
    // Capture with html2canvas
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      // Ignore elements that shouldn't be captured
      ignoreElements: (el) => {
        // Skip the widget container
        if (el.classList?.contains('feedback-widget-container')) {
          return true;
        }
        // Skip elements with data-feedback-block
        if (el.hasAttribute?.('data-feedback-block')) {
          return true;
        }
        return false;
      },
    });

    // Convert to data URL
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const dataUrl = canvas.toDataURL(mimeType, quality);

    return dataUrl;
  } finally {
    // Always restore original state
    restore();
  }
}

/**
 * Capture screenshot with config-based options
 */
export async function captureScreenshotWithConfig(
  config: WidgetConfig
): Promise<string> {
  return captureScreenshot({
    maskSelectors: config.privacy?.maskSelectors,
    blockSelectors: config.privacy?.blockSelectors,
    autoMaskPasswords: config.privacy?.autoMaskPasswords,
  });
}

/**
 * Check if screenshot capture is supported
 */
export function isScreenshotSupported(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof document.createElement('canvas').getContext === 'function'
  );
}
