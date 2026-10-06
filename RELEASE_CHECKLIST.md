# WatchFlow v1.0.0 — Release Checklist

Pre-flight and verification checklist for the initial production release of **WatchFlow**.

---

## 1. Repository & Version Control
- [x] **Git Repository Initialized**: Verified git repository on primary branch `main`.
- [x] **GitHub Remote Configured**: Configured `origin` pointing to `https://github.com/manassuryawanshi/watchflow.git`.
- [x] **Branch Hygiene**: Working tree verified on `main`, zero detached heads or merge conflicts.

## 2. Security & Secrets
- [x] **Secret Audit Completed**: Audited entire codebase for API keys, tokens, credentials, private keys, and passwords. Zero findings.
- [x] **Production .gitignore Verified**: Excluded environment files (`.env*`), build outputs, system metadata (`.DS_Store`), test automation artifacts, and temporary dumps.

## 3. Extension Architecture & Manifest V3
- [x] **Manifest V3 Specification**: Validated `manifest_version: 3` compliance.
- [x] **Extension Identification**: Name set to `WatchFlow`, version set to `1.0.0`.
- [x] **Least-Privilege Permissions**: Verified minimum required permissions:
  - Permissions: `storage`, `activeTab`
  - Host permissions: `*://*.youtube.com/*`, `*://youtube.com/*`
  - No broad or unnecessary permissions requested (`<all_urls>`, `webRequest`, `cookies`, `tabs`).
- [x] **Component References**: Validated entrypoints for background service worker, content scripts, popup, dashboard, and web accessible resources.

## 4. Brand & Asset Integrity
- [x] **Official Brand Wordmark**: `src/assets/watchflow-wordmark.png` present and verified.
- [x] **Official Boxed Logo**: `src/assets/watchflow-boxed.png` present and verified.
- [x] **Extension Icons**: Complete icon suite present and referenced:
  - `src/icons/icon-16.png` (16x16)
  - `src/icons/icon-32.png` (32x32)
  - `src/icons/icon-48.png` (48x48)
  - `src/icons/icon-128.png` (128x128)
  - `src/icons/icon.svg` (Scalable vector)
- [x] **Image Link Integrity**: Zero broken image paths across popup, dashboard, and injected DOM elements.

## 5. Automated & Real-Chrome Testing
- [x] **Core Unit & Feature Suite** (`tests/test_all_features.mjs`): 10/10 test phases passed.
- [x] **Window Fullscreen 'W' Shortcut Suite** (`tests/test_w_shortcut.mjs`): 11/11 assertions passed.
- [x] **Playlist Expansion Persistence Suite** (`tests/test_playlist_expansion_preservation.mjs`): 11/11 Real-Chrome tests passed.
- [x] **Learning Queue Title Overflow Suite** (`tests/test_queue_title_overflow.mjs`): 6/6 Real-Chrome layout tests passed.

## 6. Console & Runtime Audit
- [x] **Console Audit**: Zero uncaught exceptions, zero unhandled promise rejections, zero `chrome.runtime.lastError`.
- [x] **Debug Gating**: Verbose debug logging gated behind `YTF_LOGGER.debugEnabled`.
- [x] **Observer Hygiene**: MutationObservers defensively structured with debouncing, singletons, and route checks.

## 7. Packaging & Distribution
- [x] **Release ZIP Created**: Built `watchflow-v1.0.0.zip`.
- [x] **ZIP Root Verification**: `manifest.json` located at the root of the archive (not nested in a subfolder).
- [x] **Exclusion Verification**: Zero `.git`, `node_modules`, test artifacts, or logs included in the release package.

## 8. Git Release & Tagging
- [x] **Clean Staging Review**: Only production-ready files staged.
- [x] **Release Commit Created**: Commit message formatted as `release: prepare WatchFlow v1.0.0`.
- [x] **GitHub Push Completed**: Pushed to `origin/main`.
- [x] **Release Tag Created**: Annotated tag `v1.0.0` created and pushed to origin.
