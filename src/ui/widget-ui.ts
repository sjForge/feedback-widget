/**
 * Widget UI - Floating button and feedback form
 * Framework-agnostic implementation
 */

import type {
  WidgetConfig,
  FeedbackType,
  FeedbackPriority,
  AnnotationData,
  RecordingState,
} from '../types';
import { AnnotationEditor } from './annotation-editor';

export interface WidgetUICallbacks {
  onSubmit: (data: {
    type: FeedbackType;
    priority: FeedbackPriority;
    title: string;
    description: string;
    screenshot?: string;
    annotations?: AnnotationData;
    includeRecording?: boolean;
  }) => Promise<void>;
  onCaptureScreenshot: () => Promise<string | null>;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onPauseRecording?: () => void;
  onResumeRecording?: () => void;
  onDiscardRecording?: () => void;
  getRecordingState?: () => RecordingState;
  onOpen?: () => void;
  onClose?: () => void;
}

interface UIElements {
  container: HTMLDivElement;
  button: HTMLButtonElement;
  recordingIndicator: HTMLDivElement | null;
  modal: HTMLDivElement | null;
  annotationEditor: AnnotationEditor | null;
}

const FEEDBACK_TYPES: { value: FeedbackType; label: string; icon: string }[] = [
  { value: 'bug', label: 'Bug Report', icon: '🐛' },
  { value: 'feature', label: 'Feature Request', icon: '✨' },
  { value: 'design', label: 'Design Feedback', icon: '🎨' },
];

const PRIORITIES: { value: FeedbackPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: '#6b7280' },
  { value: 'medium', label: 'Medium', color: '#f59e0b' },
  { value: 'high', label: 'High', color: '#f97316' },
  { value: 'critical', label: 'Critical', color: '#ef4444' },
];

/**
 * Widget UI Manager
 */
export class WidgetUI {
  private config: WidgetConfig;
  private callbacks: WidgetUICallbacks;
  private elements: UIElements;
  private isOpen = false;
  private isSubmitting = false;
  private capturedScreenshot: string | null = null;
  private annotations: AnnotationData | null = null;
  private isAnnotating = false;

  // Form state
  private formState = {
    type: 'bug' as FeedbackType,
    priority: 'medium' as FeedbackPriority,
    title: '',
    description: '',
  };

  constructor(config: WidgetConfig, callbacks: WidgetUICallbacks) {
    this.config = config;
    this.callbacks = callbacks;

    // Create container
    const container = document.createElement('div');
    container.className = 'feedback-widget-container';
    container.dataset.feedbackBlock = 'true'; // Don't capture in screenshots
    container.style.cssText = `
      position: fixed;
      z-index: ${config.ui?.zIndex || 9999};
      font-family: system-ui, -apple-system, sans-serif;
    `;
    document.body.appendChild(container);

    // Create floating button
    const button = this.createFloatingButton();
    container.appendChild(button);

    // Create recording indicator (hidden by default)
    const recordingIndicator = this.createRecordingIndicator();
    container.appendChild(recordingIndicator);

    this.elements = {
      container,
      button,
      recordingIndicator,
      modal: null,
      annotationEditor: null,
    };

    // Setup context menu if in browser
    if (config.ui?.showButton !== false) {
      this.setupContextMenu();
    }
  }

  private createFloatingButton(): HTMLButtonElement {
    const position = this.config.ui?.position || 'bottom-right';
    const primaryColor = this.config.ui?.primaryColor || '#3b82f6';
    const buttonText = this.config.ui?.buttonText || 'Feedback';

    const positionStyles: Record<string, string> = {
      'bottom-right': 'bottom: 20px; right: 20px;',
      'bottom-left': 'bottom: 20px; left: 20px;',
      'top-right': 'top: 20px; right: 20px;',
      'top-left': 'top: 20px; left: 20px;',
    };

    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 6px;">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
      </svg>
      ${buttonText}
    `;
    button.style.cssText = `
      ${positionStyles[position]}
      position: fixed;
      display: flex;
      align-items: center;
      padding: 10px 16px;
      background: ${primaryColor};
      color: white;
      border: none;
      border-radius: 24px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.2s ease;
    `;

    button.onmouseenter = () => {
      button.style.transform = 'scale(1.05)';
      button.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
    };
    button.onmouseleave = () => {
      button.style.transform = 'scale(1)';
      button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    };

    button.onclick = () => this.open();

    if (this.config.ui?.showButton === false) {
      button.style.display = 'none';
    }

    return button;
  }

  private createRecordingIndicator(): HTMLDivElement {
    const position = this.config.ui?.position || 'bottom-right';

    // Position near the button
    const positionStyles: Record<string, string> = {
      'bottom-right': 'bottom: 75px; right: 20px;',
      'bottom-left': 'bottom: 75px; left: 20px;',
      'top-right': 'top: 75px; right: 20px;',
      'top-left': 'top: 75px; left: 20px;',
    };

    const indicator = document.createElement('div');
    indicator.className = 'feedback-recording-indicator';
    indicator.style.cssText = `
      ${positionStyles[position]}
      position: fixed;
      display: none;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #1f2937;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      color: white;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    `;

    // Pulsing red dot
    const dot = document.createElement('span');
    dot.style.cssText = `
      width: 8px;
      height: 8px;
      background: #ef4444;
      border-radius: 50%;
      animation: recording-pulse 1.5s ease-in-out infinite;
    `;
    indicator.appendChild(dot);

    // Text
    const text = document.createElement('span');
    text.className = 'recording-text';
    text.textContent = 'Recording';
    indicator.appendChild(text);

    // Duration
    const duration = document.createElement('span');
    duration.className = 'recording-duration';
    duration.style.cssText = 'opacity: 0.7;';
    duration.textContent = '0:00';
    indicator.appendChild(duration);

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes recording-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(0.9); }
      }
    `;
    document.head.appendChild(style);

    return indicator;
  }

  /**
   * Update recording indicator visibility and duration
   */
  updateRecordingIndicator(state: RecordingState | null): void {
    const indicator = this.elements.recordingIndicator;
    if (!indicator) return;

    if (!state || !state.isRecording) {
      indicator.style.display = 'none';
      return;
    }

    indicator.style.display = 'flex';

    // Update text based on paused state
    const textEl = indicator.querySelector('.recording-text') as HTMLElement;
    if (textEl) {
      textEl.textContent = state.isPaused ? 'Paused' : 'Recording';
    }

    // Update duration
    const durationEl = indicator.querySelector('.recording-duration') as HTMLElement;
    if (durationEl) {
      durationEl.textContent = this.formatDuration(state.duration);
    }

    // Update dot animation
    const dot = indicator.querySelector('span:first-child') as HTMLElement;
    if (dot) {
      dot.style.animationPlayState = state.isPaused ? 'paused' : 'running';
      dot.style.background = state.isPaused ? '#f59e0b' : '#ef4444';
    }
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private setupContextMenu(): void {
    document.addEventListener('contextmenu', (e) => {
      // Check if Shift key is held (alternative trigger)
      if (e.shiftKey) {
        e.preventDefault();
        this.open();
      }
    });
  }

  private createModal(): HTMLDivElement {
    const primaryColor = this.config.ui?.primaryColor || '#3b82f6';

    const modal = document.createElement('div');
    modal.className = 'feedback-widget-modal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      border-radius: 12px;
      width: 100%;
      max-width: 500px;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      transform: translateY(20px);
      transition: transform 0.2s ease;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    header.innerHTML = `
      <h2 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">Send Feedback</h2>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 24px;
      color: #6b7280;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    `;
    closeBtn.onclick = () => this.close();
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    // Form content
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    `;

    // Type selector
    content.appendChild(this.createTypeSelector(primaryColor));

    // Priority selector
    content.appendChild(this.createPrioritySelector());

    // Title input
    content.appendChild(this.createTitleInput());

    // Description textarea
    content.appendChild(this.createDescriptionInput());

    // Screenshot section
    content.appendChild(this.createScreenshotSection(primaryColor));

    // Recording section (if enabled)
    if (this.config.features?.recording) {
      content.appendChild(this.createRecordingSection(primaryColor));
    }

    dialog.appendChild(content);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 16px 20px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 8px 16px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: white;
      color: #374151;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    `;
    cancelBtn.onclick = () => this.close();
    footer.appendChild(cancelBtn);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.id = 'feedback-submit-btn';
    submitBtn.textContent = 'Submit Feedback';
    submitBtn.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      background: ${primaryColor};
      color: white;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    `;
    submitBtn.onclick = () => this.handleSubmit();
    footer.appendChild(submitBtn);

    dialog.appendChild(footer);
    modal.appendChild(dialog);

    // Close on backdrop click
    modal.onclick = (e) => {
      if (e.target === modal) this.close();
    };

    // Animate in
    requestAnimationFrame(() => {
      modal.style.opacity = '1';
      dialog.style.transform = 'translateY(0)';
    });

    return modal;
  }

  private createTypeSelector(primaryColor: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom: 16px;';

    const label = document.createElement('label');
    label.textContent = 'Feedback Type';
    label.style.cssText = `
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
    `;
    wrapper.appendChild(label);

    const options = document.createElement('div');
    options.style.cssText = 'display: flex; gap: 8px;';

    FEEDBACK_TYPES.forEach(({ value, label, icon }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.type = value;
      btn.innerHTML = `${icon} ${label}`;
      btn.style.cssText = `
        flex: 1;
        padding: 8px 12px;
        border: 2px solid ${this.formState.type === value ? primaryColor : '#e5e7eb'};
        border-radius: 8px;
        background: ${this.formState.type === value ? primaryColor + '10' : 'white'};
        color: ${this.formState.type === value ? primaryColor : '#374151'};
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
      `;
      btn.onclick = () => {
        this.formState.type = value;
        this.updateTypeSelector(options, primaryColor);
      };
      options.appendChild(btn);
    });

    wrapper.appendChild(options);
    return wrapper;
  }

  private updateTypeSelector(container: HTMLElement, primaryColor: string): void {
    const buttons = container.querySelectorAll<HTMLButtonElement>('button[data-type]');
    buttons.forEach((btn) => {
      const isActive = btn.dataset.type === this.formState.type;
      btn.style.borderColor = isActive ? primaryColor : '#e5e7eb';
      btn.style.background = isActive ? primaryColor + '10' : 'white';
      btn.style.color = isActive ? primaryColor : '#374151';
    });
  }

  private createPrioritySelector(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom: 16px;';

    const label = document.createElement('label');
    label.textContent = 'Priority';
    label.style.cssText = `
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
    `;
    wrapper.appendChild(label);

    const select = document.createElement('select');
    select.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      font-size: 14px;
      color: #374151;
      background: white;
      cursor: pointer;
    `;

    PRIORITIES.forEach(({ value, label }) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === this.formState.priority;
      select.appendChild(option);
    });

    select.onchange = () => {
      this.formState.priority = select.value as FeedbackPriority;
    };

    wrapper.appendChild(select);
    return wrapper;
  }

  private createTitleInput(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom: 16px;';

    const label = document.createElement('label');
    label.textContent = 'Title';
    label.style.cssText = `
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
    `;
    wrapper.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Brief summary of your feedback';
    input.maxLength = 200;
    input.value = this.formState.title;
    input.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      font-size: 14px;
      color: #374151;
      box-sizing: border-box;
    `;
    input.oninput = () => {
      this.formState.title = input.value;
    };

    wrapper.appendChild(input);
    return wrapper;
  }

  private createDescriptionInput(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom: 16px;';

    const label = document.createElement('label');
    label.textContent = 'Description';
    label.style.cssText = `
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
    `;
    wrapper.appendChild(label);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Describe your feedback in detail...';
    textarea.rows = 4;
    textarea.maxLength = 5000;
    textarea.value = this.formState.description;
    textarea.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      font-size: 14px;
      color: #374151;
      resize: vertical;
      box-sizing: border-box;
    `;
    textarea.oninput = () => {
      this.formState.description = textarea.value;
    };

    wrapper.appendChild(textarea);
    return wrapper;
  }

  private createScreenshotSection(primaryColor: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.id = 'screenshot-section';

    const label = document.createElement('label');
    label.textContent = 'Screenshot';
    label.style.cssText = `
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
    `;
    wrapper.appendChild(label);

    const screenshotEnabled = this.config.features?.screenshots !== false;

    if (!screenshotEnabled) {
      const note = document.createElement('p');
      note.textContent = 'Screenshot capture is disabled';
      note.style.cssText = 'color: #6b7280; font-size: 13px; margin: 0;';
      wrapper.appendChild(note);
      return wrapper;
    }

    const btnWrapper = document.createElement('div');
    btnWrapper.style.cssText = 'display: flex; gap: 8px;';

    const captureBtn = document.createElement('button');
    captureBtn.type = 'button';
    captureBtn.id = 'capture-screenshot-btn';
    captureBtn.innerHTML = `
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 6px;">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
      </svg>
      ${this.capturedScreenshot ? 'Retake' : 'Capture'} Screenshot
    `;
    captureBtn.style.cssText = `
      display: flex;
      align-items: center;
      padding: 8px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: white;
      color: #374151;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    `;
    captureBtn.onclick = () => this.handleCaptureScreenshot();
    btnWrapper.appendChild(captureBtn);

    wrapper.appendChild(btnWrapper);

    // Screenshot preview
    if (this.capturedScreenshot) {
      const preview = document.createElement('div');
      preview.id = 'screenshot-preview';
      preview.style.cssText = `
        margin-top: 12px;
        position: relative;
      `;

      const img = document.createElement('img');
      img.src = this.capturedScreenshot;
      img.style.cssText = `
        width: 100%;
        border-radius: 6px;
        border: 1px solid #e5e7eb;
      `;
      preview.appendChild(img);

      const actions = document.createElement('div');
      actions.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        gap: 4px;
      `;

      const annotateBtn = document.createElement('button');
      annotateBtn.type = 'button';
      annotateBtn.title = 'Annotate';
      annotateBtn.innerHTML = `
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
        </svg>
      `;
      annotateBtn.style.cssText = `
        padding: 6px;
        border: none;
        border-radius: 4px;
        background: ${primaryColor};
        color: white;
        cursor: pointer;
      `;
      annotateBtn.onclick = () => this.openAnnotationEditor();
      actions.appendChild(annotateBtn);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.title = 'Remove';
      removeBtn.innerHTML = `
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      `;
      removeBtn.style.cssText = `
        padding: 6px;
        border: none;
        border-radius: 4px;
        background: #ef4444;
        color: white;
        cursor: pointer;
      `;
      removeBtn.onclick = () => {
        this.capturedScreenshot = null;
        this.annotations = null;
        this.updateScreenshotSection();
      };
      actions.appendChild(removeBtn);

      preview.appendChild(actions);

      // Show annotation indicator
      if (this.annotations && this.annotations.shapes.length > 0) {
        const badge = document.createElement('div');
        badge.style.cssText = `
          position: absolute;
          bottom: 8px;
          left: 8px;
          padding: 4px 8px;
          background: ${primaryColor};
          color: white;
          border-radius: 4px;
          font-size: 12px;
        `;
        badge.textContent = `${this.annotations.shapes.length} annotation${this.annotations.shapes.length > 1 ? 's' : ''}`;
        preview.appendChild(badge);
      }

      wrapper.appendChild(preview);
    }

    return wrapper;
  }

  private updateScreenshotSection(): void {
    const section = this.elements.modal?.querySelector('#screenshot-section');
    if (section) {
      const newSection = this.createScreenshotSection(this.config.ui?.primaryColor || '#3b82f6');
      section.replaceWith(newSection);
    }
  }

  private createRecordingSection(primaryColor: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.id = 'recording-section';
    wrapper.style.cssText = 'margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;';

    const label = document.createElement('label');
    label.textContent = 'Session Recording';
    label.style.cssText = `
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
    `;
    wrapper.appendChild(label);

    const state = this.callbacks.getRecordingState?.();
    const hasRecording = state && state.eventCount > 0;

    // Recording controls
    const controls = document.createElement('div');
    controls.style.cssText = 'display: flex; gap: 8px; align-items: center;';

    if (!state?.isRecording && !hasRecording) {
      // Not recording, show start button
      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.innerHTML = `
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 6px;">
          <circle cx="12" cy="12" r="10" stroke-width="2"/>
          <circle cx="12" cy="12" r="4" fill="currentColor"/>
        </svg>
        Start Recording
      `;
      startBtn.style.cssText = `
        display: flex;
        align-items: center;
        padding: 8px 12px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        background: white;
        color: #374151;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      `;
      startBtn.onclick = () => {
        this.callbacks.onStartRecording?.();
        this.updateRecordingSection();
      };
      controls.appendChild(startBtn);

      const hint = document.createElement('span');
      hint.textContent = 'Record your session to show the issue';
      hint.style.cssText = 'font-size: 12px; color: #6b7280;';
      controls.appendChild(hint);
    } else if (state?.isRecording) {
      // Recording in progress
      const pauseBtn = document.createElement('button');
      pauseBtn.type = 'button';
      pauseBtn.innerHTML = state.isPaused
        ? `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>`
        : `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
      pauseBtn.title = state.isPaused ? 'Resume' : 'Pause';
      pauseBtn.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        background: white;
        color: #374151;
        cursor: pointer;
      `;
      pauseBtn.onclick = () => {
        if (state.isPaused) {
          this.callbacks.onResumeRecording?.();
        } else {
          this.callbacks.onPauseRecording?.();
        }
        this.updateRecordingSection();
      };
      controls.appendChild(pauseBtn);

      const stopBtn = document.createElement('button');
      stopBtn.type = 'button';
      stopBtn.innerHTML = `
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style="margin-right: 6px;">
          <rect x="6" y="6" width="12" height="12" rx="1"/>
        </svg>
        Stop
      `;
      stopBtn.style.cssText = `
        display: flex;
        align-items: center;
        padding: 8px 12px;
        border: none;
        border-radius: 6px;
        background: #ef4444;
        color: white;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      `;
      stopBtn.onclick = () => {
        this.callbacks.onStopRecording?.();
        this.updateRecordingSection();
      };
      controls.appendChild(stopBtn);

      // Show duration
      const duration = document.createElement('span');
      duration.style.cssText = 'font-size: 13px; color: #6b7280; margin-left: 8px;';
      duration.textContent = `${this.formatDuration(state.duration)} • ${state.eventCount} events`;
      controls.appendChild(duration);
    } else if (hasRecording) {
      // Has recording, show preview
      const badge = document.createElement('div');
      badge.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        border-radius: 6px;
        font-size: 13px;
        color: #059669;
      `;
      badge.innerHTML = `
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
        Recording saved (${this.formatDuration(state!.duration)}, ${state!.eventCount} events)
      `;
      controls.appendChild(badge);

      const discardBtn = document.createElement('button');
      discardBtn.type = 'button';
      discardBtn.textContent = 'Discard';
      discardBtn.style.cssText = `
        padding: 6px 10px;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        background: white;
        color: #6b7280;
        font-size: 12px;
        cursor: pointer;
      `;
      discardBtn.onclick = () => {
        this.callbacks.onDiscardRecording?.();
        this.updateRecordingSection();
      };
      controls.appendChild(discardBtn);
    }

    wrapper.appendChild(controls);
    return wrapper;
  }

  private updateRecordingSection(): void {
    const section = this.elements.modal?.querySelector('#recording-section');
    if (section) {
      const newSection = this.createRecordingSection(this.config.ui?.primaryColor || '#3b82f6');
      section.replaceWith(newSection);
    }
  }

  private async handleCaptureScreenshot(): Promise<void> {
    // Hide modal temporarily
    if (this.elements.modal) {
      this.elements.modal.style.display = 'none';
    }
    this.elements.button.style.display = 'none';

    // Wait for modal to hide
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const screenshot = await this.callbacks.onCaptureScreenshot();
      if (screenshot) {
        this.capturedScreenshot = screenshot;
        this.annotations = null;
      }
    } catch (error) {
      console.error('Screenshot capture failed:', error);
    }

    // Show modal again
    if (this.elements.modal) {
      this.elements.modal.style.display = 'flex';
    }
    this.elements.button.style.display = 'flex';

    this.updateScreenshotSection();
  }

  private openAnnotationEditor(): void {
    if (!this.capturedScreenshot || !this.elements.modal) return;

    this.isAnnotating = true;

    // Hide the form
    const formDialog = this.elements.modal.querySelector('div > div') as HTMLElement;
    if (formDialog) {
      formDialog.style.display = 'none';
    }

    // Create annotation editor container
    const editorContainer = document.createElement('div');
    editorContainer.id = 'annotation-editor-container';
    editorContainer.style.cssText = `
      background: white;
      border-radius: 12px;
      width: 100%;
      max-width: 900px;
      max-height: 90vh;
      overflow: hidden;
    `;

    this.elements.modal.appendChild(editorContainer);

    // Create editor
    this.elements.annotationEditor = new AnnotationEditor({
      container: editorContainer,
      imageSrc: this.capturedScreenshot,
      initialAnnotations: this.annotations || undefined,
      onSave: (annotations) => {
        this.annotations = annotations;
        this.closeAnnotationEditor();
      },
      onCancel: () => {
        this.closeAnnotationEditor();
      },
    });
  }

  private closeAnnotationEditor(): void {
    this.isAnnotating = false;

    // Remove editor
    const editorContainer = this.elements.modal?.querySelector('#annotation-editor-container');
    if (editorContainer) {
      editorContainer.remove();
    }
    this.elements.annotationEditor?.destroy();
    this.elements.annotationEditor = null;

    // Show form again
    const formDialog = this.elements.modal?.querySelector('div > div') as HTMLElement;
    if (formDialog) {
      formDialog.style.display = 'flex';
    }

    this.updateScreenshotSection();
  }

  private async handleSubmit(): Promise<void> {
    if (this.isSubmitting) return;

    // Validate
    if (!this.formState.title.trim()) {
      this.showError('Please enter a title');
      return;
    }
    if (!this.formState.description.trim()) {
      this.showError('Please enter a description');
      return;
    }

    this.isSubmitting = true;
    this.updateSubmitButton(true);

    // Check if we have a recording to include
    const recordingState = this.callbacks.getRecordingState?.();
    const hasRecording = recordingState && recordingState.eventCount > 0 && !recordingState.isRecording;

    try {
      await this.callbacks.onSubmit({
        type: this.formState.type,
        priority: this.formState.priority,
        title: this.formState.title.trim(),
        description: this.formState.description.trim(),
        screenshot: this.capturedScreenshot || undefined,
        annotations: this.annotations || undefined,
        includeRecording: hasRecording,
      });

      this.showSuccess();
      this.resetForm();

      // Close after showing success
      setTimeout(() => this.close(), 1500);
    } catch (error) {
      console.error('Submission failed:', error);
      this.showError('Failed to submit feedback. Please try again.');
    } finally {
      this.isSubmitting = false;
      this.updateSubmitButton(false);
    }
  }

  private updateSubmitButton(loading: boolean): void {
    const btn = this.elements.modal?.querySelector('#feedback-submit-btn') as HTMLButtonElement;
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? 'Submitting...' : 'Submit Feedback';
      btn.style.opacity = loading ? '0.7' : '1';
    }
  }

  private showError(message: string): void {
    // Remove existing error
    const existing = this.elements.modal?.querySelector('.feedback-error');
    existing?.remove();

    const error = document.createElement('div');
    error.className = 'feedback-error';
    error.textContent = message;
    error.style.cssText = `
      padding: 12px 16px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      color: #dc2626;
      font-size: 14px;
      margin-bottom: 16px;
    `;

    const content = this.elements.modal?.querySelector('div > div > div:nth-child(2)');
    content?.insertBefore(error, content.firstChild);

    setTimeout(() => error.remove(), 5000);
  }

  private showSuccess(): void {
    const content = this.elements.modal?.querySelector('div > div > div:nth-child(2)') as HTMLElement;
    if (content) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
          <h3 style="margin: 0 0 8px; font-size: 18px; color: #111827;">Thank you!</h3>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">Your feedback has been submitted successfully.</p>
        </div>
      `;
    }
  }

  private resetForm(): void {
    this.formState = {
      type: 'bug',
      priority: 'medium',
      title: '',
      description: '',
    };
    this.capturedScreenshot = null;
    this.annotations = null;
  }

  // Public methods

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    // Create modal
    this.elements.modal = this.createModal();
    this.elements.container.appendChild(this.elements.modal);

    // Hide button
    this.elements.button.style.display = 'none';

    this.callbacks.onOpen?.();
  }

  close(): void {
    if (!this.isOpen) return;

    // Close annotation editor if open
    if (this.isAnnotating) {
      this.closeAnnotationEditor();
    }

    this.isOpen = false;

    // Animate out
    if (this.elements.modal) {
      this.elements.modal.style.opacity = '0';
      setTimeout(() => {
        this.elements.modal?.remove();
        this.elements.modal = null;
      }, 200);
    }

    // Show button
    if (this.config.ui?.showButton !== false) {
      this.elements.button.style.display = 'flex';
    }

    this.callbacks.onClose?.();
  }

  destroy(): void {
    this.close();
    this.elements.container.remove();
  }

  isModalOpen(): boolean {
    return this.isOpen;
  }

  /**
   * Show/hide the floating button
   */
  setButtonVisible(visible: boolean): void {
    this.elements.button.style.display = visible ? 'flex' : 'none';
  }
}
