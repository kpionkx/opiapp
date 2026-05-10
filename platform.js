'use strict';
/**
 * platform.js – Platform detection & native camera wrapper for OPI App
 * Provides unified API for web (getUserMedia) and native (Capacitor) camera.
 * On web: this file is a no-op passthrough — app.js uses getUserMedia directly.
 * On native Android: intercepts camera calls via Capacitor plugins.
 */

const Platform = {
  /** Returns true when running inside Capacitor native shell */
  isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  },
  /** Returns 'android', 'ios', or 'web' */
  getPlatform() {
    if (this.isNative() && window.Capacitor.getPlatform) {
      return window.Capacitor.getPlatform();
    }
    return 'web';
  },
  isAndroid() { return this.getPlatform() === 'android'; },
  isWeb() { return !this.isNative(); },
};

/**
 * NativeCamera – wrapper around @capgo/camera-preview (Capacitor plugin)
 * Only used when Platform.isNative() === true.
 * Falls back gracefully if plugin is not available.
 */
const NativeCamera = {
  _plugin: null,
  _active: false,

  /** Get the CameraPreview plugin reference */
  _getPlugin() {
    if (this._plugin) return this._plugin;
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CameraPreview) {
        this._plugin = window.Capacitor.Plugins.CameraPreview;
        return this._plugin;
      }
    } catch (e) { /* not available */ }
    return null;
  },

  /** Check if native camera is available */
  isAvailable() {
    return Platform.isNative() && !!this._getPlugin();
  },

  /**
   * Start native camera preview
   * @param {Object} opts - { position: 'rear'|'front', width, height }
   */
  async start(opts = {}) {
    const plugin = this._getPlugin();
    if (!plugin) throw new Error('CameraPreview plugin not available');

    await plugin.start({
      position: opts.position || 'rear',
      toBack: true,
      storeToFile: false,
      disableAudio: true,
      enableHighResolution: true,
      width: opts.width || window.innerWidth,
      height: opts.height || window.innerHeight,
    });
    this._active = true;
  },

  /**
   * Capture a photo from native preview
   * @returns {string} base64 data URL (image/jpeg)
   */
  async capture() {
    const plugin = this._getPlugin();
    if (!plugin) throw new Error('CameraPreview plugin not available');

    const result = await plugin.capture({
      quality: 92,
    });

    // Plugin returns base64 string
    const base64 = result.value || result;
    if (typeof base64 === 'string') {
      if (base64.startsWith('data:')) return base64;
      return 'data:image/jpeg;base64,' + base64;
    }
    throw new Error('Unexpected capture result format');
  },

  /**
   * Set zoom level (triggers physical lens switch on supported devices)
   * @param {number} level - zoom factor (e.g. 0.5, 1.0, 2.0)
   */
  async setZoom(level) {
    const plugin = this._getPlugin();
    if (!plugin) return;
    try {
      await plugin.setZoom({ zoom: level });
    } catch (e) {
      console.warn('NativeCamera.setZoom failed:', e);
    }
  },

  /**
   * Get available zoom levels (represents physical lenses)
   * @returns {number[]} e.g. [0.5, 1, 2]
   */
  async getZoomLevels() {
    const plugin = this._getPlugin();
    if (!plugin) return [1];
    try {
      // Try different API methods
      if (plugin.getZoomButtonValues) {
        const res = await plugin.getZoomButtonValues();
        return res.values || res || [1];
      }
      if (plugin.getMaxZoom) {
        const max = await plugin.getMaxZoom();
        const levels = [1];
        if (max.value >= 2) levels.push(2);
        if (max.value >= 5) levels.push(5);
        return levels;
      }
    } catch (e) {
      console.warn('NativeCamera.getZoomLevels failed:', e);
    }
    return [1];
  },

  /** Stop the native camera preview */
  async stop() {
    if (!this._active) return;
    const plugin = this._getPlugin();
    if (!plugin) return;
    try {
      await plugin.stop();
    } catch (e) { /* ignore */ }
    this._active = false;
  },

  /** Flip between front/rear camera */
  async flip() {
    const plugin = this._getPlugin();
    if (!plugin) return;
    try {
      await plugin.flip();
    } catch (e) {
      console.warn('NativeCamera.flip failed:', e);
    }
  },

  /** Check if camera is currently active */
  isActive() {
    return this._active;
  },
};

// Expose globally
window.Platform = Platform;
window.NativeCamera = NativeCamera;
