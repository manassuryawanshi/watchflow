/**
 * YouTube Focus - Universal Logger
 */

(function (root) {
  'use strict';

  const PREFIX = '[YouTube Focus]';

  const logger = {
    debugEnabled: false,

    setDebug(val) {
      this.debugEnabled = !!val;
    },

    info(...args) {
      console.log(PREFIX, ...args);
    },

    debug(...args) {
      if (this.debugEnabled) {
        console.debug(PREFIX, '[DEBUG]', ...args);
      }
    },

    warn(...args) {
      console.warn(PREFIX, '[WARN]', ...args);
    },

    error(...args) {
      console.error(PREFIX, '[ERROR]', ...args);
    }
  };

  root.YTF_LOGGER = logger;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = logger;
  }
})(typeof self !== 'undefined' ? self : this);
