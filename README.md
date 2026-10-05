# YouTube Focus — Chrome Extension (Manifest V3)

> **Watch intentionally. Not endlessly.**

**YouTube Focus** is a privacy-first productivity and learning layer for YouTube. Designed specifically for students, autodidacts, developers, and professionals, it eliminates algorithmic rabbit holes and provides an intentional viewing environment without breaking playback, course navigation, or search.

---

## Architecture Overview

Built strictly on **Google Chrome Manifest V3** with zero external dependencies, no telemetry, and a 100% local persistence model.

```
Youtube-focus/
├── manifest.json              # Chrome Manifest V3 declaration
├── README.md                  # Complete documentation and setup guide
├── TESTING.md                 # Manual QA and verification checklist
└── src/
    ├── icons/                 # High-resolution raster & vector icons
    │   ├── icon-16.png
    │   ├── icon-32.png
    │   ├── icon-48.png
    │   ├── icon-128.png
    │   └── icon.svg
    ├── shared/                # Core universal utilities
    │   ├── constants.js       # Centralized DOM selectors & action messages
    │   ├── storage.js         # chrome.storage.local abstraction layer
    │   └── logger.js          # Configurable namespaced console logger
    ├── background/
    │   └── service-worker.js  # MV3 service worker for shortcuts & lifecycle
    ├── content/               # Injected YouTube engine
    │   ├── youtube.js         # Window Fullscreen, Focus Mode & SPA tracker
    │   └── youtube.css        # Styles for player expansion & distraction filters
    ├── popup/                 # Minimalist browser action popup
    │   ├── popup.html
    │   ├── popup.css
    │   └── popup.js
    └── dashboard/             # Standalone options & learning dashboard
        ├── dashboard.html
        ├── dashboard.css
        └── dashboard.js
```

---

## Phase 1 Feature Set

### 1. Window Fullscreen (Not OS Fullscreen)
- **Viewport Fill**: Expands the YouTube player to 100% width and 100% height of the browser's viewport.
- **Chrome UI Preserved**: Chrome tabs, address bar, bookmarks, and OS taskbars remain visible and accessible.
- **Clutter Elimination**: Automatically hides the masthead/header, comments, description, sidebars, and live chat while active.
- **Native Player Controls**: Preserves all video controls (play/pause, seek scrubber, volume, subtitles, playback speed, quality gear menu).
- **Player Injected Button**: Adds a dedicated Window Fullscreen button into YouTube's player controls bar (`.ytp-right-controls`) right next to the native theater/fullscreen buttons.
- **Keyboard Shortcuts**:
  - `W`: Toggle Window Fullscreen on watch pages.
  - `Escape`: Instantly exit Window Fullscreen.
- **Responsive**: Automatically resizes with the browser window and fires layout recalculation events to `#movie_player`.
- **SPA Resilience**: Survives in-page YouTube navigations without page reload.

### 2. Focus Mode
- **Home Feed Suppression**: Replaces the endless algorithmic home feed with an **Intentional Focus Hub**:
  - Distraction-free direct search bar.
  - Quick intentional links (Subscriptions feed, Watch History).
  - Deliberate "Temporarily reveal home feed" escape hatch if needed.
- **Shorts Elimination & Redirection**:
  - Hides Shorts shelf carousels and sidebar navigation buttons.
  - Automatically redirects any direct `/shorts/VIDEO_ID` URL to the intentional `/watch?v=VIDEO_ID` player so users receive standard playback and speed controls instead of infinite vertical scrolling.
- **Watch Page Recommendations**: Hides `#related` and secondary suggestions on watch pages.
- **Course & Playlist Preservation**: Explicitly preserves playlist panels (`ytd-playlist-panel-renderer`) so educational courses and tutorial playlists remain 100% accessible.
- **End-Screen Suggestions**: Neutralizes floating promotional tiles (`.ytp-ce-element`) that clutter video conclusions.
- **On-Screen Status Pill**: Displays an unobtrusive floating indicator (`FOCUS MODE Active`) with quick toggle support.

### 3. Complete Learning Queue (Videos & Playlists)
- **First-Class Playlists & Individual Videos**:
  - Save individual videos or entire YouTube playlists without needing a YouTube Data API key.
  - Logical container: Playlists stay organized with curriculum expansion, lesson checklists, and individual deletion without cluttering the queue.
  - YouTube In-Page Quick Add: Directly click `[+ Add to Queue]` or `[+ Add Playlist to Queue]` on YouTube watch and playlist pages.
  - Auto-Mark Completion: Automatically marks a lesson or video completed when reaching a 90% watched threshold.
  - "Continue Learning": One-click button that resumes the next incomplete item across all queued courses.

### 4. Watch-Time Tracking & Analytics
- **Local Session Tracking**: Records viewing sessions (duration, focus status, video, date) locally in `chrome.storage.local`.
- **Zero Telemetry**: Never sends watch history or analytics to external servers.
- **Visual Analytics Dashboard**: Interactive charts for Today, Last 7 Days, and Last 30 Days showing total watch time, focused percentage, learning percentage, and average session length.

### 5. Daily Limits, Cooldown & Scheduled Blocking
- **Configurable Daily Limits**: Presets (30m, 45m, 60m, 90m, 120m) and custom limits with 75% and 90% gentle warnings.
- **Soft vs. Hard Limit Modes**:
  - **Soft Limit**: Shows gentle toast notifications and encourages pausing.
  - **Hard Limit**: Triggers a mandatory calming Cooldown break screen with live countdown timer when the limit is exceeded.
- **Scheduled Focus / Blocking**: Automatically activates Focus Mode or completely blocks YouTube during specific scheduled windows (e.g. Study Hours 09:00–13:00, Night Rest 22:00–07:00).

### 6. Course Mode Banner
- When playing a video that belongs to an active playlist course in your Learning Queue, a sleek Course Mode banner appears showing Lesson X of Y, percentage progress, and a direct `[Next Lesson ➔]` button.

### 7. Extension Popup & State Engine
- Minimal, premium dark design matching the Dashboard.
- Live watch time vs. daily limit indicator.
- Fast toggles for Window Fullscreen (`W`) and Focus Mode (`ON/OFF`).
- Quick Actions bar (`[Window Fullscreen]`, `[Focus Mode]`, `[Add to Queue]`, `[Open Queue]`).
- Quick Queue drawer and one-click access to the full Dashboard.

---

## Permissions Analysis & Documentation

YouTube Focus strictly abides by the principle of **least privilege**:

| Permission | Scope | Why It Is Required |
| :--- | :--- | :--- |
| `storage` | Local Extension Storage | Persists user preferences (e.g., Focus Mode on/off), the Learning Queue, and local viewing statistics in `chrome.storage.local`. |
| `activeTab` | Active Browser Tab | Allows the popup to detect whether the user is currently on YouTube, read the current video's title to enable "Add to Queue", and trigger Window Fullscreen. |
| `https://www.youtube.com/*` | Host Permission | Required to inject content scripts (`youtube.js`, `youtube.css`) and manipulate YouTube's player DOM and distraction elements. |

*No broader permissions (`<all_urls>`, `webRequest`, `cookies`, `tabs`, `identity`) are requested.*

---

## Privacy Policy & Architecture

- **Zero Remote Servers**: The extension contains no backend, tracking SDKs, or network telemetry.
- **100% Local Storage**: All settings, learning items, and watch time statistics are stored exclusively in `chrome.storage.local` on the user's device.
- **No Browsing History Collection**: We do not collect, monitor, or transmit user history.
- **Data Export & Wipe**: Users can export a complete JSON backup or wipe all local data at any time from the extension dashboard.

---

## Installation & Setup Instructions

### Load Unpacked in Google Chrome

1. Open Google Chrome.
2. In the address bar, navigate to:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** using the toggle in the upper-right corner.
4. Click the **Load unpacked** button in the top toolbar.
5. Select the project directory:
   ```text
   /Users/manassurvyawanshi/Downloads/VC Projects/Youtube-focus
   ```
6. The extension **YouTube Focus — Intentional Learning & Video Player** will appear in your installed extensions list with no errors.
7. Click the Chrome Extensions puzzle icon in your browser toolbar and pin **YouTube Focus** for quick access.

### Reloading After Edits
- When modifying `src/content/`, `src/popup/`, or `src/dashboard/`, simply reload the YouTube webpage or reopen the popup.
- When modifying `manifest.json` or `src/background/service-worker.js`, click the **Reload** (circular arrow) icon on the extension card in `chrome://extensions`.

### Debugging
- **Background Worker**: In `chrome://extensions`, click **service worker** on the extension card to open DevTools for the background script.
- **Content Scripts**: On any YouTube page, right-click and choose **Inspect**. Open the **Console** tab and filter by `[YouTube Focus]`.
- **Debug Mode**: You can enable verbose logging by setting `debugMode: true` in settings or calling `window.YTF_LOGGER.setDebug(true)` in the page console.

---

## Known Limitations (Phase 1)

1. **YouTube Dynamic Class Obfuscation**: YouTube occasionally tests new polymer web component layouts. The extension uses resilient attribute selectors (`page-subtype="home"`, `#movie_player`, `.ytp-right-controls`), but changes to YouTube's internal player structure require centralized selector updates in `src/shared/constants.js`.
2. **Native Fullscreen vs Window Fullscreen**: If native OS fullscreen (`F` key) is pressed while Window Fullscreen is active, the browser will enter OS fullscreen. Pressing `Escape` or `W` cleanly exits back to the normal view.
3. **Embedded Players**: Window Fullscreen is designed for `youtube.com/watch` pages and does not run on third-party websites embedding YouTube `<iframe>` players.

---

## Chrome Web Store Release Checklist

- [x] Manifest V3 compliant (`manifest_version: 3`).
- [x] No `eval()`, `new Function()`, or remotely hosted code.
- [x] High-resolution icons provided in 16x16, 32x32, 48x48, and 128x128 formats.
- [x] Minimum permissions requested with clear justification.
- [x] Single-purpose description aligned with Chrome Web Store policies.
- [x] Complete privacy declaration (Local-only, no user tracking).
- [x] No deprecated Manifest V2 APIs or long-running background timers.
- [x] Manual QA test suite documented in `TESTING.md`.
