# WatchFlow

> A privacy-first productivity and intentional-learning layer for YouTube.

WatchFlow transforms YouTube from an algorithmic distraction loop into a focused, deliberate learning environment. Designed for students, developers, researchers, and lifelong learners, WatchFlow eliminates recommendations, reels, and feeds while preserving native playback controls, course playlists, and educational workflows.

---

## Overview

Modern YouTube is engineered around algorithmic retention, constantly serving high-engagement recommendations, infinite Shorts, and related video sidebars. For intentional learners, this creates constant cognitive friction.

WatchFlow runs as a lightweight, privacy-preserving Google Chrome Extension (Manifest V3) that sits between you and YouTube. It provides:

- **True Focus Mode**: Converts YouTube into a strict, distraction-free study environment where only intentionally queued learning content is accessible.
- **WatchFlow Today**: Replaces the YouTube recommendation feed with a clean, actionable daily productivity hub.
- **First-Class Learning Queue**: Supports individual videos and full structured playlist courses with independent curriculum drawers and lesson checklists.
- **Window Fullscreen**: Maximizes the video player to 100% of the browser window viewport with zero OS-level fullscreen friction, controlled via keyboard (`W`).
- **Local-Only Analytics**: Tracks real study time and learning metrics with 100% local device storage and zero telemetry.

---

## Why WatchFlow

| Traditional YouTube | With WatchFlow |
| :--- | :--- |
| Endless algorithmic home recommendations | Replaced with "WatchFlow Today" productivity hub |
| Addictive, vertical doom-scrolling Shorts | Completely eliminated or redirected to standard player |
| Distracting sidebar suggestions during study | Hidden to maintain deep focus |
| Fragmented watch history and lost tutorials | Curated, organized Learning Queue with playlist curriculum tracking |
| Cluttered UI with headers and comment sections | Clean Window Fullscreen mode preserving browser tabs |
| Third-party telemetry and cloud tracking | 100% local execution and storage (`chrome.storage.local`) |

---

## Features

### 1. Focus Mode (Learning-Only Mode)
- **Strict Allowlist Security**: When Focus Mode is active, only content in your Learning Queue or explicit learning playlists can be watched. Unapproved videos and algorithmic suggestions are intercepted with an intentional block screen.
- **Shorts Elimination & Redirection**: Shorts navigation and shelves are eliminated. Direct Shorts links redirect seamlessly to the standard `/watch?v=` player with scrub bars and playback speed controls.
- **Watch Page De-cluttering**: Algorithmic recommendations (`#related`), promotional end-screen tiles, and secondary suggestions are neutralized while keeping player controls and course playlists intact.
- **Floating Status Pill**: Non-intrusive on-screen indicator (`FOCUS MODE ACTIVE`) for quick status inspection and toggling.
- **Keyboard Shortcut**: Press `Alt + F` (configurable in Chrome) to toggle Focus Mode instantly.

### 2. WatchFlow Today (Focus Home Hub)
When visiting YouTube Home in Focus Mode, the algorithmic grid is replaced with a single, elegant productivity hub:
- **Official WatchFlow Branding**: High-resolution brand wordmark and Focus status badge.
- **Daily Progress Metrics**: Live progress ring showing study minutes logged versus your daily target.
- **Continue Learning Card**: One-click action to resume the next incomplete lesson across your queued courses.
- **Learning Queue Next-Up Preview**: Compact, single-line preview of your upcoming lessons with ellipsis overflow protection and full title tooltips.
- **Deep Links**: Direct shortcuts to your full Learning Queue, Analytics, and Settings.

### 3. Learning Queue & Course Learning
- **Individual Videos & Playlists**: Add single videos or entire multi-part tutorial series directly from YouTube pages or manual URL input.
- **Curriculum Preservation**: Expandable course drawers (`Lessons ▼`) retain their open/collapsed state across lesson completions, deletions, and filter changes.
- **Lesson Checklists**: Track progress item-by-item; individual lessons can be marked completed or removed without destroying the playlist container.
- **Auto-Completion**: Videos and lessons automatically mark as complete upon reaching the 90% watched threshold.
- **Smart Queue Intelligence**: Computes total course duration, remaining watch time, and completion percentages.
- **Filter Views**: Easily filter between `All`, `Videos`, `Playlists`, `In Progress`, and `Completed`.

### 4. Window Fullscreen Mode
- **Viewport Fill**: Expands the player to 100vw × 100vh of the browser window without triggering OS-level fullscreen.
- **Preserved Chrome Controls**: Browser tabs, address bar, and operating system controls remain readily accessible.
- **Keyboard Shortcut (`W`)**: Press `W` (or `Shift + W`) on any watch page to toggle Window Fullscreen. Built-in input and repeat guards prevent accidental toggles while typing comments or search queries.
- **Escape Key Guard**: Press `Escape` to instantly exit Window Fullscreen.
- **Player Injected Button**: Dedicated control button added directly next to native theater and fullscreen controls.

### 5. Analytics, Limits & Schedules
- **Local Time Tracking**: Accurate second-by-second tracking of focused study time and general watch time.
- **Visual Analytics Dashboard**: Visual charts comparing Today, Yesterday, Last 7 Days, and Last 30 Days.
- **Daily Time Limits**: Configurable soft limits (gentle toasts) or hard limits (calming Cooldown break screen).
- **Scheduled Study Windows**: Automate Focus Mode enforcement during dedicated study or rest hours (e.g., 09:00–17:00).

---

## Privacy Architecture

WatchFlow is built on strict privacy principles:
- **Zero Remote Servers**: No backend servers, API proxies, or cloud endpoints.
- **Zero Telemetry or Analytics SDKs**: No Google Analytics, Mixpanel, Sentry, or tracking pixels.
- **100% Local Storage**: All settings, queue items, and session metrics are stored directly on your machine via `chrome.storage.local`.
- **Minimal Permissions**: Operates exclusively with `storage` and `activeTab` permissions, plus `*://*.youtube.com/*` host permissions for content injection.
- **Data Export & Wipe**: Export your complete queue and analytics to JSON or permanently wipe all data in one click from the dashboard.

---

## Tech Stack

- **Platform**: Google Chrome Extension (Manifest V3)
- **Core Languages**: Vanilla JavaScript (ES2022+), Semantic HTML5, CSS3
- **Styling Architecture**: Custom dark-mode design system tailored to YouTube and YouTube Studio aesthetic tokens
- **Persistence Layer**: `chrome.storage.local` with optimized transactional helpers
- **Testing**: Node.js automated test runner and Chrome DevTools Protocol (CDP) test suites

---

## Project Structure

```
watchflow/
├── manifest.json              # Chrome Extension Manifest V3 configuration
├── README.md                  # Comprehensive documentation and architecture
├── CHANGELOG.md               # Version history and release notes
├── RELEASE_CHECKLIST.md       # Pre-flight and release verification checklist
├── TESTING.md                 # Manual QA and verification guide
├── .gitignore                 # Production Git exclusions
├── tests/                     # Automated unit and browser test suites
│   ├── test_all_features.mjs
│   ├── test_w_shortcut.mjs
│   ├── test_playlist_expansion_preservation.mjs
│   └── test_queue_title_overflow.mjs
└── src/
    ├── assets/                # Official brand identity assets
    │   ├── watchflow-boxed.png
    │   └── watchflow-wordmark.png
    ├── icons/                 # Extension toolbar & store icons
    │   ├── icon-16.png
    │   ├── icon-32.png
    │   ├── icon-48.png
    │   ├── icon-128.png
    │   └── icon.svg
    ├── shared/                # Universal utilities across execution contexts
    │   ├── constants.js       # Action messages, storage keys, DOM selectors
    │   ├── logger.js          # Namespaced logger with debug gating
    │   └── storage.js         # Transactional storage engine and queue intelligence
    ├── background/
    │   └── service-worker.js  # MV3 background service worker and shortcut coordinator
    ├── content/               # YouTube DOM injection scripts
    │   ├── youtube.js         # Core Focus Mode engine, WatchFlow Today hub, player button
    │   └── youtube.css        # Scoped UI styles, animations, and feed suppression
    ├── popup/                 # Browser action toolbar popup
    │   ├── popup.html
    │   ├── popup.css
    │   └── popup.js
    └── dashboard/             # Fullscreen management options page
        ├── dashboard.html
        ├── dashboard.css
        └── dashboard.js
```

---

## Development Setup

### Prerequisites
- Google Chrome (version 114 or later recommended)
- Node.js (v20+ recommended for running automated test suites)

### Load Unpacked in Chrome
1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** via the toggle in the top-right corner.
4. Click **Load unpacked** and select the repository root directory.
5. The extension **WatchFlow** will load and appear in your extensions list.

---

## Testing

Run the automated test suite directly from the project root:

```bash
# 1. Run core logic, queue intelligence, and storage unit tests
node tests/test_all_features.mjs

# 2. Run Window Fullscreen 'W' shortcut tests
node tests/test_w_shortcut.mjs

# 3. Run Real-Chrome Learning Queue playlist expansion state tests
node --experimental-websocket tests/test_playlist_expansion_preservation.mjs

# 4. Run Real-Chrome WatchFlow Today title overflow and layout tests
node --experimental-websocket tests/test_queue_title_overflow.mjs
```

For manual step-by-step verification procedures, refer to [TESTING.md](file:///Users/manassurvyawanshi/Downloads/VC%20Projects/Youtube-focus/TESTING.md).

---

## Packaging for Distribution

To create a clean production ZIP package for deployment or manual installation:

```bash
# From repository root:
zip -r watchflow-v1.0.0.zip manifest.json src/
```

*Note: Ensure `manifest.json` is located at the root of the ZIP file.*

---

## Version

**v1.0.0** — Production Release
