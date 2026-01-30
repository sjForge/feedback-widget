/**
 * Annotation Editor - Canvas-based drawing tools for screenshots
 * Framework-agnostic implementation
 */

import type { AnnotationData, AnnotationShape } from '../types';

export type AnnotationTool = 'rectangle' | 'arrow' | 'text' | 'highlight' | 'blur';

export interface AnnotationEditorOptions {
  /** Container element to render into */
  container: HTMLElement;
  /** Image source (data URL or URL) */
  imageSrc: string;
  /** Initial annotations to load */
  initialAnnotations?: AnnotationData;
  /** Available colors */
  colors?: string[];
  /** Default color */
  defaultColor?: string;
  /** Callback when annotations change */
  onChange?: (annotations: AnnotationData) => void;
  /** Callback when save is clicked */
  onSave?: (annotations: AnnotationData) => void;
  /** Callback when cancel is clicked */
  onCancel?: () => void;
  /** Custom styles */
  styles?: Partial<AnnotationEditorStyles>;
}

export interface AnnotationEditorStyles {
  primaryColor: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  buttonBgColor: string;
  buttonTextColor: string;
}

const DEFAULT_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
];

const DEFAULT_STYLES: AnnotationEditorStyles = {
  primaryColor: '#3b82f6',
  backgroundColor: '#ffffff',
  borderColor: '#e5e7eb',
  textColor: '#111827',
  buttonBgColor: '#3b82f6',
  buttonTextColor: '#ffffff',
};

/**
 * Annotation Editor class
 *
 * Usage:
 * ```typescript
 * const editor = new AnnotationEditor({
 *   container: document.getElementById('editor'),
 *   imageSrc: screenshotDataUrl,
 *   onSave: (annotations) => console.log(annotations),
 *   onCancel: () => console.log('cancelled'),
 * });
 *
 * // Later, to clean up:
 * editor.destroy();
 * ```
 */
export class AnnotationEditor {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: HTMLImageElement;
  private options: AnnotationEditorOptions;
  private styles: AnnotationEditorStyles;

  private shapes: AnnotationShape[] = [];
  private currentTool: AnnotationTool = 'rectangle';
  private currentColor: string;
  private isDrawing = false;
  private startPoint: { x: number; y: number } | null = null;
  private currentShape: AnnotationShape | null = null;
  private textInput: HTMLInputElement | null = null;
  private textPosition: { x: number; y: number } | null = null;

  private toolbarElement: HTMLElement | null = null;
  private canvasWrapper: HTMLElement | null = null;
  private footerElement: HTMLElement | null = null;

  constructor(options: AnnotationEditorOptions) {
    this.options = options;
    this.container = options.container;
    this.styles = { ...DEFAULT_STYLES, ...options.styles };
    this.currentColor = options.defaultColor || DEFAULT_COLORS[0];
    this.shapes = options.initialAnnotations?.shapes || [];

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.cursor = 'crosshair';
    this.canvas.style.borderRadius = '4px';
    this.canvas.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not supported');
    }
    this.ctx = ctx;

    // Load image
    this.image = new Image();
    this.image.crossOrigin = 'anonymous';
    this.image.onload = () => this.onImageLoad();
    this.image.src = options.imageSrc;
  }

  private onImageLoad(): void {
    // Calculate display size
    const containerWidth = this.container.clientWidth - 32; // padding
    const maxHeight = window.innerHeight * 0.5;

    const ratio = Math.min(
      containerWidth / this.image.width,
      maxHeight / this.image.height,
      1
    );

    const displayWidth = Math.floor(this.image.width * ratio);
    const displayHeight = Math.floor(this.image.height * ratio);

    this.canvas.width = displayWidth;
    this.canvas.height = displayHeight;

    // Render UI
    this.render();

    // Initial draw
    this.redraw();

    // Set up event listeners
    this.setupEventListeners();
  }

  private render(): void {
    // Clear container
    this.container.innerHTML = '';
    this.container.style.cssText = `
      display: flex;
      flex-direction: column;
      background: ${this.styles.backgroundColor};
      border-radius: 8px;
      overflow: hidden;
      font-family: system-ui, -apple-system, sans-serif;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 16px;
      border-bottom: 1px solid ${this.styles.borderColor};
    `;
    header.innerHTML = `
      <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: ${this.styles.textColor};">
        Annotate Screenshot
      </h3>
      <p style="margin: 4px 0 0; font-size: 14px; color: #6b7280;">
        Draw on the image to highlight issues or add notes.
      </p>
    `;
    this.container.appendChild(header);

    // Toolbar
    this.toolbarElement = this.createToolbar();
    this.container.appendChild(this.toolbarElement);

    // Canvas wrapper
    this.canvasWrapper = document.createElement('div');
    this.canvasWrapper.style.cssText = `
      flex: 1;
      overflow: auto;
      padding: 16px;
      background: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    `;
    this.canvasWrapper.appendChild(this.canvas);
    this.container.appendChild(this.canvasWrapper);

    // Footer
    this.footerElement = this.createFooter();
    this.container.appendChild(this.footerElement);
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      padding: 12px 16px;
      border-bottom: 1px solid ${this.styles.borderColor};
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 16px;
    `;

    // Tools
    const tools = document.createElement('div');
    tools.style.cssText = 'display: flex; gap: 4px;';

    const toolButtons: { tool: AnnotationTool; icon: string; title: string }[] = [
      { tool: 'rectangle', icon: this.getRectangleIcon(), title: 'Rectangle' },
      { tool: 'arrow', icon: this.getArrowIcon(), title: 'Arrow' },
      { tool: 'text', icon: this.getTextIcon(), title: 'Text' },
      { tool: 'highlight', icon: this.getHighlightIcon(), title: 'Highlight' },
      { tool: 'blur', icon: this.getBlurIcon(), title: 'Blur' },
    ];

    toolButtons.forEach(({ tool, icon, title }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = title;
      btn.innerHTML = icon;
      btn.dataset.tool = tool;
      btn.style.cssText = `
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${this.currentTool === tool ? '#dbeafe' : 'transparent'};
        color: ${this.currentTool === tool ? '#2563eb' : '#4b5563'};
        transition: all 0.15s;
      `;
      btn.onmouseenter = () => {
        if (this.currentTool !== tool) {
          btn.style.background = '#f3f4f6';
        }
      };
      btn.onmouseleave = () => {
        if (this.currentTool !== tool) {
          btn.style.background = 'transparent';
        }
      };
      btn.onclick = () => this.setTool(tool);
      tools.appendChild(btn);
    });

    toolbar.appendChild(tools);

    // Divider
    toolbar.appendChild(this.createDivider());

    // Colors
    const colors = document.createElement('div');
    colors.style.cssText = 'display: flex; gap: 4px;';

    const colorOptions = this.options.colors || DEFAULT_COLORS;
    colorOptions.forEach((color) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = color;
      btn.dataset.color = color;
      btn.style.cssText = `
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 2px solid ${this.currentColor === color ? '#111827' : 'transparent'};
        background: ${color};
        cursor: pointer;
        transform: ${this.currentColor === color ? 'scale(1.1)' : 'scale(1)'};
        transition: all 0.15s;
      `;
      btn.onclick = () => this.setColor(color);
      colors.appendChild(btn);
    });

    toolbar.appendChild(colors);

    // Divider
    toolbar.appendChild(this.createDivider());

    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 8px;';

    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.textContent = 'Undo';
    undoBtn.style.cssText = `
      padding: 4px 12px;
      border: none;
      background: transparent;
      color: #4b5563;
      font-size: 14px;
      cursor: pointer;
      opacity: ${this.shapes.length > 0 ? '1' : '0.5'};
    `;
    undoBtn.disabled = this.shapes.length === 0;
    undoBtn.onclick = () => this.undo();
    actions.appendChild(undoBtn);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear All';
    clearBtn.style.cssText = `
      padding: 4px 12px;
      border: none;
      background: transparent;
      color: #4b5563;
      font-size: 14px;
      cursor: pointer;
      opacity: ${this.shapes.length > 0 ? '1' : '0.5'};
    `;
    clearBtn.disabled = this.shapes.length === 0;
    clearBtn.onclick = () => this.clear();
    actions.appendChild(clearBtn);

    toolbar.appendChild(actions);

    return toolbar;
  }

  private createFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 16px;
      border-top: 1px solid ${this.styles.borderColor};
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 8px 16px;
      border: 1px solid ${this.styles.borderColor};
      border-radius: 6px;
      background: white;
      color: ${this.styles.textColor};
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    `;
    cancelBtn.onclick = () => this.cancel();
    footer.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save Annotations';
    saveBtn.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      background: ${this.styles.buttonBgColor};
      color: ${this.styles.buttonTextColor};
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    `;
    saveBtn.onclick = () => this.save();
    footer.appendChild(saveBtn);

    return footer;
  }

  private createDivider(): HTMLElement {
    const divider = document.createElement('div');
    divider.style.cssText = `
      width: 1px;
      height: 24px;
      background: ${this.styles.borderColor};
    `;
    return divider;
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));

    // Touch support
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.handleMouseUp.bind(this));
  }

  private getCanvasCoords(e: MouseEvent | Touch): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.canvas.width;
    const y = (e.clientY - rect.top) / this.canvas.height;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  private handleMouseDown(e: MouseEvent): void {
    const coords = this.getCanvasCoords(e);

    if (this.currentTool === 'text') {
      this.textPosition = coords;
      this.showTextInput(coords);
      return;
    }

    this.isDrawing = true;
    this.startPoint = coords;
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const coords = this.getCanvasCoords(touch);

      if (this.currentTool === 'text') {
        this.textPosition = coords;
        this.showTextInput(coords);
        return;
      }

      this.isDrawing = true;
      this.startPoint = coords;
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDrawing || !this.startPoint) return;

    const coords = this.getCanvasCoords(e);
    this.updateCurrentShape(coords);
    this.redraw();
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (!this.isDrawing || !this.startPoint || e.touches.length !== 1) return;

    const coords = this.getCanvasCoords(e.touches[0]);
    this.updateCurrentShape(coords);
    this.redraw();
  }

  private updateCurrentShape(coords: { x: number; y: number }): void {
    if (!this.startPoint) return;

    if (this.currentTool === 'rectangle' || this.currentTool === 'highlight' || this.currentTool === 'blur') {
      this.currentShape = {
        type: this.currentTool,
        x: Math.min(this.startPoint.x, coords.x),
        y: Math.min(this.startPoint.y, coords.y),
        width: Math.abs(coords.x - this.startPoint.x),
        height: Math.abs(coords.y - this.startPoint.y),
        color: this.currentColor,
      };
    } else if (this.currentTool === 'arrow') {
      this.currentShape = {
        type: 'arrow',
        x: this.startPoint.x,
        y: this.startPoint.y,
        endX: coords.x,
        endY: coords.y,
        color: this.currentColor,
      };
    }
  }

  private handleMouseUp(): void {
    if (this.currentShape) {
      // Only add if shape has meaningful size
      const hasSize =
        (this.currentShape.width && this.currentShape.width > 0.01) ||
        (this.currentShape.height && this.currentShape.height > 0.01) ||
        (this.currentShape.endX !== undefined &&
          (Math.abs(this.currentShape.endX - this.currentShape.x) > 0.01 ||
            Math.abs(this.currentShape.endY! - this.currentShape.y) > 0.01));

      if (hasSize) {
        this.shapes.push(this.currentShape);
        this.notifyChange();
      }
    }

    this.isDrawing = false;
    this.startPoint = null;
    this.currentShape = null;
    this.redraw();
    this.updateToolbar();
  }

  private showTextInput(coords: { x: number; y: number }): void {
    if (this.textInput) {
      this.textInput.remove();
    }

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      position: absolute;
      left: ${coords.x * this.canvas.width + 16}px;
      top: ${coords.y * this.canvas.height + 16}px;
      background: white;
      padding: 8px;
      border-radius: 6px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      border: 1px solid ${this.styles.borderColor};
      z-index: 10;
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter text...';
    input.style.cssText = `
      width: 160px;
      padding: 4px 8px;
      border: 1px solid ${this.styles.borderColor};
      border-radius: 4px;
      font-size: 14px;
      outline: none;
    `;

    const btnWrapper = document.createElement('div');
    btnWrapper.style.cssText = 'display: flex; gap: 4px; margin-top: 8px;';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Add';
    addBtn.style.cssText = `
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      background: ${this.styles.buttonBgColor};
      color: ${this.styles.buttonTextColor};
      font-size: 12px;
      cursor: pointer;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      background: #e5e7eb;
      color: #374151;
      font-size: 12px;
      cursor: pointer;
    `;

    const submitText = () => {
      const text = input.value.trim();
      if (text && this.textPosition) {
        this.shapes.push({
          type: 'text',
          x: this.textPosition.x,
          y: this.textPosition.y,
          text,
          color: this.currentColor,
        });
        this.notifyChange();
        this.redraw();
        this.updateToolbar();
      }
      wrapper.remove();
      this.textInput = null;
      this.textPosition = null;
    };

    addBtn.onclick = submitText;
    cancelBtn.onclick = () => {
      wrapper.remove();
      this.textInput = null;
      this.textPosition = null;
    };

    input.onkeydown = (e) => {
      if (e.key === 'Enter') submitText();
      if (e.key === 'Escape') {
        wrapper.remove();
        this.textInput = null;
        this.textPosition = null;
      }
    };

    btnWrapper.appendChild(addBtn);
    btnWrapper.appendChild(cancelBtn);
    wrapper.appendChild(input);
    wrapper.appendChild(btnWrapper);

    this.canvasWrapper?.appendChild(wrapper);
    this.textInput = input;
    input.focus();
  }

  private redraw(): void {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw image
    this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);

    // Draw all shapes
    const allShapes = this.currentShape ? [...this.shapes, this.currentShape] : this.shapes;
    for (const shape of allShapes) {
      this.drawShape(shape);
    }
  }

  private drawShape(shape: AnnotationShape): void {
    const ctx = this.ctx;
    const x = shape.x * this.canvas.width;
    const y = shape.y * this.canvas.height;

    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = 3;

    switch (shape.type) {
      case 'rectangle':
        if (shape.width && shape.height) {
          const width = shape.width * this.canvas.width;
          const height = shape.height * this.canvas.height;
          ctx.strokeRect(x, y, width, height);
        }
        break;

      case 'highlight':
        if (shape.width && shape.height) {
          const width = shape.width * this.canvas.width;
          const height = shape.height * this.canvas.height;
          ctx.fillStyle = shape.color + '40'; // 25% opacity
          ctx.fillRect(x, y, width, height);
        }
        break;

      case 'blur':
        if (shape.width && shape.height) {
          const width = shape.width * this.canvas.width;
          const height = shape.height * this.canvas.height;
          // Simulate blur with semi-transparent overlay
          ctx.fillStyle = '#666666cc';
          ctx.fillRect(x, y, width, height);
        }
        break;

      case 'arrow':
        if (shape.endX !== undefined && shape.endY !== undefined) {
          const endX = shape.endX * this.canvas.width;
          const endY = shape.endY * this.canvas.height;

          // Draw line
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          // Draw arrowhead
          const angle = Math.atan2(endY - y, endX - x);
          const headLength = 15;
          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - headLength * Math.cos(angle - Math.PI / 6),
            endY - headLength * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            endX - headLength * Math.cos(angle + Math.PI / 6),
            endY - headLength * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
        }
        break;

      case 'text':
        if (shape.text) {
          ctx.font = 'bold 16px system-ui, sans-serif';
          const metrics = ctx.measureText(shape.text);
          const padding = 4;
          // Draw background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(x - padding, y - 16 - padding, metrics.width + padding * 2, 20 + padding);
          // Draw text
          ctx.fillStyle = shape.color;
          ctx.fillText(shape.text, x, y);
        }
        break;
    }
  }

  private setTool(tool: AnnotationTool): void {
    this.currentTool = tool;
    this.updateToolbar();
  }

  private setColor(color: string): void {
    this.currentColor = color;
    this.updateToolbar();
  }

  private updateToolbar(): void {
    if (!this.toolbarElement) return;

    // Update tool buttons
    const toolBtns = this.toolbarElement.querySelectorAll<HTMLButtonElement>('[data-tool]');
    toolBtns.forEach((btn) => {
      const isActive = btn.dataset.tool === this.currentTool;
      btn.style.background = isActive ? '#dbeafe' : 'transparent';
      btn.style.color = isActive ? '#2563eb' : '#4b5563';
    });

    // Update color buttons
    const colorBtns = this.toolbarElement.querySelectorAll<HTMLButtonElement>('[data-color]');
    colorBtns.forEach((btn) => {
      const isActive = btn.dataset.color === this.currentColor;
      btn.style.border = `2px solid ${isActive ? '#111827' : 'transparent'}`;
      btn.style.transform = isActive ? 'scale(1.1)' : 'scale(1)';
    });

    // Update undo/clear buttons
    const buttons = this.toolbarElement.querySelectorAll<HTMLButtonElement>('button');
    buttons.forEach((btn) => {
      if (btn.textContent === 'Undo' || btn.textContent === 'Clear All') {
        btn.disabled = this.shapes.length === 0;
        btn.style.opacity = this.shapes.length > 0 ? '1' : '0.5';
      }
    });
  }

  private notifyChange(): void {
    this.options.onChange?.({ shapes: this.shapes });
  }

  // Public methods

  undo(): void {
    if (this.shapes.length > 0) {
      this.shapes.pop();
      this.notifyChange();
      this.redraw();
      this.updateToolbar();
    }
  }

  clear(): void {
    this.shapes = [];
    this.notifyChange();
    this.redraw();
    this.updateToolbar();
  }

  save(): void {
    this.options.onSave?.({ shapes: this.shapes });
  }

  cancel(): void {
    this.options.onCancel?.();
  }

  getAnnotations(): AnnotationData {
    return { shapes: [...this.shapes] };
  }

  setAnnotations(annotations: AnnotationData): void {
    this.shapes = [...annotations.shapes];
    this.redraw();
    this.updateToolbar();
  }

  /**
   * Get the annotated image as a data URL
   */
  getAnnotatedImage(format: 'png' | 'jpeg' = 'png', quality = 0.9): string {
    return this.canvas.toDataURL(`image/${format}`, quality);
  }

  destroy(): void {
    this.container.innerHTML = '';
    this.textInput?.remove();
  }

  // Icon SVGs
  private getRectangleIcon(): string {
    return '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/></svg>';
  }

  private getArrowIcon(): string {
    return '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>';
  }

  private getTextIcon(): string {
    return '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>';
  }

  private getHighlightIcon(): string {
    return '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>';
  }

  private getBlurIcon(): string {
    return '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>';
  }
}
