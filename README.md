# @sjforge/feedback-widget

In-app feedback widget SDK with screenshots, annotations, session recording, and offline support.

## Features

- **Screenshot capture** with annotation tools (draw, arrows, text, highlight, blur)
- **Session recording** using rrweb for pixel-perfect replay
- **Automatic context** capture (browser, errors, network failures)
- **Offline support** with IndexedDB queue and automatic sync
- **Privacy controls** for masking sensitive data
- **Multiple platforms** - Web, Electron, and React Native

## Installation

```bash
npm install @sjforge/feedback-widget
```

Or via CDN:

```html
<script src="https://cdn.sjforge.dev/feedback-widget.min.js"></script>
```

## Quick Start

### Web / Vanilla JS

```typescript
import { FeedbackWidget } from '@sjforge/feedback-widget';

// Initialize the widget
FeedbackWidget.init({
  projectId: 'my-project',
  apiKey: 'fpk_xxxxx', // Get from the admin panel
});

// The floating button appears automatically
// Or submit programmatically:
await FeedbackWidget.submit({
  type: 'bug',
  priority: 'high',
  title: 'Button not working',
  description: 'The submit button does nothing when clicked',
});
```

### CDN / Script Tag

```html
<script src="https://cdn.sjforge.dev/feedback-widget.min.js"></script>
<script>
  FeedbackWidget.init({
    projectId: 'my-project',
    apiKey: 'fpk_xxxxx',
  });
</script>
```

### Electron

```typescript
import { FeedbackWidget, ElectronAdapter } from '@sjforge/feedback-widget';

FeedbackWidget.init({
  projectId: 'my-app',
  apiKey: 'fpk_xxxxx',
  adapter: new ElectronAdapter(window.api),
});
```

See [Electron Integration Guide](#electron-integration) for preload script setup.

### React Native

Use the separate native package:

```bash
npm install @sjforge/feedback-widget-native
```

```typescript
import { FeedbackWidget } from '@sjforge/feedback-widget-native';

FeedbackWidget.init({
  projectId: 'my-app',
  apiKey: 'fpk_xxxxx',
});
```

See [@sjforge/feedback-widget-native](../feedback-widget-native/README.md) for full documentation.

## Configuration

```typescript
FeedbackWidget.init({
  // Required
  projectId: 'my-project',
  apiKey: 'fpk_xxxxx',

  // Optional API endpoint (defaults to https://feedback.sjforge.dev/api/widget)
  apiUrl: 'https://your-portal.com/api/widget',

  // Optional user info (attached to all submissions)
  user: {
    name: 'John Doe',
    email: 'john@example.com',
  },

  // Custom context (sent with every submission)
  customContext: {
    subscription: 'premium',
    version: '2.1.0',
  },

  // Privacy settings
  privacy: {
    maskSelectors: ['.sensitive-data', '.credit-card'],
    blockSelectors: ['.do-not-record'],
    autoMaskPasswords: true, // default: true
  },

  // UI customization
  ui: {
    position: 'bottom-right', // 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
    primaryColor: '#007bff',
    showButton: true,
    buttonText: 'Feedback',
  },

  // Feature flags
  features: {
    screenshots: true,          // Enable screenshot capture
    recording: false,           // Enable session recording
    captureConsoleErrors: true, // Capture console.error calls
    captureNetworkErrors: true, // Capture failed fetch/XHR requests
  },

  // Recording options (when features.recording = true)
  recording: {
    maxDuration: 300000,     // Max recording duration in ms (default: 5 min)
    samplingRate: 'medium',  // 'low' | 'medium' | 'high'
  },

  // Callbacks
  onSubmitStart: () => console.log('Submitting...'),
  onSubmitSuccess: (feedbackId) => console.log('Submitted:', feedbackId),
  onSubmitError: (error) => console.error('Error:', error),
});
```

## API Reference

### Static Methods

#### `FeedbackWidget.init(config)`

Initialize the widget. Must be called before using other methods.

#### `FeedbackWidget.submit(feedback)`

Submit feedback programmatically.

```typescript
const result = await FeedbackWidget.submit({
  type: 'bug',       // 'bug' | 'feature' | 'design'
  priority: 'high',  // 'low' | 'medium' | 'high' | 'critical'
  title: 'Short title',
  description: 'Detailed description',
});

if (result.success) {
  console.log('Feedback ID:', result.feedback_id);
} else {
  console.error('Error:', result.error);
}
```

#### `FeedbackWidget.open()` / `FeedbackWidget.close()`

Open or close the feedback form UI.

#### `FeedbackWidget.setContext(context)`

Update custom context that gets sent with submissions.

```typescript
FeedbackWidget.setContext({
  userId: 'user-123',
  page: 'checkout',
});
```

#### `FeedbackWidget.getContext()`

Get the current context snapshot (for debugging).

#### `FeedbackWidget.destroy()`

Destroy the widget instance and clean up resources.

#### `FeedbackWidget.isInitialized()`

Returns `true` if the widget is initialized.

#### `FeedbackWidget.getVersion()`

Get the SDK version string.

### Screenshot Methods

#### `FeedbackWidget.captureScreenshot()`

Capture a screenshot of the current page.

```typescript
const screenshot = await FeedbackWidget.captureScreenshot();
// Returns { dataUrl: string, width: number, height: number }
```

#### `FeedbackWidget.submitWithScreenshot(feedback)`

Submit feedback with an automatically captured screenshot.

```typescript
await FeedbackWidget.submitWithScreenshot({
  type: 'bug',
  priority: 'high',
  title: 'UI Issue',
  description: 'See attached screenshot',
});
```

### Recording Methods

#### `FeedbackWidget.startRecording()`

Start a session recording.

```typescript
FeedbackWidget.startRecording();
```

#### `FeedbackWidget.stopRecording()`

Stop the current recording and return the data.

```typescript
const recording = await FeedbackWidget.stopRecording();
// Returns { events: Event[], duration: number }
```

#### `FeedbackWidget.isRecording()`

Check if a recording is in progress.

#### `FeedbackWidget.submitWithRecording(feedback)`

Submit feedback with the current recording attached.

```typescript
await FeedbackWidget.submitWithRecording({
  type: 'bug',
  priority: 'critical',
  title: 'Workflow broken',
  description: 'See attached recording',
});
```

### Offline Methods

#### `FeedbackWidget.isOnline()`

Check if the widget has network connectivity.

#### `FeedbackWidget.getPendingCount()`

Get the number of submissions waiting to sync.

```typescript
const pending = await FeedbackWidget.getPendingCount();
console.log(`${pending} submissions waiting to sync`);
```

#### `FeedbackWidget.syncOffline()`

Force sync offline submissions.

```typescript
const { succeeded, failed } = await FeedbackWidget.syncOffline();
```

## Screenshot & Annotation

### Automatic Screenshot Capture

Screenshots are captured using html2canvas and can include annotations.

```typescript
// Capture screenshot programmatically
const screenshot = await FeedbackWidget.captureScreenshot();

// Submit with screenshot
await FeedbackWidget.submitWithScreenshot({
  type: 'bug',
  priority: 'high',
  title: 'UI Issue',
  description: 'See attached screenshot',
});
```

### Annotation Editor

The SDK includes a standalone annotation editor:

```typescript
import { AnnotationEditor } from '@sjforge/feedback-widget';

const editor = new AnnotationEditor({
  container: document.getElementById('editor'),
  imageSrc: screenshotDataUrl,
  onSave: (annotatedImageDataUrl) => {
    console.log('Annotated image:', annotatedImageDataUrl);
  },
  onCancel: () => {
    console.log('Cancelled');
  },
});

// Get annotated image
const annotatedImage = editor.getAnnotatedImage();

// Clean up
editor.destroy();
```

**Available annotation tools:**
- **Rectangle** - Draw boxes around areas
- **Arrow** - Point to specific elements
- **Text** - Add text labels
- **Highlight** - Semi-transparent highlight
- **Blur** - Obscure sensitive areas

## Session Recording

Session recording captures DOM events using rrweb for pixel-perfect replay in the admin portal.

### Enable Recording

```typescript
FeedbackWidget.init({
  projectId: 'my-project',
  apiKey: 'fpk_xxxxx',
  features: {
    recording: true,
  },
  recording: {
    maxDuration: 300000, // 5 minutes max
  },
});
```

### Manual Recording Control

```typescript
// Start recording
FeedbackWidget.startRecording();

// Check status
if (FeedbackWidget.isRecording()) {
  console.log('Recording in progress...');
}

// Stop and submit
await FeedbackWidget.submitWithRecording({
  type: 'bug',
  priority: 'high',
  title: 'See what happened',
  description: 'Recording attached',
});
```

### Recording Privacy

Recordings automatically respect privacy settings:

```typescript
FeedbackWidget.init({
  privacy: {
    maskSelectors: ['.sensitive'],     // Masked in recordings
    blockSelectors: ['.private'],       // Excluded from recordings
    autoMaskPasswords: true,            // Password inputs masked
  },
});
```

## Privacy & Security

### Automatic Protection

- Password fields are automatically masked
- Recordings exclude blocked elements entirely
- Screenshots mask sensitive areas

### Data Attributes

```html
<!-- Mask this element's content -->
<div data-feedback-mask>Sensitive content</div>

<!-- Completely exclude from capture -->
<div data-feedback-block>Private notes</div>
```

### Configuration

```typescript
FeedbackWidget.init({
  privacy: {
    // CSS selectors to mask (shown as solid blocks)
    maskSelectors: ['.credit-card', '.ssn-field'],
    // CSS selectors to completely exclude
    blockSelectors: ['.private-notes', '.admin-panel'],
    // Auto-mask password fields (default: true)
    autoMaskPasswords: true,
  },
});
```

## Offline Support

The widget automatically queues submissions when offline and syncs when connectivity returns.

### How It Works

1. When offline, submissions are stored in IndexedDB
2. When connectivity returns, queued items sync automatically
3. Failed syncs retry up to 3 times with exponential backoff
4. Callbacks notify you of sync status

### Manual Control

```typescript
// Check online status
if (!FeedbackWidget.isOnline()) {
  console.log('Currently offline - submissions will queue');
}

// Check pending count
const pending = await FeedbackWidget.getPendingCount();

// Force sync attempt
const { succeeded, failed } = await FeedbackWidget.syncOffline();
console.log(`Synced: ${succeeded}, Failed: ${failed}`);
```

## Auto-Captured Context

The widget automatically captures:

| Context | Description |
|---------|-------------|
| User Agent | Browser and OS information |
| Viewport | Current window dimensions |
| Screen | Device screen size and pixel ratio |
| URL | Current page URL |
| Referrer | How user arrived at the page |
| Console Errors | Recent `console.error` calls |
| Network Errors | Failed fetch/XHR requests |
| Custom Context | Data you provide via `setContext()` |

## Electron Integration

### 1. Install the Package

```bash
npm install @sjforge/feedback-widget
```

### 2. Set Up Preload Script

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('feedbackAPI', {
  // Screenshot capture
  captureScreen: () => ipcRenderer.invoke('feedback:capture-screen'),

  // Offline storage
  storeOffline: (key: string, data: unknown) =>
    ipcRenderer.invoke('feedback:store-offline', key, data),
  getOffline: (key: string) =>
    ipcRenderer.invoke('feedback:get-offline', key),
  removeOffline: (key: string) =>
    ipcRenderer.invoke('feedback:remove-offline', key),

  // App info
  getAppInfo: () => ipcRenderer.invoke('feedback:get-app-info'),
});
```

### 3. Set Up Main Process Handlers

```typescript
// main.ts
import { ipcMain, desktopCapturer, app } from 'electron';
import Store from 'electron-store';

const store = new Store({ name: 'feedback-widget' });

ipcMain.handle('feedback:capture-screen', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1920, height: 1080 },
  });
  const currentWindow = sources.find(s => s.name === 'Your App Name');
  return currentWindow?.thumbnail.toDataURL();
});

ipcMain.handle('feedback:store-offline', (_, key, data) => {
  store.set(key, data);
});

ipcMain.handle('feedback:get-offline', (_, key) => {
  return store.get(key);
});

ipcMain.handle('feedback:remove-offline', (_, key) => {
  store.delete(key);
});

ipcMain.handle('feedback:get-app-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
}));
```

### 4. Initialize in Renderer

```typescript
// renderer.ts
import { FeedbackWidget, ElectronAdapter } from '@sjforge/feedback-widget';

FeedbackWidget.init({
  projectId: 'my-electron-app',
  apiKey: 'fpk_xxxxx',
  adapter: new ElectronAdapter(window.feedbackAPI),
});
```

## CDN Usage

For quick integration without a build step:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
<body>
  <!-- Your app content -->

  <script src="https://cdn.sjforge.dev/feedback-widget.min.js"></script>
  <script>
    FeedbackWidget.init({
      projectId: 'my-project',
      apiKey: 'fpk_xxxxx',
      ui: {
        position: 'bottom-right',
        primaryColor: '#007bff',
      },
    });
  </script>
</body>
</html>
```

## TypeScript Support

Full TypeScript definitions are included:

```typescript
import {
  FeedbackWidget,
  WidgetConfig,
  FeedbackSubmission,
  SubmissionResponse,
  FeedbackType,
  FeedbackPriority,
} from '@sjforge/feedback-widget';

const config: WidgetConfig = {
  projectId: 'my-project',
  apiKey: 'fpk_xxxxx',
};

FeedbackWidget.init(config);
```

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Bundle Size

| Import | Size (gzipped) |
|--------|---------------|
| Core only | ~15 KB |
| + Screenshots | ~45 KB |
| + Recording | ~85 KB |

## Changelog

### 0.3.0
- Session recording with rrweb
- Chunked upload for large recordings
- Recording playback in admin portal

### 0.2.0
- Screenshot capture with html2canvas
- Annotation editor with drawing tools
- Privacy masking for screenshots

### 0.1.0
- Initial release
- Text-only feedback submission
- Auto-captured context
- Offline queue with sync

## License

MIT
