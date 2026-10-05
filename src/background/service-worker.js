/**
 * YouTube Focus - Background Service Worker (Manifest V3)
 * Handles extension lifecycle, keyboard commands, and state coordination.
 */

// Import shared utilities using standard MV3 importScripts
importScripts(
  '../shared/constants.js',
  '../shared/logger.js',
  '../shared/storage.js'
);

const { ACTIONS, DEFAULT_SETTINGS } = self.YTF_CONSTANTS;
const logger = self.YTF_LOGGER;
const storage = self.YTF_STORAGE;

logger.info('Background Service Worker initialized.');

/**
 * Handle Extension Installation / Updates
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  logger.info(`Extension installed/updated. Reason: ${details.reason}`);
  try {
    const currentSettings = await storage.getSettings();
    if (!currentSettings || Object.keys(currentSettings).length === 0) {
      await storage.saveSettings(DEFAULT_SETTINGS);
      logger.info('Default settings initialized in local storage.');
    }
  } catch (err) {
    logger.error('Failed to initialize settings on install:', err);
  }
});

/**
 * Handle Keyboard Shortcuts (commands declared in manifest.json)
 */
chrome.commands.onCommand.addListener(async (command) => {
  logger.debug(`Received command shortcut: ${command}`);

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id || !activeTab.url || !activeTab.url.includes('youtube.com')) {
      return;
    }

    if (command === 'toggle-window-fullscreen') {
      chrome.tabs.sendMessage(activeTab.id, {
        action: ACTIONS.TOGGLE_WINDOW_FULLSCREEN
      }).catch(err => {
        logger.debug('Tab sendMessage note (content script may not be loaded):', err);
      });
    } else if (command === 'toggle-focus-mode') {
      const settings = await storage.getSettings();
      const updatedFocus = !settings.focusModeEnabled;
      await storage.saveSettings({ focusModeEnabled: updatedFocus });
      chrome.tabs.sendMessage(activeTab.id, {
        action: ACTIONS.TOGGLE_FOCUS_MODE,
        enabled: updatedFocus
      }).catch(err => {
        logger.debug('Tab sendMessage note:', err);
      });
    }
  } catch (err) {
    logger.error('Error executing command shortcut:', err);
  }
});

/**
 * Message Listener for runtime messaging
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  logger.debug('Background received message:', message.action, 'from tab:', sender.tab?.id);

  if (message.action === ACTIONS.SETTINGS_CHANGED) {
    // Notify all YouTube tabs of settings change
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        }
      }
    });
    sendResponse({ success: true });
    return true;
  }

  return false;
});
