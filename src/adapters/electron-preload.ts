/**
 * Electron Preload Script Helpers
 *
 * These utilities help set up the feedbackWidget API in your Electron preload script.
 *
 * @example
 * ```typescript
 * // preload.ts
 * import { contextBridge } from 'electron';
 * import { createFeedbackWidgetAPI } from '@sjforge/feedback-widget/electron-preload';
 *
 * contextBridge.exposeInMainWorld('feedbackWidget', createFeedbackWidgetAPI());
 * ```
 *
 * Note: This file is meant to be imported in an Electron preload script context
 * where Node.js APIs and Electron APIs are available.
 */

// Type definitions for the API that will be exposed to the renderer
export interface FeedbackWidgetPreloadAPI {
  captureScreenshot: () => Promise<string | null>;
  getContext: () => Promise<Record<string, unknown>>;
  openExternal: (url: string) => void;
  storeData: (key: string, data: string) => Promise<void>;
  getData: (key: string) => Promise<string | null>;
  deleteData: (key: string) => Promise<void>;
  getAppInfo: () => Promise<{
    name: string;
    version: string;
    electronVersion: string;
    chromeVersion: string;
    nodeVersion: string;
  }>;
  isDev: () => boolean;
}

/**
 * Configuration for creating the preload API
 */
export interface PreloadAPIConfig {
  /** Custom storage directory (defaults to app.getPath('userData')) */
  storageDir?: string;
  /** Whether to include window bounds in context */
  includeWindowBounds?: boolean;
}

/**
 * Example preload script implementation
 *
 * Copy and adapt this to your Electron app's preload script:
 *
 * ```typescript
 * // preload.ts
 * import { contextBridge, ipcRenderer, shell } from 'electron';
 * import * as fs from 'fs/promises';
 * import * as path from 'path';
 * import * as os from 'os';
 *
 * // Get app paths from main process
 * const userDataPath = ipcRenderer.sendSync('get-user-data-path');
 * const appInfo = ipcRenderer.sendSync('get-app-info');
 *
 * const feedbackWidgetAPI = {
 *   captureScreenshot: async (): Promise<string | null> => {
 *     return ipcRenderer.invoke('feedback-widget:capture-screenshot');
 *   },
 *
 *   getContext: async () => ({
 *     appName: appInfo.name,
 *     appVersion: appInfo.version,
 *     electronVersion: process.versions.electron,
 *     chromeVersion: process.versions.chrome,
 *     nodeVersion: process.versions.node,
 *     platform: process.platform,
 *     arch: process.arch,
 *     osVersion: os.release(),
 *     locale: Intl.DateTimeFormat().resolvedOptions().locale,
 *     isDev: !appInfo.isPackaged,
 *   }),
 *
 *   openExternal: (url: string) => {
 *     shell.openExternal(url);
 *   },
 *
 *   storeData: async (key: string, data: string) => {
 *     const filePath = path.join(userDataPath, 'feedback-widget', `${key}.json`);
 *     await fs.mkdir(path.dirname(filePath), { recursive: true });
 *     await fs.writeFile(filePath, data, 'utf-8');
 *   },
 *
 *   getData: async (key: string): Promise<string | null> => {
 *     try {
 *       const filePath = path.join(userDataPath, 'feedback-widget', `${key}.json`);
 *       return await fs.readFile(filePath, 'utf-8');
 *     } catch {
 *       return null;
 *     }
 *   },
 *
 *   deleteData: async (key: string) => {
 *     try {
 *       const filePath = path.join(userDataPath, 'feedback-widget', `${key}.json`);
 *       await fs.unlink(filePath);
 *     } catch {
 *       // Ignore if file doesn't exist
 *     }
 *   },
 *
 *   getAppInfo: async () => appInfo,
 *
 *   isDev: () => !appInfo.isPackaged,
 * };
 *
 * contextBridge.exposeInMainWorld('feedbackWidget', feedbackWidgetAPI);
 * ```
 */

/**
 * IPC channel names for main process handlers
 */
export const IPC_CHANNELS = {
  CAPTURE_SCREENSHOT: 'feedback-widget:capture-screenshot',
  GET_USER_DATA_PATH: 'feedback-widget:get-user-data-path',
  GET_APP_INFO: 'feedback-widget:get-app-info',
  GET_WINDOW_BOUNDS: 'feedback-widget:get-window-bounds',
} as const;

/**
 * Example main process handlers
 *
 * Add these to your main process:
 *
 * ```typescript
 * // main.ts
 * import { app, ipcMain, BrowserWindow, desktopCapturer } from 'electron';
 *
 * // Handle screenshot capture
 * ipcMain.handle('feedback-widget:capture-screenshot', async (event) => {
 *   const win = BrowserWindow.fromWebContents(event.sender);
 *   if (!win) return null;
 *
 *   const sources = await desktopCapturer.getSources({
 *     types: ['window'],
 *     thumbnailSize: {
 *       width: win.getBounds().width,
 *       height: win.getBounds().height,
 *     },
 *   });
 *
 *   const source = sources.find(s => s.name === win.getTitle());
 *   if (source) {
 *     return source.thumbnail.toDataURL();
 *   }
 *
 *   return null;
 * });
 *
 * // Handle sync requests for app info
 * ipcMain.on('get-user-data-path', (event) => {
 *   event.returnValue = app.getPath('userData');
 * });
 *
 * ipcMain.on('get-app-info', (event) => {
 *   event.returnValue = {
 *     name: app.getName(),
 *     version: app.getVersion(),
 *     electronVersion: process.versions.electron,
 *     chromeVersion: process.versions.chrome,
 *     nodeVersion: process.versions.node,
 *     isPackaged: app.isPackaged,
 *   };
 * });
 * ```
 */

// Re-export types for convenience
export type { ElectronPreloadAPI, ElectronContext } from './electron';
