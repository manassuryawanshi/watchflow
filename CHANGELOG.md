# Changelog

All notable changes to the **WatchFlow** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-10-06

### Initial Production Release

#### Added
- **Core Platform**: Manifest V3 compliant extension architecture with zero external runtime dependencies and no remote servers.
- **Focus Mode**:
  - Distraction-free YouTube viewing environment enforcing intentional learning.
  - Strict allowlist security: only queued videos or educational courses are viewable while active.
  - Non-learning videos, search exploration, and recommendation pathways are intercepted with a calming intentional block screen.
  - Algorithmic feeds, related recommendations (`#related`), and promotional end screens suppressed.
  - Shorts suppression and automatic redirection from `/shorts/` to standard player URLs.
  - Floating status pill (`FOCUS MODE ACTIVE`) for quick status inspection and toggling.
  - Global `Alt+F` keyboard shortcut.
- **WatchFlow Today**:
  - Replaces the YouTube recommendation feed on the Home route with an intentional productivity hub.
  - Integrated official WatchFlow brand assets (wordmark and badge).
  - Daily watch-time progress ring tracking intentional study time against configurable daily targets.
  - "Continue Learning" action card directly resuming the next incomplete lesson across all courses.
  - Next-Up lesson preview with single-line title truncation, ellipsis protection, and full title hover tooltips.
  - Direct navigation links to the full Dashboard, Analytics, and Settings.
  - Resilient singleton mount lifecycle surviving SPA route transitions and browser back/forward navigation.
- **Learning Queue & Course Playlists**:
  - Support for both individual YouTube videos and entire multi-part tutorial playlists.
  - Preserved playlist expansion state: open curriculum drawers (`Lessons ▼`) remain open across lesson completions, deletions, and filter changes.
  - Per-playlist state independence (expanding or modifying Course A does not affect Course B).
  - Individual lesson completion checkboxes and lesson deletion controls within playlist drawers.
  - Graceful empty curriculum handling when all lessons in a course are completed or removed.
  - Automatic lesson completion upon reaching a 90% watched threshold.
  - Queue intelligence engine calculating total duration, remaining time, and progress percentages.
  - Filter chips supporting `All`, `Videos`, `Playlists`, `In Progress`, and `Completed`.
- **Window Fullscreen Mode**:
  - Maximize the YouTube player to fill 100% of the browser window viewport without OS-level fullscreen friction.
  - Preserves browser tabs, address bar, and operating system windows.
  - Dedicated player control bar button injected into YouTube controls (`.ytp-right-controls`).
  - Keyboard toggle on `W` (and `Shift+W`) with keyboard repeat and input-typing guards.
  - Instant exit via the `Escape` key.
- **Analytics & Time Management**:
  - Second-by-second local session tracking stored exclusively in `chrome.storage.local`.
  - Overview metrics and visual analytics for Today, Yesterday, Last 7 Days, and Last 30 Days.
  - Configurable daily watch-time limits with soft notifications or hard Cooldown breaks.
  - Scheduled study windows automating Focus Mode activation during dedicated study hours.
  - Complete local data export (JSON) and one-click data wipe controls.
- **Brand Assets**:
  - Official high-resolution WatchFlow typography wordmark (`src/assets/watchflow-wordmark.png`).
  - Official boxed compact logo asset (`src/assets/watchflow-boxed.png`).
  - Complete suite of extension icons (16px, 32px, 48px, 128px, and vector SVG).
