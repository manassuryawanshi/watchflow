# YouTube Focus — Manual QA & Testing Guide

This document contains step-by-step test plans to verify Phase 1 features of the **YouTube Focus** Chrome Extension (Manifest V3).

---

## 1. Extension Installation & Load Unpacked

### Test 1.1: Extension Registration
- **Preconditions**: Google Chrome installed.
- **Steps**:
  1. Open `chrome://extensions`.
  2. Toggle **Developer mode** to ON.
  3. Click **Load unpacked**.
  4. Select the project root folder: `/Users/manassurvyawanshi/Downloads/VC Projects/Youtube-focus`.
- **Expected Results**:
  - The extension is loaded without warnings or manifest errors.
  - The title shows: `YouTube Focus — Intentional Learning & Video Player`.
  - Icon displays properly at all resolutions (toolbar and extension cards).
  - Background Service Worker shows "service worker (Active)".

---

## 2. Window Fullscreen Test Suite

### Test 2.1: Entry via Player Controls Button
- **Steps**:
  1. Navigate to any YouTube video (e.g. `https://www.youtube.com/watch?v=dQw4w9WgXcQ`).
  2. Hover over the video player control bar on the bottom right.
  3. Locate the custom **Window Fullscreen** button (between theater and native fullscreen buttons).
  4. Click the button.
- **Expected Results**:
  - Video player expands to cover the entire browser viewport (100vw × 100vh).
  - Browser tab bar and address bar remain visible (NO OS fullscreen).
  - YouTube's top masthead, sidebar, title, description, and comments are hidden.
  - Video controls (play/pause, seek scrubber, volume, subtitles, settings) remain accessible.
  - Button icon updates to "Exit Window Fullscreen" with updated tooltip.

### Test 2.2: Exit via Escape Key
- **Steps**:
  1. While in Window Fullscreen mode, press the `Escape` key on your keyboard.
- **Expected Results**:
  - Window Fullscreen exits immediately.
  - Layout returns smoothly to normal YouTube layout with header, comments, and sidebars restored.

### Test 2.3: Keyboard Shortcut (`Alt + W` / `Option + W`)
- **Steps**:
  1. With video playing, press `Alt + W` (or `Option + W` on Mac).
  2. Verify player enters Window Fullscreen.
  3. Press `Alt + W` again.
- **Expected Results**:
  - Shortcut reliably toggles Window Fullscreen mode on and off.
  - If typing in a comment box or search bar, pressing `Alt + W` does NOT trigger the toggle.

### Test 2.4: Browser Window Resizing
- **Steps**:
  1. Enter Window Fullscreen mode.
  2. Resize the Chrome window or snap it to half-screen (e.g. Mac Split View).
- **Expected Results**:
  - Video and controls responsively resize to fill the new viewport dimensions with zero horizontal or vertical scrollbars.

### Test 2.5: SPA Video-to-Video Navigation
- **Steps**:
  1. Open a video in Window Fullscreen.
  2. In the player, trigger the next video in a queue or click a video link.
- **Expected Results**:
  - The player transitions to the new video cleanly.
  - The custom button is present and functional on the new video.

---

## 3. Focus Mode Test Suite

### Test 3.1: Home Feed Suppression & Intentional Hub
- **Steps**:
  1. Ensure **Focus Mode** is enabled.
  2. Navigate to `https://www.youtube.com/`.
- **Expected Results**:
  - Endless algorithmic video grid is hidden.
  - In its place, the **Intentional Focus Hub** appears:
    - "Watch Intentionally. Not Endlessly."
    - Direct search bar.
    - Quick links for Subscriptions and Watch History.
  3. Type a query into the hub's search bar and press Enter:
    - Navigates directly to search results without showing recommended feed videos.
  4. Click "Temporarily reveal home feed":
    - Algorithmic feed temporarily appears for deliberate inspection. Clicking again hides it.

### Test 3.2: Recommended / Related Videos Suppression on Watch Page
- **Steps**:
  1. Navigate to any standalone YouTube watch page (without playlist).
- **Expected Results**:
  - The right-hand column recommendations (`#related`) are hidden.
  - No algorithmic video recommendations distract the viewer.

### Test 3.3: Course & Playlist Navigation Preservation
- **Steps**:
  1. Navigate to a video inside a playlist or course (URL containing `&list=...`).
- **Expected Results**:
  - The playlist panel (`ytd-playlist-panel-renderer`) **REMAINS VISIBLE**.
  - User can seamlessly browse course lectures, chapters, and upcoming tutorial parts.

### Test 3.4: Shorts Elimination & Redirection
- **Steps**:
  1. Inspect the YouTube sidebar guide.
     - Verify "Shorts" navigation button is hidden.
  2. Search for any topic and scroll down.
     - Verify Shorts shelf carousels are hidden.
  3. Paste a direct Shorts link into Chrome address bar (e.g. `https://www.youtube.com/shorts/...`).
- **Expected Results**:
  - Extension automatically redirects the URL to `https://www.youtube.com/watch?v=...`.
  - The video loads on the standard player with scrub bar, speed controls, and zero vertical doom-scrolling.

### Test 3.5: Floating Focus Mode Status Pill
- **Steps**:
  1. Verify the bottom-right status pill (`FOCUS MODE Active`).
  2. Click the pill.
- **Expected Results**:
  - Focus Mode toggles to Paused (indicator turns grey).
  - Clicking again re-enables Focus Mode.

---

## 4. Extension Popup & Storage Persistence

### Test 4.1: Popup State on YouTube Tab
- **Steps**:
  1. Open a YouTube video tab.
  2. Click the extension icon in the toolbar.
- **Expected Results**:
  - Status shows "Active on YouTube" with green indicator.
  - Active Video card displays current video title and channel.
  - "Window Fullscreen" toggle reflects current state.
  - "Focus Mode" toggle reflects current state.

### Test 4.2: Add to Learning Queue
- **Steps**:
  1. In the popup while on a video, click "Add to Queue".
  2. Verify button changes to "Added ✓".
  3. Click "Learning Queue" navigation button.
- **Expected Results**:
  - Video appears in the queue drawer with title, channel, and a completion checkbox.
  - Checking the checkbox marks the item as completed.
  - Clicking delete removes the item.
  - Reloading the page or closing the browser retains the queued items.

### Test 4.3: Extension Dashboard Access
- **Steps**:
  1. In the popup, click "Open Dashboard".
- **Expected Results**:
  - Dashboard opens in a new tab (`src/dashboard/dashboard.html`).
  - Displays Overview KPIs, Learning Queue, Focus Settings, and Time Management controls.
  - Toggling settings in the dashboard updates YouTube tabs in real-time.
