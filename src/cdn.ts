/**
 * CDN entry point for @sjforge/feedback-widget
 *
 * This file is compiled to an IIFE bundle that exposes FeedbackWidget as a global.
 *
 * Usage:
 * <script src="https://cdn.sjforge.dev/feedback-widget.min.js"></script>
 * <script>
 *   FeedbackWidget.init({
 *     projectId: 'my-project',
 *     apiKey: 'fpk_xxxxx',
 *   });
 * </script>
 */

import { FeedbackWidget } from './core/widget';

// Export for IIFE global
export { FeedbackWidget };

// Also attach to window for non-module usage
if (typeof window !== 'undefined') {
  (window as unknown as { FeedbackWidget: typeof FeedbackWidget }).FeedbackWidget = FeedbackWidget;
}

// Auto-initialize if data attributes are present
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const script = document.querySelector('script[data-feedback-project-id]');
    if (script) {
      const projectId = script.getAttribute('data-feedback-project-id');
      const apiKey = script.getAttribute('data-feedback-api-key');
      const position = script.getAttribute('data-feedback-position') as
        | 'bottom-right'
        | 'bottom-left'
        | 'top-right'
        | 'top-left'
        | null;
      const primaryColor = script.getAttribute('data-feedback-color');

      if (projectId && apiKey) {
        FeedbackWidget.init({
          projectId,
          apiKey,
          ui: {
            position: position || 'bottom-right',
            primaryColor: primaryColor || '#007bff',
            showButton: true,
          },
        });
      }
    }
  });
}
